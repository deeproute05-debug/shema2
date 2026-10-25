/*
# Company table (single row) + role-change function + last-owner guard

1. Purpose
   Stores the single company's high-level info (name, description, industry,
   mission, goals, products, size, notes). Enforced as a single row by a guard
   trigger. Also adds the `set_profile_role()` privileged function (owner-only)
   and a trigger that blocks demoting/deleting the last owner.

2. New table
   - `company`
     - `id` (int, primary key, default 1, CHECK = 1) — guarantees single row.
     - `name`, `description`, `industry`, `mission` (text)
     - `goals`, `products`, `notes` (jsonb) — flexible structured content.
     - `size` (text)
     - `updated_at` (timestamptz)

3. New function
   - `set_profile_role(p_user_id uuid, p_role text)` — SECURITY DEFINER, pinned
     search_path. Allows the calling owner (auth.uid() role = 'owner') to change
     a profile's role, or a service-role call (auth.uid() IS NULL) to do so
     (SQL editor / service role). Validates role in ('owner','editor','viewer').
     Blocks demoting the last owner: if changing the only owner to a non-owner
     role, raise an error. EXECUTE revoked from anon; granted to authenticated.

4. New trigger function
   - `protect_last_owner()` — BEFORE UPDATE/DELETE on profiles. If the operation
     would leave zero owners, raise an error. EXECUTE revoked from all clients.

5. Security
   - RLS on `company`: SELECT for authenticated; INSERT/UPDATE/DELETE only for
     is_writer(). (DELETE is effectively unused due to the single-row guard.)
   - `profiles` UPDATE policy from migration 0001 allowed updating own row; here
     we REVOKE table-wide UPDATE from authenticated and GRANT UPDATE only on
     (language), so clients can change only their language. Role changes go
     through set_profile_role().
   - `profiles` has no INSERT/DELETE policy → clients cannot insert or delete
     profiles. Inserts happen only via the auth AFTER INSERT trigger; deletes
     only via ON DELETE CASCADE from auth.users (system-level).

6. Notes
   - Idempotent.
*/

-- ---------- company ----------
CREATE TABLE IF NOT EXISTS public.company (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  name text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  industry text NOT NULL DEFAULT '',
  mission text NOT NULL DEFAULT '',
  goals jsonb NOT NULL DEFAULT '[]'::jsonb,
  products jsonb NOT NULL DEFAULT '[]'::jsonb,
  size text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.company ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS company_touch_updated_at ON public.company;
CREATE TRIGGER company_touch_updated_at
BEFORE UPDATE ON public.company
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- single-row insert guard: only allow insert if table is empty
CREATE OR REPLACE FUNCTION public.enforce_single_company_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  SELECT count(*) INTO v_count FROM public.company;
  IF v_count >= 1 THEN
    RAISE EXCEPTION 'Company already exists. Use UPDATE instead of INSERT.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enforce_single_company_row() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS company_enforce_single_row ON public.company;
CREATE TRIGGER company_enforce_single_row
BEFORE INSERT ON public.company
FOR EACH ROW EXECUTE FUNCTION public.enforce_single_company_row();

-- ---------- set_profile_role ----------
CREATE OR REPLACE FUNCTION public.set_profile_role(p_user_id uuid, p_role text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_caller_is_owner boolean;
  v_target_role text;
  v_owner_count int;
BEGIN
  IF p_role NOT IN ('owner','editor','viewer') THEN
    RAISE EXCEPTION 'Invalid role.' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Owner may call; service role (auth.uid() IS NULL) may call.
  v_caller_is_owner := public.is_owner();
  IF auth.uid() IS NOT NULL AND NOT v_caller_is_owner THEN
    RAISE EXCEPTION 'Only the owner can change roles.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT role INTO v_target_role FROM public.profiles WHERE user_id = p_user_id;
  IF v_target_role IS NULL THEN
    RAISE EXCEPTION 'Profile not found.' USING ERRCODE = 'not_found';
  END IF;

  -- Block demoting the last owner.
  IF v_target_role = 'owner' AND p_role <> 'owner' THEN
    SELECT count(*) INTO v_owner_count
    FROM public.profiles WHERE role = 'owner';
    IF v_owner_count <= 1 THEN
      RAISE EXCEPTION 'Cannot demote the last owner. Promote another user first.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  UPDATE public.profiles SET role = p_role WHERE user_id = p_user_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_profile_role(p_user_id uuid, p_role text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_profile_role(p_user_id uuid, p_role text) TO authenticated;

-- ---------- protect_last_owner trigger ----------
CREATE OR REPLACE FUNCTION public.protect_last_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_owner_count int;
BEGIN
  -- For UPDATE: if an owner is being changed to non-owner, ensure another owner remains.
  IF TG_OP = 'UPDATE' THEN
    IF OLD.role = 'owner' AND NEW.role <> 'owner' THEN
      SELECT count(*) INTO v_owner_count
      FROM public.profiles WHERE role = 'owner' AND user_id <> OLD.user_id;
      IF v_owner_count = 0 THEN
        RAISE EXCEPTION 'Cannot demote the last owner.'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  -- For DELETE: if an owner is being deleted, ensure another owner remains.
  IF TG_OP = 'DELETE' THEN
    IF OLD.role = 'owner' THEN
      SELECT count(*) INTO v_owner_count
      FROM public.profiles WHERE role = 'owner' AND user_id <> OLD.user_id;
      IF v_owner_count = 0 THEN
        RAISE EXCEPTION 'Cannot delete the last owner.'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.protect_last_owner() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS profiles_protect_last_owner ON public.profiles;
CREATE TRIGGER profiles_protect_last_owner
BEFORE UPDATE OR DELETE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_last_owner();

-- ---------- narrow profiles UPDATE to language only ----------
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (language) ON public.profiles TO authenticated;

-- ---------- company policies ----------
DROP POLICY IF EXISTS "company_select_authenticated" ON public.company;
CREATE POLICY "company_select_authenticated"
ON public.company FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "company_insert_writer" ON public.company;
CREATE POLICY "company_insert_writer"
ON public.company FOR INSERT
TO authenticated
WITH CHECK (public.is_writer());

DROP POLICY IF EXISTS "company_update_writer" ON public.company;
CREATE POLICY "company_update_writer"
ON public.company FOR UPDATE
TO authenticated
USING (public.is_writer())
WITH CHECK (public.is_writer());

DROP POLICY IF EXISTS "company_delete_writer" ON public.company;
CREATE POLICY "company_delete_writer"
ON public.company FOR DELETE
TO authenticated
USING (public.is_writer());
