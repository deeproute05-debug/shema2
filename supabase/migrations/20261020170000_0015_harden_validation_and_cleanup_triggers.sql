/*
# Harden validate_node_position_entity and add cleanup triggers

1. Purpose
   - Revoke EXECUTE on validate_node_position_entity from all roles except
     the owner (postgres). Trigger functions are invoked internally by
     PostgreSQL, not by direct role calls, so EXECUTE revocation does not
     affect trigger operation.
   - Add AFTER DELETE triggers on departments and employees that delete
     matching node_positions rows, restoring the cascade behavior lost
     when FKs were replaced by polymorphic validation in migration 0014.

2. Changes
   - REVOKE EXECUTE ON FUNCTION validate_node_position_entity FROM PUBLIC, anon, authenticated.
   - New function cleanup_node_positions_on_dept_delete(): deletes node_positions
     rows where entity_type='department' and entity_id = OLD.id.
   - New function cleanup_node_positions_on_emp_delete(): deletes node_positions
     rows where entity_type='employee' and entity_id = OLD.id.
   - Both functions: REVOKE EXECUTE FROM PUBLIC, anon, authenticated.
   - AFTER DELETE trigger on departments: cleanup_dept_positions.
   - AFTER DELETE trigger on employees: cleanup_emp_positions.

3. Security
   - No changes to RLS, policies, or grants on any table.
   - No changes to auth, signup triggers, or users.

4. Notes
   - Idempotent: uses DROP TRIGGER IF EXISTS, CREATE OR REPLACE FUNCTION.
   - The cleanup functions run as SECURITY INVOKER but are triggered by
     table operations, which execute with table-owner privileges.
*/

REVOKE EXECUTE ON FUNCTION public.validate_node_position_entity() FROM PUBLIC, anon, authenticated;

-- ---------- cleanup function for departments ----------
CREATE OR REPLACE FUNCTION public.cleanup_node_positions_on_dept_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM public.node_positions
  WHERE entity_type = 'department' AND entity_id = OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS cleanup_dept_positions ON public.departments;
CREATE TRIGGER cleanup_dept_positions
AFTER DELETE ON public.departments
FOR EACH ROW EXECUTE FUNCTION public.cleanup_node_positions_on_dept_delete();

-- ---------- cleanup function for employees ----------
CREATE OR REPLACE FUNCTION public.cleanup_node_positions_on_emp_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM public.node_positions
  WHERE entity_type = 'employee' AND entity_id = OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS cleanup_emp_positions ON public.employees;
CREATE TRIGGER cleanup_emp_positions
AFTER DELETE ON public.employees
FOR EACH ROW EXECUTE FUNCTION public.cleanup_node_positions_on_emp_delete();

-- Revoke EXECUTE on both cleanup functions from non-owner roles
REVOKE ALL ON FUNCTION public.cleanup_node_positions_on_dept_delete() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cleanup_node_positions_on_emp_delete() FROM PUBLIC, anon, authenticated;
