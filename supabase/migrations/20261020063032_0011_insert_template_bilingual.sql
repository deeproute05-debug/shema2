/*
# Update insert_template: bilingual support (en/ru)

1. Changes
   - Each template now has separate `name_en` / `name_ru` fields for departments
     and employees, plus `position_en` / `position_ru` for employee positions.
   - The `p_lang` parameter selects which language's names are inserted.
   - If p_lang is not 'ru', defaults to English.
   - Department colors, responsibility zones, and employee duties/responsibility_zone
     remain language-neutral (they are the same in both languages).
   - Responsibility zones also get bilingual treatment via `responsibility_zone_en`/`ru`.

2. Security
   - No changes to grants or SECURITY DEFINER status.
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
  v_lang text := COALESCE(LOWER(p_lang), 'en');
  v_name_field text;
  v_pos_field text;
  v_resp_field text;
BEGIN
  -- 1. Writer check
  IF NOT public.is_writer() THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  -- 2. Idempotency: if data already exists, do nothing
  SELECT count(*) INTO v_count FROM public.departments;
  IF v_count > 0 THEN
    RETURN 'exists';
  END IF;
  SELECT count(*) INTO v_count FROM public.employees;
  IF v_count > 0 THEN
    RETURN 'exists';
  END IF;

  -- 3. Language field selection
  IF v_lang = 'ru' THEN
    v_name_field := 'name_ru';
    v_pos_field := 'position_ru';
    v_resp_field := 'responsibility_zone_ru';
  ELSE
    v_name_field := 'name_en';
    v_pos_field := 'position_en';
    v_resp_field := 'responsibility_zone_en';
  END IF;

  -- 4. Template lookup
  v_depts := NULL;
  v_emps := NULL;

  CASE p_template
    WHEN 'small_business' THEN
      v_depts := '[
        {"id":"d1","name_en":"Owner","name_ru":"Владелец","color":"#2563eb","responsibility_zone_en":"Overall management","responsibility_zone_ru":"Общее управление"}
      ]'::jsonb;
      v_emps := '[
        {"id":"e1","full_name_en":"Owner","full_name_ru":"Владелец","position_en":"Founder","position_ru":"Учредитель","department_id":"d1","manager_id":null,"project_manager_id":null,"is_vacancy":false,"duties":"Run the business","responsibility_zone_en":"Everything","responsibility_zone_ru":"Всё"}
      ]'::jsonb;

    WHEN 'production' THEN
      v_depts := '[
        {"id":"d1","name_en":"Management","name_ru":"Руководство","color":"#2563eb","responsibility_zone_en":"Strategy","responsibility_zone_ru":"Стратегия"},
        {"id":"d2","name_en":"Production","name_ru":"Производство","color":"#16a34a","responsibility_zone_en":"Manufacturing","responsibility_zone_ru":"Производство"},
        {"id":"d3","name_en":"Quality","name_ru":"Качество","color":"#d97706","responsibility_zone_en":"Quality control","responsibility_zone_ru":"Контроль качества"},
        {"id":"d4","name_en":"Logistics","name_ru":"Логистика","color":"#0891b2","responsibility_zone_en":"Shipping","responsibility_zone_ru":"Доставка"}
      ]'::jsonb;
      v_emps := '[
        {"id":"e1","full_name_en":"Director","full_name_ru":"Директор","position_en":"CEO","position_ru":"Директор","department_id":"d1","manager_id":null,"project_manager_id":null,"is_vacancy":false,"duties":"Lead the company","responsibility_zone_en":"All","responsibility_zone_ru":"Все"},
        {"id":"e2","full_name_en":"Plant Manager","full_name_ru":"Начальник цеха","position_en":"Plant Manager","position_ru":"Начальник производства","department_id":"d2","manager_id":"e1","project_manager_id":null,"is_vacancy":false,"duties":"Run production","responsibility_zone_en":"Production floor","responsibility_zone_ru":"Цех"},
        {"id":"e3","full_name_en":"QC Lead","full_name_ru":"Начальник ОТК","position_en":"QC Lead","position_ru":"Начальник контроля качества","department_id":"d3","manager_id":"e1","project_manager_id":null,"is_vacancy":false,"duties":"Quality checks","responsibility_zone_en":"Quality lab","responsibility_zone_ru":"Лаборатория"},
        {"id":"e4","full_name_en":"Logistics Lead","full_name_ru":"Начальник логистики","position_en":"Logistics Lead","position_ru":"Начальник отдела доставки","department_id":"d4","manager_id":"e1","project_manager_id":null,"is_vacancy":false,"duties":"Shipping","responsibility_zone_en":"Warehouse","responsibility_zone_ru":"Склад"},
        {"id":"e5","full_name_en":"","full_name_ru":"","position_en":"Machine Operator","position_ru":"Оператор станка","department_id":"d2","manager_id":"e2","project_manager_id":null,"is_vacancy":true,"duties":"","responsibility_zone_en":"","responsibility_zone_ru":""}
      ]'::jsonb;

    WHEN 'trading' THEN
      v_depts := '[
        {"id":"d1","name_en":"Head Office","name_ru":"Головной офис","color":"#2563eb","responsibility_zone_en":"Management","responsibility_zone_ru":"Управление"},
        {"id":"d2","name_en":"Sales","name_ru":"Продажи","color":"#16a34a","responsibility_zone_en":"Sales","responsibility_zone_ru":"Продажи"},
        {"id":"d3","name_en":"Purchasing","name_ru":"Закупки","color":"#d97706","responsibility_zone_en":"Buying","responsibility_zone_ru":"Закупки"},
        {"id":"d4","name_en":"Warehouse","name_ru":"Склад","color":"#0891b2","responsibility_zone_en":"Storage","responsibility_zone_ru":"Хранение"}
      ]'::jsonb;
      v_emps := '[
        {"id":"e1","full_name_en":"CEO","full_name_ru":"Гендиректор","position_en":"CEO","position_ru":"Генеральный директор","department_id":"d1","manager_id":null,"project_manager_id":null,"is_vacancy":false,"duties":"Lead","responsibility_zone_en":"All","responsibility_zone_ru":"Все"},
        {"id":"e2","full_name_en":"Sales Manager","full_name_ru":"Менеджер по продажам","position_en":"Sales Manager","position_ru":"Руководитель отдела продаж","department_id":"d2","manager_id":"e1","project_manager_id":null,"is_vacancy":false,"duties":"Sales","responsibility_zone_en":"Sales dept","responsibility_zone_ru":"Отдел продаж"},
        {"id":"e3","full_name_en":"Buyer","full_name_ru":"Закупщик","position_en":"Purchasing Manager","position_ru":"Менеджер по закупкам","department_id":"d3","manager_id":"e1","project_manager_id":"e2","is_vacancy":false,"duties":"Buy goods","responsibility_zone_en":"Purchasing","responsibility_zone_ru":"Закупки"},
        {"id":"e4","full_name_en":"Warehouse Manager","full_name_ru":"Заведующий складом","position_en":"Warehouse Manager","position_ru":"Заведующий складом","department_id":"d4","manager_id":"e1","project_manager_id":null,"is_vacancy":false,"duties":"Store goods","responsibility_zone_en":"Warehouse","responsibility_zone_ru":"Склад"}
      ]'::jsonb;

    ELSE
      RAISE EXCEPTION 'unknown_template';
  END CASE;

  -- 5. Insert departments, build id map
  FOR v_dept_rec IN SELECT * FROM jsonb_array_elements(v_depts)
  LOOP
    INSERT INTO public.departments (name, color, responsibility_zone)
    VALUES (
      v_dept_rec ->> v_name_field,
      v_dept_rec->>'color',
      v_dept_rec ->> v_resp_field
    )
    RETURNING id INTO v_new_dept_id;

    v_dept_map := v_dept_map || jsonb_build_object(v_dept_rec->>'id', v_new_dept_id::text);
  END LOOP;

  -- 6. Insert employees (without manager links first), build id map
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
      v_emp_rec ->> ('full_name_' || v_lang),
      v_emp_rec ->> v_pos_field,
      v_real_dept_id,
      (v_emp_rec->>'is_vacancy')::boolean,
      v_emp_rec->>'duties',
      v_emp_rec ->> v_resp_field
    )
    RETURNING id INTO v_new_emp_id;

    v_emp_map := v_emp_map || jsonb_build_object(v_emp_rec->>'id', v_new_emp_id::text);
  END LOOP;

  -- 7. Set manager / project_manager links
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

-- Re-apply grants (CREATE OR REPLACE preserves them, but be explicit)
REVOKE ALL ON FUNCTION public.insert_template(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.insert_template(text, text) TO authenticated;
