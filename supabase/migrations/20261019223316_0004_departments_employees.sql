/*
# Departments and employees tables

1. Purpose
   Stores the company's department tree and its employees (including vacancies).
   These are the core entities the org-structure module edits.

2. New tables
   - `departments`
     - `id` (uuid pk)
     - `parent_id` (uuid self-ref, nullable) — tree structure.
     - `name`, `responsibility_zone`, `desired_result`, `kpis` (text)
     - `color` (text) — hex color for canvas nodes.
     - `photo_path` (text) — storage path / URL.
     - `pos_org`, `pos_matrix` (jsonb) — {x,y} positions on the org/matrix canvas.
     - `pos_free` (jsonb) — free-form canvas positions array.
     - `updated_at` (timestamptz)
   - `employees`
     - `id` (uuid pk)
     - `department_id` (uuid nullable ref departments)
     - `full_name`, `position`, `duties`, `responsibility_zone` (text)
     - `manager_id` (uuid self-ref nullable) — functional manager.
     - `project_manager_id` (uuid self-ref nullable) — project manager.
     - `is_vacancy` (boolean default false) — marks open positions.
     - `photo_path` (text)
     - `pos_org`, `pos_matrix`, `pos_free` (jsonb) — canvas positions.
     - `updated_at` (timestamptz)

3. Security
   - RLS on both: SELECT for authenticated; INSERT/UPDATE/DELETE only for
     is_writer(). Four separate policies per table (no FOR ALL).
   - Self-referential FKs use ON DELETE SET NULL so deleting a manager/parent
     doesn't cascade-destruct the tree.

4. Notes
   - Idempotent.
*/

CREATE TABLE IF NOT EXISTS public.departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  name text NOT NULL DEFAULT '',
  responsibility_zone text NOT NULL DEFAULT '',
  desired_result text NOT NULL DEFAULT '',
  kpis text NOT NULL DEFAULT '',
  color text NOT NULL DEFAULT '#2563eb',
  photo_path text NOT NULL DEFAULT '',
  pos_org jsonb NOT NULL DEFAULT '{"x":0,"y":0}'::jsonb,
  pos_matrix jsonb NOT NULL DEFAULT '{"x":0,"y":0}'::jsonb,
  pos_free jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS departments_touch_updated_at ON public.departments;
CREATE TRIGGER departments_touch_updated_at
BEFORE UPDATE ON public.departments
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  full_name text NOT NULL DEFAULT '',
  position text NOT NULL DEFAULT '',
  duties text NOT NULL DEFAULT '',
  responsibility_zone text NOT NULL DEFAULT '',
  manager_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  project_manager_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  is_vacancy boolean NOT NULL DEFAULT false,
  photo_path text NOT NULL DEFAULT '',
  pos_org jsonb NOT NULL DEFAULT '{"x":0,"y":0}'::jsonb,
  pos_matrix jsonb NOT NULL DEFAULT '{"x":0,"y":0}'::jsonb,
  pos_free jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS employees_touch_updated_at ON public.employees;
CREATE TRIGGER employees_touch_updated_at
BEFORE UPDATE ON public.employees
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---------- departments policies ----------
DROP POLICY IF EXISTS "departments_select_authenticated" ON public.departments;
CREATE POLICY "departments_select_authenticated"
ON public.departments FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "departments_insert_writer" ON public.departments;
CREATE POLICY "departments_insert_writer"
ON public.departments FOR INSERT TO authenticated WITH CHECK (public.is_writer());

DROP POLICY IF EXISTS "departments_update_writer" ON public.departments;
CREATE POLICY "departments_update_writer"
ON public.departments FOR UPDATE TO authenticated
USING (public.is_writer()) WITH CHECK (public.is_writer());

DROP POLICY IF EXISTS "departments_delete_writer" ON public.departments;
CREATE POLICY "departments_delete_writer"
ON public.departments FOR DELETE TO authenticated USING (public.is_writer());

-- ---------- employees policies ----------
DROP POLICY IF EXISTS "employees_select_authenticated" ON public.employees;
CREATE POLICY "employees_select_authenticated"
ON public.employees FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "employees_insert_writer" ON public.employees;
CREATE POLICY "employees_insert_writer"
ON public.employees FOR INSERT TO authenticated WITH CHECK (public.is_writer());

DROP POLICY IF EXISTS "employees_update_writer" ON public.employees;
CREATE POLICY "employees_update_writer"
ON public.employees FOR UPDATE TO authenticated
USING (public.is_writer()) WITH CHECK (public.is_writer());

DROP POLICY IF EXISTS "employees_delete_writer" ON public.employees;
CREATE POLICY "employees_delete_writer"
ON public.employees FOR DELETE TO authenticated USING (public.is_writer());
