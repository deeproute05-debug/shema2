/*
# insert_template SQL function

1. Purpose
   Provides a single-transaction, idempotent way to seed org-structure data
   from a built-in template. The client calls `supabase.rpc('insert_template',
   { p_template: 'production', p_lang: 'en' })` and the function does all the
   work server-side — no sequential client inserts that can leave partial data.

2. Behavior
   - Checks `is_writer()` first — raises 'permission_denied' if the caller is
     not owner/editor.
   - Checks if ANY departments or employees already exist. If so, returns
     'exists' without modifying anything (idempotent, never overwrites).
   - Looks up the template by id in a static JSON map. Raises 'unknown_template'
     if not found.
   - Inserts all departments, then all employees (with manager links resolved
     via a temporary id map), all inside the function's implicit transaction.
     If any insert fails, the whole function body raises and the transaction
     rolls back — no partial data.
   - Returns 'inserted' on success.

3. Security
   - SECURITY DEFINER so it can write to departments/employees regardless of
     the caller's RLS grants (the caller only needs EXECUTE on the function).
   - search_path pinned to 'public'.
   - EXECUTE granted only to `authenticated`; revoked from PUBLIC and anon.

4. Templates
   Three templates are built into the function body as JSON:
   - 'small_business' — 1 dept, 1 employee
   - 'production' — 4 depts, 5 employees (with one vacancy)
   - 'trading' — 4 depts, 4 employees (with a cross-dept project manager link)
*/

CREATE OR REPLACE FUNCTION public.insert_template(p_template text, p_lang text DEFAULT 'en')
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count integer;
  v_depts jsonb;
  v_emps jsonb;
  v_dept_map jsonb := '{}'::jsonb;
  v_dept_rec jsonb;
  v_new_dept_id uuid;
  v_emp_rec jsonb;
  v_new_emp_id uuid;
  v_emp_map jsonb := '{}'::jsonb;
  v_mgr_id text;
  v_pm_id text;
  v_real_mgr_id uuid;
  v_real_pm_id uuid;
  v_real_dept_id uuid;
BEGIN
  -- 1. Writer check
  IF NOT public.is_writer() THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  -- 2. Idempotency: if data already exists, do nothing
  SELECT count(*) INTO v_count FROM public.departments;
  SELECT count(*) INTO v_count FROM public.employees;
  IF v_count > 0 THEN
    RETURN 'exists';
  END IF;
  -- Re-check departments too (both must be empty)
  SELECT count(*) INTO v_count FROM public.departments;
  IF v_count > 0 THEN
    RETURN 'exists';
  END IF;

  -- 3. Template lookup
  v_depts := NULL;
  v_emps := NULL;

  CASE p_template
    WHEN 'small_business' THEN
      v_depts := '[
        {"id":"d1","name":"Owner","color":"#2563eb","responsibility_zone":"Overall management"}
      ]'::jsonb;
      v_emps := '[
        {"id":"e1","full_name":"Owner","position":"Founder","department_id":"d1","manager_id":null,"project_manager_id":null,"is_vacancy":false,"duties":"Run the business","responsibility_zone":"Everything"}
      ]'::jsonb;

    WHEN 'production' THEN
      v_depts := '[
        {"id":"d1","name":"Management","color":"#2563eb","responsibility_zone":"Strategy"},
        {"id":"d2","name":"Production","color":"#16a34a","responsibility_zone":"Manufacturing"},
        {"id":"d3","name":"Quality","color":"#d97706","responsibility_zone":"Quality control"},
        {"id":"d4","name":"Logistics","color":"#0891b2","responsibility_zone":"Shipping"}
      ]'::jsonb;
      v_emps := '[
        {"id":"e1","full_name":"Director","position":"CEO","department_id":"d1","manager_id":null,"project_manager_id":null,"is_vacancy":false,"duties":"Lead the company","responsibility_zone":"All"},
        {"id":"e2","full_name":"Plant Manager","position":"Plant Manager","department_id":"d2","manager_id":"e1","project_manager_id":null,"is_vacancy":false,"duties":"Run production","responsibility_zone":"Production floor"},
        {"id":"e3","full_name":"QC Lead","position":"QC Lead","department_id":"d3","manager_id":"e1","project_manager_id":null,"is_vacancy":false,"duties":"Quality checks","responsibility_zone":"Quality lab"},
        {"id":"e4","full_name":"Logistics Lead","position":"Logistics Lead","department_id":"d4","manager_id":"e1","project_manager_id":null,"is_vacancy":false,"duties":"Shipping","responsibility_zone":"Warehouse"},
        {"id":"e5","full_name":"","position":"Machine Operator","department_id":"d2","manager_id":"e2","project_manager_id":null,"is_vacancy":true,"duties":"","responsibility_zone":""}
      ]'::jsonb;

    WHEN 'trading' THEN
      v_depts := '[
        {"id":"d1","name":"Head Office","color":"#2563eb","responsibility_zone":"Management"},
        {"id":"d2","name":"Sales","color":"#16a34a","responsibility_zone":"Sales"},
        {"id":"d3","name":"Purchasing","color":"#d97706","responsibility_zone":"Buying"},
        {"id":"d4","name":"Warehouse","color":"#0891b2","responsibility_zone":"Storage"}
      ]'::jsonb;
      v_emps := '[
        {"id":"e1","full_name":"CEO","position":"CEO","department_id":"d1","manager_id":null,"project_manager_id":null,"is_vacancy":false,"duties":"Lead","responsibility_zone":"All"},
        {"id":"e2","full_name":"Sales Manager","position":"Sales Manager","department_id":"d2","manager_id":"e1","project_manager_id":null,"is_vacancy":false,"duties":"Sales","responsibility_zone":"Sales dept"},
        {"id":"e3","full_name":"Buyer","position":"Purchasing Manager","department_id":"d3","manager_id":"e1","project_manager_id":"e2","is_vacancy":false,"duties":"Buy goods","responsibility_zone":"Purchasing"},
        {"id":"e4","full_name":"Warehouse Manager","position":"Warehouse Manager","department_id":"d4","manager_id":"e1","project_manager_id":null,"is_vacancy":false,"duties":"Store goods","responsibility_zone":"Warehouse"}
      ]'::jsonb;

    ELSE
      RAISE EXCEPTION 'unknown_template';
  END CASE;

  -- 4. Insert departments, build id map
  FOR v_dept_rec IN SELECT * FROM jsonb_array_elements(v_depts)
  LOOP
    INSERT INTO public.departments (name, color, responsibility_zone)
    VALUES (
      v_dept_rec->>'name',
      v_dept_rec->>'color',
      v_dept_rec->>'responsibility_zone'
    )
    RETURNING id INTO v_new_dept_id;

    v_dept_map := v_dept_map || jsonb_build_object(v_dept_rec->>'id', v_new_dept_id::text);
  END LOOP;

  -- 5. Insert employees (without manager links first), build id map
  FOR v_emp_rec IN SELECT * FROM jsonb_array_elements(v_emps)
  LOOP
    v_real_dept_id := NULL;
    IF v_emp_rec->>'department_id' IS NOT NULL THEN
      v_real_dept_id := (v_dept_map ->> (v_emp_rec->>'department_id'))::uuid;
    END IF;

    INSERT INTO public.employees (
      full_name, position, department_id, is_vacancy,
      duties, responsibility_zone
    )
    VALUES (
      v_emp_rec->>'full_name',
      v_emp_rec->>'position',
      v_real_dept_id,
      (v_emp_rec->>'is_vacancy')::boolean,
      v_emp_rec->>'duties',
      v_emp_rec->>'responsibility_zone'
    )
    RETURNING id INTO v_new_emp_id;

    v_emp_map := v_emp_map || jsonb_build_object(v_emp_rec->>'id', v_new_emp_id::text);
  END LOOP;

  -- 6. Set manager / project_manager links
  FOR v_emp_rec IN SELECT * FROM jsonb_array_elements(v_emps)
  LOOP
    v_real_mgr_id := NULL;
    v_real_pm_id := NULL;

    v_mgr_id := v_emp_rec->>'manager_id';
    IF v_mgr_id IS NOT NULL AND v_mgr_id <> '' THEN
      v_real_mgr_id := (v_emp_map ->> v_mgr_id)::uuid;
    END IF;

    v_pm_id := v_emp_rec->>'project_manager_id';
    IF v_pm_id IS NOT NULL AND v_pm_id <> '' THEN
      v_real_pm_id := (v_emp_map ->> v_pm_id)::uuid;
    END IF;

    IF v_real_mgr_id IS NOT NULL OR v_real_pm_id IS NOT NULL THEN
      UPDATE public.employees
      SET manager_id = v_real_mgr_id,
          project_manager_id = v_real_pm_id
      WHERE id = (v_emp_map ->> (v_emp_rec->>'id'))::uuid;
    END IF;
  END LOOP;

  RETURN 'inserted';
END;
$$;

-- 7. Grants: only authenticated can call this function
REVOKE ALL ON FUNCTION public.insert_template(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.insert_template(text, text) TO authenticated;
