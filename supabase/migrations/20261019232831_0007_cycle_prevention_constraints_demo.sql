/*
# Cycle prevention, length constraints, and demo data loader

1. Purpose
   - Add CHECK constraints for max lengths matching client zod rules.
   - Add BEFORE INSERT/UPDATE triggers that prevent:
     a) A department from being its own ancestor (any depth cycle).
     b) An employee from managing themselves (self-loop).
     c) Loops in manager_id and project_manager_id chains.
   - Add a trigger that blocks deleting a department with children/employees.
   - Add a `load_demo_data()` function (owner/editor callable) that inserts a
     demo company, ~3 departments, ~8 employees (including one vacancy).
     Idempotent: does nothing if company already exists.

2. Security
   - No RLS changes — existing policies stay as-is.
   - Trigger functions: EXECUTE revoked from PUBLIC, anon, authenticated.
   - `load_demo_data()`: SECURITY DEFINER, EXECUTE to authenticated (checks
     is_writer() internally).

3. Notes
   - Idempotent (CREATE OR REPLACE / IF NOT EXISTS / DROP IF EXISTS).
*/

-- ---------- length constraints ----------

ALTER TABLE public.company
  DROP CONSTRAINT IF EXISTS company_name_max,
  ADD CONSTRAINT company_name_max CHECK (char_length(name) <= 200),
  DROP CONSTRAINT IF EXISTS company_description_max,
  ADD CONSTRAINT company_description_max CHECK (char_length(description) <= 2000),
  DROP CONSTRAINT IF EXISTS company_industry_max,
  ADD CONSTRAINT company_industry_max CHECK (char_length(industry) <= 200),
  DROP CONSTRAINT IF EXISTS company_mission_max,
  ADD CONSTRAINT company_mission_max CHECK (char_length(mission) <= 2000),
  DROP CONSTRAINT IF EXISTS company_size_max,
  ADD CONSTRAINT company_size_max CHECK (char_length(size) <= 100),
  DROP CONSTRAINT IF EXISTS company_notes_max,
  ADD CONSTRAINT company_notes_max CHECK (char_length(notes) <= 4000);

ALTER TABLE public.departments
  DROP CONSTRAINT IF EXISTS departments_name_not_empty,
  ADD CONSTRAINT departments_name_not_empty CHECK (name <> ''),
  DROP CONSTRAINT IF EXISTS departments_name_max,
  ADD CONSTRAINT departments_name_max CHECK (char_length(name) <= 200),
  DROP CONSTRAINT IF EXISTS departments_responsibility_zone_max,
  ADD CONSTRAINT departments_responsibility_zone_max CHECK (char_length(responsibility_zone) <= 2000),
  DROP CONSTRAINT IF EXISTS departments_desired_result_max,
  ADD CONSTRAINT departments_desired_result_max CHECK (char_length(desired_result) <= 2000),
  DROP CONSTRAINT IF EXISTS departments_kpis_max,
  ADD CONSTRAINT departments_kpis_max CHECK (char_length(kpis) <= 4000),
  DROP CONSTRAINT IF EXISTS departments_color_max,
  ADD CONSTRAINT departments_color_max CHECK (char_length(color) <= 20);

ALTER TABLE public.employees
  DROP CONSTRAINT IF EXISTS employees_full_name_max,
  ADD CONSTRAINT employees_full_name_max CHECK (char_length(full_name) <= 300),
  DROP CONSTRAINT IF EXISTS employees_position_max,
  ADD CONSTRAINT employees_position_max CHECK (char_length(position) <= 200),
  DROP CONSTRAINT IF EXISTS employees_duties_max,
  ADD CONSTRAINT employees_duties_max CHECK (char_length(duties) <= 2000),
  DROP CONSTRAINT IF EXISTS employees_responsibility_zone_max,
  ADD CONSTRAINT employees_responsibility_zone_max CHECK (char_length(responsibility_zone) <= 2000),
  DROP CONSTRAINT IF EXISTS employees_vacancy_name_rule,
  ADD CONSTRAINT employees_vacancy_name_rule CHECK (
    (is_vacancy = true) OR (char_length(full_name) > 0)
  );

-- ---------- department cycle prevention ----------

CREATE OR REPLACE FUNCTION public.prevent_department_cycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_current uuid;
  v_depth int := 0;
BEGIN
  IF NEW.parent_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.parent_id = NEW.id THEN
    RAISE EXCEPTION 'Department cannot be its own parent.'
      USING ERRCODE = 'check_violation';
  END IF;

  v_current := NEW.parent_id;
  WHILE v_current IS NOT NULL AND v_depth < 100 LOOP
    IF v_current = NEW.id THEN
      RAISE EXCEPTION 'Department cannot be its own ancestor (cycle detected).'
        USING ERRCODE = 'check_violation';
    END IF;
    SELECT parent_id INTO v_current FROM public.departments WHERE id = v_current;
    v_depth := v_depth + 1;
  END LOOP;

  IF v_depth >= 100 THEN
    RAISE EXCEPTION 'Department tree is too deep (max 100 levels).'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.prevent_department_cycle() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS departments_prevent_cycle ON public.departments;
CREATE TRIGGER departments_prevent_cycle
BEFORE INSERT OR UPDATE OF parent_id ON public.departments
FOR EACH ROW EXECUTE FUNCTION public.prevent_department_cycle();

-- ---------- employee self-manager + manager loop prevention ----------

CREATE OR REPLACE FUNCTION public.prevent_employee_manager_cycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_current uuid;
  v_depth int := 0;
BEGIN
  IF NEW.manager_id = NEW.id THEN
    RAISE EXCEPTION 'Employee cannot manage themselves.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.project_manager_id = NEW.id THEN
    RAISE EXCEPTION 'Employee cannot be their own project manager.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.manager_id IS NOT NULL THEN
    v_current := NEW.manager_id;
    WHILE v_current IS NOT NULL AND v_depth < 100 LOOP
      IF v_current = NEW.id THEN
        RAISE EXCEPTION 'Manager assignment would create a cycle.'
          USING ERRCODE = 'check_violation';
      END IF;
      SELECT manager_id INTO v_current FROM public.employees WHERE id = v_current;
      v_depth := v_depth + 1;
    END LOOP;
  END IF;

  IF NEW.project_manager_id IS NOT NULL THEN
    v_current := NEW.project_manager_id;
    v_depth := 0;
    WHILE v_current IS NOT NULL AND v_depth < 100 LOOP
      IF v_current = NEW.id THEN
        RAISE EXCEPTION 'Project manager assignment would create a cycle.'
          USING ERRCODE = 'check_violation';
      END IF;
      SELECT project_manager_id INTO v_current FROM public.employees WHERE id = v_current;
      v_depth := v_depth + 1;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.prevent_employee_manager_cycle() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS employees_prevent_manager_cycle ON public.employees;
CREATE TRIGGER employees_prevent_manager_cycle
BEFORE INSERT OR UPDATE OF manager_id, project_manager_id ON public.employees
FOR EACH ROW EXECUTE FUNCTION public.prevent_employee_manager_cycle();

-- ---------- block department delete with children ----------

CREATE OR REPLACE FUNCTION public.block_department_delete_with_children()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_child_count int;
  v_emp_count int;
BEGIN
  SELECT count(*) INTO v_child_count FROM public.departments WHERE parent_id = OLD.id;
  IF v_child_count > 0 THEN
    RAISE EXCEPTION 'Cannot delete department with sub-departments. Move them first.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*) INTO v_emp_count FROM public.employees WHERE department_id = OLD.id;
  IF v_emp_count > 0 THEN
    RAISE EXCEPTION 'Cannot delete department with employees. Move them first.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN OLD;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.block_department_delete_with_children() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS departments_block_delete_with_children ON public.departments;
CREATE TRIGGER departments_block_delete_with_children
BEFORE DELETE ON public.departments
FOR EACH ROW EXECUTE FUNCTION public.block_department_delete_with_children();

-- ---------- demo data loader ----------

CREATE OR REPLACE FUNCTION public.load_demo_data()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_company_count int;
  v_dept_root uuid;
  v_dept_eng uuid;
  v_dept_sales uuid;
  v_dept_hr uuid;
  v_ceo_id uuid;
  v_cto_id uuid;
  v_sales_lead_id uuid;
  v_hr_id uuid;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_writer() THEN
    RAISE EXCEPTION 'Only owners and editors can load demo data.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT count(*) INTO v_company_count FROM public.company;
  IF v_company_count > 0 THEN
    RETURN 'exists';
  END IF;

  INSERT INTO public.company (id, name, description, industry, mission, size, notes)
  VALUES (1, 'Acme Demo', 'Demo company to explore the app.',
          'Technology', 'Help teams work more effectively.', '11-50', '')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.departments (name, parent_id, responsibility_zone, desired_result, kpis, color)
  VALUES ('Headquarters', NULL, 'General management and strategy', 'Company growth', 'Revenue, team growth', '#2563eb')
  RETURNING id INTO v_dept_root;

  INSERT INTO public.departments (name, parent_id, responsibility_zone, desired_result, kpis, color)
  VALUES ('Engineering', v_dept_root, 'Build and maintain the product', 'Weekly stable release', 'Delivery speed, bugs', '#16a34a')
  RETURNING id INTO v_dept_eng;

  INSERT INTO public.departments (name, parent_id, responsibility_zone, desired_result, kpis, color)
  VALUES ('Sales', v_dept_root, 'Acquire and retain customers', '20% revenue growth', 'MRR, churn', '#d97706')
  RETURNING id INTO v_dept_sales;

  INSERT INTO public.departments (name, parent_id, responsibility_zone, desired_result, kpis, color)
  VALUES ('HR', v_dept_root, 'Hiring and team development', 'Fill roles on time', 'Time-to-hire, retention', '#0891b2')
  RETURNING id INTO v_dept_hr;

  -- CEO (root manager)
  INSERT INTO public.employees (full_name, position, department_id, duties, responsibility_zone, manager_id, is_vacancy)
  VALUES ('John Smith', 'CEO', v_dept_root, 'Strategy, hiring key people', 'Whole company', NULL, false)
  RETURNING id INTO v_ceo_id;

  -- CTO (reports to CEO)
  INSERT INTO public.employees (full_name, position, department_id, duties, responsibility_zone, manager_id, is_vacancy)
  VALUES ('Jane Doe', 'CTO', v_dept_eng, 'Technical leadership', 'Engineering', v_ceo_id, false)
  RETURNING id INTO v_cto_id;

  -- Engineers (report to CTO)
  INSERT INTO public.employees (full_name, position, department_id, duties, responsibility_zone, manager_id, is_vacancy)
  VALUES ('Bob Lee', 'Senior Developer', v_dept_eng, 'Core product development', 'Engineering', v_cto_id, false);

  INSERT INTO public.employees (full_name, position, department_id, duties, responsibility_zone, manager_id, is_vacancy)
  VALUES ('Mary Kim', 'QA Engineer', v_dept_eng, 'Testing and quality control', 'Engineering', v_cto_id, false);

  -- Sales lead (reports to CEO)
  INSERT INTO public.employees (full_name, position, department_id, duties, responsibility_zone, manager_id, is_vacancy)
  VALUES ('Tom Wilson', 'Head of Sales', v_dept_sales, 'Manage sales team', 'Sales', v_ceo_id, false)
  RETURNING id INTO v_sales_lead_id;

  INSERT INTO public.employees (full_name, position, department_id, duties, responsibility_zone, manager_id, is_vacancy)
  VALUES ('Sara Brown', 'Sales Manager', v_dept_sales, 'Work with clients', 'Sales', v_sales_lead_id, false);

  -- HR (reports to CEO)
  INSERT INTO public.employees (full_name, position, department_id, duties, responsibility_zone, manager_id, is_vacancy)
  VALUES ('Emma Davis', 'HR Manager', v_dept_hr, 'Hiring and onboarding', 'HR', v_ceo_id, false)
  RETURNING id INTO v_hr_id;

  -- Vacancy (reports to HR)
  INSERT INTO public.employees (full_name, position, department_id, duties, responsibility_zone, manager_id, is_vacancy)
  VALUES ('', 'Senior Product Manager', v_dept_root, 'Manage product backlog', 'Product', v_hr_id, true);

  RETURN 'loaded';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.load_demo_data() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.load_demo_data() TO authenticated;
