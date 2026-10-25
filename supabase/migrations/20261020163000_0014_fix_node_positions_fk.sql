/*
# Fix node_positions foreign keys

The original migration 0013 added two separate FK constraints on entity_id —
one to departments and one to employees. A single column cannot satisfy both
FKs simultaneously (the value must exist in BOTH tables, which is impossible).

1. Changes
   - Drop both FK constraints.
   - Add a BEFORE INSERT/UPDATE trigger that validates entity_id exists in
     the appropriate table (departments for 'department', employees for 'employee').
   - This replaces FK-based validation with a polymorphic trigger check.
   - No changes to RLS, policies, or grants.

2. Notes
   - ON DELETE CASCADE is lost. The app should delete positions when
     entities are deleted, or a cleanup trigger can be added later.
*/

ALTER TABLE public.node_positions
  DROP CONSTRAINT IF EXISTS node_positions_entity_id_fkey_dept;

ALTER TABLE public.node_positions
  DROP CONSTRAINT IF EXISTS node_positions_entity_id_fkey_emp;

CREATE OR REPLACE FUNCTION public.validate_node_position_entity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.entity_type = 'department' THEN
    IF NOT EXISTS (SELECT 1 FROM public.departments WHERE id = NEW.entity_id) THEN
      RAISE EXCEPTION 'entity_not_found';
    END IF;
  ELSIF NEW.entity_type = 'employee' THEN
    IF NOT EXISTS (SELECT 1 FROM public.employees WHERE id = NEW.entity_id) THEN
      RAISE EXCEPTION 'entity_not_found';
    END IF;
  ELSE
    RAISE EXCEPTION 'invalid_entity_type';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS node_positions_validate_entity ON public.node_positions;
CREATE TRIGGER node_positions_validate_entity
BEFORE INSERT OR UPDATE ON public.node_positions
FOR EACH ROW EXECUTE FUNCTION public.validate_node_position_entity();

REVOKE ALL ON FUNCTION public.validate_node_position_entity() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.validate_node_position_entity() TO authenticated;
