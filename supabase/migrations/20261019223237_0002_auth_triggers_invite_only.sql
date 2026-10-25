/*
# Auth gating: invite-only sign-up + automatic profile creation

1. Purpose
   Enforces invite-only sign-up at the database layer and creates a `profiles`
   row automatically when a new auth user is created. This is the backstop for
   the provider-level "disable public sign-up" setting in the Bolt database
   Authentication UI (which the owner must also turn off manually; I cannot
   toggle it with my tools). If the provider is ever re-enabled, this trigger
   still blocks uninvited sign-ups.

2. Functions
   - `public.enforce_invite_only_signup()` — BEFORE INSERT trigger on auth.users.
     Allows the insert only when ONE of the following is true:
       a) `profiles` is empty (this is the first user → becomes 'owner'); OR
       b) the new user's email exists in `invitations` with `used = false`.
     Otherwise raises a clear error: 'Sign-up is invite-only. Ask an owner to
     invite your email.' This function is NOT callable by clients — EXECUTE is
     revoked from PUBLIC, anon, and authenticated; it only runs as a trigger.
   - `public.create_profile_on_signup()` — AFTER INSERT trigger on auth.users.
     Inserts a row into `profiles`:
       - If `profiles` was empty before this insert → role = 'owner'.
       - Else → role = the role from the matching invitation (default 'viewer'
         if somehow missing), and atomically marks that invitation `used = true`.
     EXECUTE revoked from PUBLIC, anon, authenticated.

3. Triggers
   - `auth.users_before_insert_invite_only` BEFORE INSERT ON auth.users.
   - `auth.users_after_insert_create_profile` AFTER INSERT ON auth.users.

4. Security
   - Trigger functions run with the privileges of their owner (postgres), so they
     can read/write `profiles` and `invitations` regardless of RLS.
   - EXECUTE is revoked from all client roles so the functions cannot be called
     directly via the data API.
   - The invitation claim (`used = true`) happens in the same AFTER INSERT
     transaction as the profile insert, so a concurrent sign-up race is decided
     by the BEFORE INSERT check + the unique primary key on invitations.email.

5. Notes
   - Idempotent: functions use CREATE OR REPLACE; triggers use DROP IF EXISTS.
   - If this platform rejects triggers on auth.users, I will report it and fall
     back to an Edge Function webhook on the auth insert event.
*/

-- ---------- BEFORE INSERT: gate sign-up ----------
CREATE OR REPLACE FUNCTION public.enforce_invite_only_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_profile_count int;
  v_invited_role text;
BEGIN
  -- First user is always allowed (becomes owner).
  SELECT count(*) INTO v_profile_count FROM public.profiles;
  IF v_profile_count = 0 THEN
    RETURN NEW;
  END IF;

  -- Otherwise the email must match an unused invitation.
  SELECT role INTO v_invited_role
  FROM public.invitations
  WHERE email = lower(NEW.email) AND used = false
  LIMIT 1;

  IF v_invited_role IS NULL THEN
    RAISE EXCEPTION 'Sign-up is invite-only. Ask an owner to invite your email.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enforce_invite_only_signup() FROM PUBLIC, anon, authenticated;

-- ---------- AFTER INSERT: create profile, claim invitation ----------
CREATE OR REPLACE FUNCTION public.create_profile_on_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_profile_count int;
  v_role text;
BEGIN
  SELECT count(*) INTO v_profile_count FROM public.profiles;

  IF v_profile_count = 0 THEN
    INSERT INTO public.profiles (user_id, role, language)
    VALUES (NEW.id, 'owner', 'ru');
  ELSE
    -- Atomically claim the invitation and read its role in one statement.
    UPDATE public.invitations
       SET used = true
     WHERE email = lower(NEW.email) AND used = false
     RETURNING role INTO v_role;

    IF v_role IS NULL THEN
      -- The BEFORE trigger should have prevented this; guard anyway.
      v_role := 'viewer';
    END IF;

    INSERT INTO public.profiles (user_id, role, language)
    VALUES (NEW.id, v_role, 'ru');
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_profile_on_signup() FROM PUBLIC, anon, authenticated;

-- ---------- Attach triggers to auth.users ----------
DROP TRIGGER IF EXISTS auth_users_before_insert_invite_only ON auth.users;
CREATE TRIGGER auth_users_before_insert_invite_only
BEFORE INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.enforce_invite_only_signup();

DROP TRIGGER IF EXISTS auth_users_after_insert_create_profile ON auth.users;
CREATE TRIGGER auth_users_after_insert_create_profile
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.create_profile_on_signup();
