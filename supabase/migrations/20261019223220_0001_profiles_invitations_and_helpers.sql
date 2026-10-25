/*
# Profiles, invitations, and access helper functions

1. Purpose
   This migration establishes the foundation of an invite-only, role-based access
   model for a single-company org-structure application. It creates the `profiles`
   table (one row per authenticated user, carrying their role and UI language) and
   the `invitations` table (owner-issued email invitations that gate new sign-ups).
   It also creates two `SECURITY DEFINER` helper functions, `is_owner()` and
   `is_writer()`, that the rest of the schema's row-level policies will call to
   decide whether the current caller may write data.

2. New tables
   - `profiles`
     - `user_id` (uuid, primary key, references auth.users) — the auth user.
     - `role` (text, not null) — one of 'owner' | 'editor' | 'viewer'.
     - `language` (text, not null, default 'ru') — UI language preference.
     - `updated_at` (timestamptz) — maintained by a trigger.
   - `invitations`
     - `email` (text, primary key, stored lowercase) — the invited email.
     - `role` (text, not null) — 'editor' | 'viewer' (owners are only the first user).
     - `created_by` (uuid, references auth.users) — the owner who invited.
     - `used` (boolean, default false) — claimed by a successful sign-up.
     - `updated_at` (timestamptz) — maintained by a trigger.

3. Helper functions (SECURITY DEFINER, pinned search_path)
   - `is_owner()` — returns true if the current caller's profile role is 'owner'.
   - `is_writer()` — returns true if the current caller's role is 'owner' or 'editor'.
   Both EXECUTE only for `authenticated`; revoked from `PUBLIC` and `anon`.

4. Security
   - RLS enabled on `profiles` and `invitations`.
   - `profiles` SELECT: any authenticated user can read all profiles (team list).
   - `profiles` UPDATE: users may update only their own row, and only the
     `language` column (column-level grant restricts this further in a later
     migration). Role changes are handled by a privileged function, not client SQL.
   - No client INSERT/DELETE on `profiles` — those are created/removed only by
     auth triggers (insert) and owner functions (delete).
   - `invitations`: owner-only CRUD (SELECT/INSERT/UPDATE/DELETE) via is_owner().

5. Notes
   - This migration is idempotent: tables use IF NOT EXISTS, policies are dropped
     before recreate.
   - The auth.users BEFORE/AFTER INSERT triggers that actually create profile rows
     and mark invitations used are created in migration 0002.
*/

-- ---------- profiles ----------
CREATE TABLE IF NOT EXISTS public.profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner','editor','viewer')),
  language text NOT NULL DEFAULT 'ru' CHECK (language IN ('ru','en','ar')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- updated_at maintainer
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS profiles_touch_updated_at ON public.profiles;
CREATE TRIGGER profiles_touch_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---------- invitations ----------
CREATE TABLE IF NOT EXISTS public.invitations (
  email text PRIMARY KEY,
  role text NOT NULL CHECK (role IN ('editor','viewer')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  used boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS invitations_touch_updated_at ON public.invitations;
CREATE TRIGGER invitations_touch_updated_at
BEFORE UPDATE ON public.invitations
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---------- helper functions ----------
CREATE OR REPLACE FUNCTION public.is_owner()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid() AND profiles.role = 'owner'
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_owner() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_owner() TO authenticated;

CREATE OR REPLACE FUNCTION public.is_writer()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid() AND profiles.role IN ('owner','editor')
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_writer() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_writer() TO authenticated;

-- ---------- profiles policies ----------
DROP POLICY IF EXISTS "profiles_select_authenticated" ON public.profiles;
CREATE POLICY "profiles_select_authenticated"
ON public.profiles FOR SELECT
TO authenticated
USING (true);

-- Only the owner of the row may update; column grant later restricts to language.
DROP POLICY IF EXISTS "profiles_update_own_language" ON public.profiles;
CREATE POLICY "profiles_update_own_language"
ON public.profiles FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- ---------- invitations policies (owner only) ----------
DROP POLICY IF EXISTS "invitations_select_owner" ON public.invitations;
CREATE POLICY "invitations_select_owner"
ON public.invitations FOR SELECT
TO authenticated
USING (public.is_owner());

DROP POLICY IF EXISTS "invitations_insert_owner" ON public.invitations;
CREATE POLICY "invitations_insert_owner"
ON public.invitations FOR INSERT
TO authenticated
WITH CHECK (public.is_owner());

DROP POLICY IF EXISTS "invitations_update_owner" ON public.invitations;
CREATE POLICY "invitations_update_owner"
ON public.invitations FOR UPDATE
TO authenticated
USING (public.is_owner())
WITH CHECK (public.is_owner());

DROP POLICY IF EXISTS "invitations_delete_owner" ON public.invitations;
CREATE POLICY "invitations_delete_owner"
ON public.invitations FOR DELETE
TO authenticated
USING (public.is_owner());
