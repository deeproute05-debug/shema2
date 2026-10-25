/*
# Fix: load_demo_data accepts language parameter

Replaces load_demo_data() with a version that accepts p_lang ('ru'|'en')
and inserts demo data in the requested language. All other behavior
(idempotency, is_writer check) is unchanged.
*/

CREATE OR REPLACE FUNCTION public.load_demo_data(p_lang text DEFAULT 'en')
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
  v_lang text := COALESCE(p_lang, 'en');
BEGIN
  IF v_lang NOT IN ('ru', 'en') THEN
    v_lang := 'en';
  END IF;

  IF auth.uid() IS NOT NULL AND NOT public.is_writer() THEN
    RAISE EXCEPTION 'Only owners and editors can load demo data.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT count(*) INTO v_company_count FROM public.company;
  IF v_company_count > 0 THEN
    RETURN 'exists';
  END IF;

  IF v_lang = 'ru' THEN
    INSERT INTO public.company (id, name, description, industry, mission, size, notes)
    VALUES (1, 'Acme Демо', 'Демонстрационная компания для знакомства с приложением.',
            'Технологии', 'Помогать командам работать эффективнее.', '11–50', '');

    INSERT INTO public.departments (name, parent_id, responsibility_zone, desired_result, kpis, color)
    VALUES ('Главный офис', NULL, 'Общее управление и стратегия', 'Рост компании', 'Выручка, рост команды', '#2563eb')
    RETURNING id INTO v_dept_root;

    INSERT INTO public.departments (name, parent_id, responsibility_zone, desired_result, kpis, color)
    VALUES ('Разработка', v_dept_root, 'Создание и поддержка продукта', 'Стабильный релиз каждую неделю', 'Скорость доставки, баги', '#16a34a')
    RETURNING id INTO v_dept_eng;

    INSERT INTO public.departments (name, parent_id, responsibility_zone, desired_result, kpis, color)
    VALUES ('Продажи', v_dept_root, 'Привлечение и удержание клиентов', 'Рост выручки на 20%', 'MRR, отток клиентов', '#d97706')
    RETURNING id INTO v_dept_sales;

    INSERT INTO public.departments (name, parent_id, responsibility_zone, desired_result, kpis, color)
    VALUES ('Кадры', v_dept_root, 'Найм и развитие команды', 'Закрыть вакансии вовремя', 'Time-to-hire, удержание', '#0891b2')
    RETURNING id INTO v_dept_hr;

    INSERT INTO public.employees (full_name, position, department_id, duties, responsibility_zone, manager_id, is_vacancy)
    VALUES ('Иван Петров', 'Генеральный директор', v_dept_root, 'Стратегия, найм ключевых людей', 'Вся компания', NULL, false)
    RETURNING id INTO v_ceo_id;

    INSERT INTO public.employees (full_name, position, department_id, duties, responsibility_zone, manager_id, is_vacancy)
    VALUES ('Анна Сидорова', 'CTO', v_dept_eng, 'Техническое руководство', 'Разработка', v_ceo_id, false)
    RETURNING id INTO v_cto_id;

    INSERT INTO public.employees (full_name, position, department_id, duties, responsibility_zone, manager_id, is_vacancy)
    VALUES ('Дмитрий Козлов', 'Senior разработчик', v_dept_eng, 'Разработка ядра продукта', 'Разработка', v_cto_id, false);

    INSERT INTO public.employees (full_name, position, department_id, duties, responsibility_zone, manager_id, is_vacancy)
    VALUES ('Мария Новикова', 'QA инженер', v_dept_eng, 'Тестирование и контроль качества', 'Разработка', v_cto_id, false);

    INSERT INTO public.employees (full_name, position, department_id, duties, responsibility_zone, manager_id, is_vacancy)
    VALUES ('Сергей Волков', 'Руководитель продаж', v_dept_sales, 'Управление отделом продаж', 'Продажи', v_ceo_id, false)
    RETURNING id INTO v_sales_lead_id;

    INSERT INTO public.employees (full_name, position, department_id, duties, responsibility_zone, manager_id, is_vacancy)
    VALUES ('Ольга Морозова', 'Менеджер по продажам', v_dept_sales, 'Работа с клиентами', 'Продажи', v_sales_lead_id, false);

    INSERT INTO public.employees (full_name, position, department_id, duties, responsibility_zone, manager_id, is_vacancy)
    VALUES ('Елена Зайцева', 'HR-менеджер', v_dept_hr, 'Найм и онбординг', 'Кадры', v_ceo_id, false)
    RETURNING id INTO v_hr_id;

    INSERT INTO public.employees (full_name, position, department_id, duties, responsibility_zone, manager_id, is_vacancy)
    VALUES ('', 'Senior Product Manager', v_dept_root, 'Управление продуктовым бэклогом', 'Продукт', v_hr_id, true);
  ELSE
    INSERT INTO public.company (id, name, description, industry, mission, size, notes)
    VALUES (1, 'Acme Demo', 'Demo company to explore the app.',
            'Technology', 'Help teams work more effectively.', '11-50', '');

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

    INSERT INTO public.employees (full_name, position, department_id, duties, responsibility_zone, manager_id, is_vacancy)
    VALUES ('John Smith', 'CEO', v_dept_root, 'Strategy, hiring key people', 'Whole company', NULL, false)
    RETURNING id INTO v_ceo_id;

    INSERT INTO public.employees (full_name, position, department_id, duties, responsibility_zone, manager_id, is_vacancy)
    VALUES ('Jane Doe', 'CTO', v_dept_eng, 'Technical leadership', 'Engineering', v_ceo_id, false)
    RETURNING id INTO v_cto_id;

    INSERT INTO public.employees (full_name, position, department_id, duties, responsibility_zone, manager_id, is_vacancy)
    VALUES ('Bob Lee', 'Senior Developer', v_dept_eng, 'Core product development', 'Engineering', v_cto_id, false);

    INSERT INTO public.employees (full_name, position, department_id, duties, responsibility_zone, manager_id, is_vacancy)
    VALUES ('Mary Kim', 'QA Engineer', v_dept_eng, 'Testing and quality control', 'Engineering', v_cto_id, false);

    INSERT INTO public.employees (full_name, position, department_id, duties, responsibility_zone, manager_id, is_vacancy)
    VALUES ('Tom Wilson', 'Head of Sales', v_dept_sales, 'Manage sales team', 'Sales', v_ceo_id, false)
    RETURNING id INTO v_sales_lead_id;

    INSERT INTO public.employees (full_name, position, department_id, duties, responsibility_zone, manager_id, is_vacancy)
    VALUES ('Sara Brown', 'Sales Manager', v_dept_sales, 'Work with clients', 'Sales', v_sales_lead_id, false);

    INSERT INTO public.employees (full_name, position, department_id, duties, responsibility_zone, manager_id, is_vacancy)
    VALUES ('Emma Davis', 'HR Manager', v_dept_hr, 'Hiring and onboarding', 'HR', v_ceo_id, false)
    RETURNING id INTO v_hr_id;

    INSERT INTO public.employees (full_name, position, department_id, duties, responsibility_zone, manager_id, is_vacancy)
    VALUES ('', 'Senior Product Manager', v_dept_root, 'Manage product backlog', 'Product', v_hr_id, true);
  END IF;

  RETURN 'loaded';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.load_demo_data(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.load_demo_data(text) TO authenticated;
