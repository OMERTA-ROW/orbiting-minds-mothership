-- Invitations: truthful state transitions, invitee decline, and removal that really removes access.
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS declined_at timestamptz;

-- Revoke refuses closed invitations instead of silently "succeeding".
CREATE OR REPLACE FUNCTION public.revoke_invitation(_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.app_role := public.caller_role(); i public.invitations%ROWTYPE;
BEGIN
  SELECT * INTO i FROM public.invitations WHERE id = _id FOR UPDATE;
  IF i.id IS NULL OR r IS NULL OR r = 'tester' OR (r = 'admin' AND i.role <> 'tester') THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF i.accepted_at IS NOT NULL THEN RAISE EXCEPTION 'Invitation already accepted; remove the member instead'; END IF;
  IF i.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'Invitation already revoked'; END IF;
  IF i.declined_at IS NOT NULL THEN RAISE EXCEPTION 'Invitation already declined'; END IF;
  UPDATE public.invitations SET revoked_at = now() WHERE id = _id;
END $$;

-- Accept also refuses declined invitations.
CREATE OR REPLACE FUNCTION public.accept_invitation(_token_hash text) RETURNS public.app_role LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE i public.invitations%ROWTYPE; u auth.users%ROWTYPE;
BEGIN
  SELECT * INTO u FROM auth.users WHERE id = auth.uid();
  IF u.id IS NULL OR u.email_confirmed_at IS NULL THEN RAISE EXCEPTION 'Confirm your email first'; END IF;
  SELECT * INTO i FROM public.invitations WHERE token_hash = _token_hash FOR UPDATE;
  IF i.id IS NULL OR i.revoked_at IS NOT NULL OR i.accepted_at IS NOT NULL OR i.declined_at IS NOT NULL OR i.expires_at <= now() THEN RAISE EXCEPTION 'Invitation is not valid'; END IF;
  IF lower(u.email) <> i.email THEN RAISE EXCEPTION 'This invitation belongs to a different account'; END IF;
  IF i.role = 'owner' THEN RAISE EXCEPTION 'Not allowed'; END IF;
  UPDATE public.invitations SET accepted_at = now(), accepted_by = u.id WHERE id = i.id;
  INSERT INTO public.user_roles (user_id, role, granted_by) VALUES (u.id, i.role, i.created_by) ON CONFLICT DO NOTHING;
  RETURN i.role;
END $$;

-- The invited person (signed in with the invited, confirmed email) may decline.
CREATE OR REPLACE FUNCTION public.decline_invitation(_token_hash text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE i public.invitations%ROWTYPE; u auth.users%ROWTYPE;
BEGIN
  SELECT * INTO u FROM auth.users WHERE id = auth.uid();
  IF u.id IS NULL OR u.email_confirmed_at IS NULL THEN RAISE EXCEPTION 'Confirm your email first'; END IF;
  SELECT * INTO i FROM public.invitations WHERE token_hash = _token_hash FOR UPDATE;
  IF i.id IS NULL OR i.revoked_at IS NOT NULL OR i.accepted_at IS NOT NULL OR i.declined_at IS NOT NULL OR i.expires_at <= now() THEN RAISE EXCEPTION 'Invitation is not valid'; END IF;
  IF lower(u.email) <> i.email THEN RAISE EXCEPTION 'This invitation belongs to a different account'; END IF;
  UPDATE public.invitations SET declined_at = now() WHERE id = i.id;
END $$;

-- Removal: refuses non-members, deletes roles, closes the person's open invitations
-- (sent by them or addressed to them) and withdraws AI/studio approval.
CREATE OR REPLACE FUNCTION public.remove_member(_user_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.app_role := public.caller_role(); target_email text;
BEGIN
  IF _user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'owner') THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF r IS NULL OR r = 'tester' THEN RAISE EXCEPTION 'Not allowed'; END IF;
  PERFORM 1 FROM public.user_roles WHERE user_id = _user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not a member (already removed)'; END IF;
  IF r = 'admin' AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role <> 'tester') THEN RAISE EXCEPTION 'Not allowed'; END IF;
  DELETE FROM public.user_roles WHERE user_id = _user_id;
  SELECT lower(email) INTO target_email FROM auth.users WHERE id = _user_id;
  UPDATE public.invitations SET revoked_at = now()
    WHERE accepted_at IS NULL AND revoked_at IS NULL AND declined_at IS NULL
      AND (created_by = _user_id OR (target_email IS NOT NULL AND email = target_email));
  UPDATE public.beta_access SET ai_approved = false, studio_approved = false
    WHERE user_id = _user_id AND (ai_approved OR studio_approved);
END $$;

REVOKE ALL ON FUNCTION public.decline_invitation(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decline_invitation(text) TO authenticated;
REVOKE ALL ON FUNCTION public.revoke_invitation(uuid), public.accept_invitation(text), public.remove_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_invitation(uuid), public.accept_invitation(text), public.remove_member(uuid) TO authenticated;