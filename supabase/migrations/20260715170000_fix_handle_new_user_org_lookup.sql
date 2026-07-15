-- Fix: handle_new_user() trigger broke after 20260223000000_fix_security_anon_exposure.sql
-- added an auth.uid() IS NULL guard to get_singleton_organization_id(). That guard is
-- correct for the RPC exposed to clients, but handle_new_user() calls it internally
-- during signup, before any session exists (auth.uid() is always NULL at that point).
-- Result: every new user signup failed with "Database error creating new user" since
-- that migration was applied — nobody caught it because no new user was created until now.
--
-- Fix: inline the singleton-org lookup directly in the trigger instead of calling the
-- guarded public function. The trigger itself is not callable by arbitrary clients (it
-- only fires on auth.users insert, controlled by GoTrue), so this does not reopen the
-- security gap the original migration closed.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
    v_org_id uuid;
BEGIN
    v_org_id := (new.raw_user_meta_data->>'organization_id')::uuid;
    IF v_org_id IS NULL THEN
        SELECT id INTO v_org_id
        FROM public.organizations
        WHERE deleted_at IS NULL
        ORDER BY created_at ASC
        LIMIT 1;
    END IF;

    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'Nenhuma organization encontrada. Rode o setup inicial antes de criar usuários.';
    END IF;

    -- Create Profile
    INSERT INTO public.profiles (id, email, name, avatar, role, organization_id)
    VALUES (
        new.id,
        new.email,
        COALESCE(new.raw_user_meta_data->>'name', new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
        new.raw_user_meta_data->>'avatar_url',
        COALESCE(new.raw_user_meta_data->>'role', 'user'),
        v_org_id
    );

    -- Create User Settings (idempotente)
    INSERT INTO public.user_settings (user_id)
    VALUES (new.id)
    ON CONFLICT (user_id) DO NOTHING;

    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
