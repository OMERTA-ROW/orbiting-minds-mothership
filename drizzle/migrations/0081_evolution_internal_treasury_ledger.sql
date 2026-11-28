CREATE TABLE public.evolution_treasury_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  request_id uuid NOT NULL,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 80),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'frozen')),
  verified_at timestamptz,
  per_transfer_limit_units bigint NOT NULL CHECK (per_transfer_limit_units BETWEEN 1 AND 1000000000),
  daily_limit_units bigint NOT NULL CHECK (daily_limit_units BETWEEN 1 AND 1000000000),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, request_id),
  CHECK (daily_limit_units >= per_transfer_limit_units)
);
CREATE UNIQUE INDEX evolution_treasury_accounts_name_idx
  ON public.evolution_treasury_accounts (owner_id, lower(btrim(name)));
CREATE INDEX evolution_treasury_accounts_owner_idx
  ON public.evolution_treasury_accounts (owner_id, created_at DESC);
REVOKE ALL ON public.evolution_treasury_accounts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.evolution_treasury_accounts TO authenticated;
GRANT ALL ON public.evolution_treasury_accounts TO service_role;
ALTER TABLE public.evolution_treasury_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY evolution_treasury_accounts_owner_read ON public.evolution_treasury_accounts
  FOR SELECT TO authenticated
  USING (owner_id = (select auth.uid()) AND (select public.is_razul_owner()));

CREATE TABLE public.evolution_treasury_journals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  request_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('opening', 'income', 'expense', 'transfer')),
  source_account_id uuid REFERENCES public.evolution_treasury_accounts(id),
  destination_account_id uuid REFERENCES public.evolution_treasury_accounts(id),
  amount_units bigint NOT NULL CHECK (amount_units BETWEEN 1 AND 1000000000),
  note text NOT NULL DEFAULT '' CHECK (char_length(note) <= 280),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'posted', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '10 minutes',
  posted_at timestamptz,
  UNIQUE (owner_id, request_id),
  CHECK (expires_at > created_at AND expires_at <= created_at + interval '15 minutes'),
  CHECK ((status = 'posted') = (posted_at IS NOT NULL)),
  CHECK (
    (kind IN ('opening', 'income') AND source_account_id IS NULL AND destination_account_id IS NOT NULL)
    OR (kind = 'expense' AND source_account_id IS NOT NULL AND destination_account_id IS NULL)
    OR (kind = 'transfer' AND source_account_id IS NOT NULL AND destination_account_id IS NOT NULL AND source_account_id <> destination_account_id)
  )
);
CREATE INDEX evolution_treasury_journals_owner_idx
  ON public.evolution_treasury_journals (owner_id, created_at DESC);
CREATE INDEX evolution_treasury_journals_source_idx
  ON public.evolution_treasury_journals (source_account_id, created_at DESC);
REVOKE ALL ON public.evolution_treasury_journals FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.evolution_treasury_journals TO authenticated;
GRANT ALL ON public.evolution_treasury_journals TO service_role;
ALTER TABLE public.evolution_treasury_journals ENABLE ROW LEVEL SECURITY;
CREATE POLICY evolution_treasury_journals_owner_read ON public.evolution_treasury_journals
  FOR SELECT TO authenticated
  USING (owner_id = (select auth.uid()) AND (select public.is_razul_owner()));

CREATE TABLE public.evolution_treasury_entries (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  owner_id uuid NOT NULL,
  journal_id uuid NOT NULL REFERENCES public.evolution_treasury_journals(id),
  account_id uuid REFERENCES public.evolution_treasury_accounts(id),
  entry_role text NOT NULL CHECK (entry_role IN ('internal', 'counterpart')),
  signed_units bigint NOT NULL CHECK (signed_units BETWEEN -1000000000 AND 1000000000 AND signed_units <> 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((entry_role = 'internal') = (account_id IS NOT NULL))
);
CREATE INDEX evolution_treasury_entries_account_idx
  ON public.evolution_treasury_entries (account_id, created_at DESC);
CREATE INDEX evolution_treasury_entries_journal_idx
  ON public.evolution_treasury_entries (journal_id);
REVOKE ALL ON public.evolution_treasury_entries FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.evolution_treasury_entries TO authenticated;
GRANT ALL ON public.evolution_treasury_entries TO service_role;
ALTER TABLE public.evolution_treasury_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY evolution_treasury_entries_owner_read ON public.evolution_treasury_entries
  FOR SELECT TO authenticated
  USING (owner_id = (select auth.uid()) AND (select public.is_razul_owner()));

CREATE TABLE public.evolution_treasury_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  owner_id uuid NOT NULL,
  action text NOT NULL,
  journal_id uuid,
  account_id uuid,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX evolution_treasury_audit_owner_idx
  ON public.evolution_treasury_audit (owner_id, created_at DESC);
REVOKE ALL ON public.evolution_treasury_audit FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.evolution_treasury_audit TO authenticated;
GRANT ALL ON public.evolution_treasury_audit TO service_role;
ALTER TABLE public.evolution_treasury_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY evolution_treasury_audit_owner_read ON public.evolution_treasury_audit
  FOR SELECT TO authenticated
  USING (owner_id = (select auth.uid()) AND (select public.is_razul_owner()));

CREATE TRIGGER evolution_treasury_entries_append_only
  BEFORE UPDATE OR DELETE ON public.evolution_treasury_entries
  FOR EACH ROW EXECUTE FUNCTION public.omni_append_only();
CREATE TRIGGER evolution_treasury_entries_no_truncate
  BEFORE TRUNCATE ON public.evolution_treasury_entries
  FOR EACH STATEMENT EXECUTE FUNCTION public.omni_append_only();
CREATE TRIGGER evolution_treasury_audit_append_only
  BEFORE UPDATE OR DELETE ON public.evolution_treasury_audit
  FOR EACH ROW EXECUTE FUNCTION public.omni_append_only();
CREATE TRIGGER evolution_treasury_audit_no_truncate
  BEFORE TRUNCATE ON public.evolution_treasury_audit
  FOR EACH STATEMENT EXECUTE FUNCTION public.omni_append_only();

CREATE OR REPLACE FUNCTION public.evolution_treasury_journal_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF OLD.status <> 'pending' THEN
    RAISE EXCEPTION 'A completed internal journal cannot be changed';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.owner_id IS DISTINCT FROM OLD.owner_id
     OR NEW.request_id IS DISTINCT FROM OLD.request_id OR NEW.kind IS DISTINCT FROM OLD.kind
     OR NEW.source_account_id IS DISTINCT FROM OLD.source_account_id
     OR NEW.destination_account_id IS DISTINCT FROM OLD.destination_account_id
     OR NEW.amount_units IS DISTINCT FROM OLD.amount_units OR NEW.note IS DISTINCT FROM OLD.note
     OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.expires_at IS DISTINCT FROM OLD.expires_at THEN
    RAISE EXCEPTION 'Internal journal payload is immutable';
  END IF;
  IF NEW.status NOT IN ('posted', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid internal journal transition';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER evolution_treasury_journal_guard
  BEFORE UPDATE ON public.evolution_treasury_journals
  FOR EACH ROW EXECUTE FUNCTION public.evolution_treasury_journal_guard();

CREATE OR REPLACE FUNCTION public.evolution_treasury_create_account(
  _name text, _per_transfer_limit bigint, _daily_limit bigint, _request_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _account public.evolution_treasury_accounts;
BEGIN
  IF public.is_razul_owner() IS DISTINCT FROM true OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Verified owner with two-step sign-in required' USING ERRCODE = '42501';
  END IF;
  IF _request_id IS NULL OR char_length(btrim(coalesce(_name, ''))) NOT BETWEEN 2 AND 80
     OR _per_transfer_limit IS NULL OR _daily_limit IS NULL
     OR _per_transfer_limit NOT BETWEEN 1 AND 1000000000
     OR _daily_limit NOT BETWEEN _per_transfer_limit AND 1000000000 THEN
    RAISE EXCEPTION 'Invalid account name, request or internal-unit limits';
  END IF;
  SELECT * INTO _account FROM public.evolution_treasury_accounts
    WHERE owner_id = auth.uid() AND request_id = _request_id;
  IF FOUND THEN RETURN jsonb_build_object('ok', true, 'accountId', _account.id, 'existing', true); END IF;
  IF (SELECT count(*) FROM public.evolution_treasury_accounts WHERE owner_id = auth.uid()) >= 100 THEN
    RAISE EXCEPTION 'The 100-account safety limit has been reached';
  END IF;
  INSERT INTO public.evolution_treasury_accounts
    (owner_id, request_id, name, per_transfer_limit_units, daily_limit_units)
  VALUES (auth.uid(), _request_id, btrim(_name), _per_transfer_limit, _daily_limit)
  RETURNING * INTO _account;
  INSERT INTO public.evolution_treasury_audit (owner_id, action, account_id, detail)
  VALUES (auth.uid(), 'account_created', _account.id,
          jsonb_build_object('name', _account.name, 'perTransferLimit', _per_transfer_limit, 'dailyLimit', _daily_limit));
  RETURN jsonb_build_object('ok', true, 'accountId', _account.id, 'existing', false);
END $$;

CREATE OR REPLACE FUNCTION public.evolution_treasury_verify_recipient(
  _account_id uuid, _expected_name text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _account public.evolution_treasury_accounts;
BEGIN
  IF public.is_razul_owner() IS DISTINCT FROM true OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Verified owner with two-step sign-in required' USING ERRCODE = '42501';
  END IF;
  PERFORM public.assert_fresh_mfa(900);
  SELECT * INTO _account FROM public.evolution_treasury_accounts
    WHERE id = _account_id AND owner_id = auth.uid() FOR UPDATE;
  IF NOT FOUND OR _account.status <> 'active' THEN RAISE EXCEPTION 'Active internal recipient not found'; END IF;
  IF lower(btrim(_account.name)) <> lower(btrim(coalesce(_expected_name, ''))) THEN
    RAISE EXCEPTION 'Recipient name confirmation does not match';
  END IF;
  UPDATE public.evolution_treasury_accounts SET verified_at = now() WHERE id = _account.id;
  INSERT INTO public.evolution_treasury_audit (owner_id, action, account_id, detail)
  VALUES (auth.uid(), 'recipient_verified', _account.id, jsonb_build_object('name', _account.name));
  RETURN jsonb_build_object('ok', true, 'accountId', _account.id);
END $$;

CREATE OR REPLACE FUNCTION public.evolution_treasury_set_limits(
  _account_id uuid, _per_transfer_limit bigint, _daily_limit bigint
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _account public.evolution_treasury_accounts;
BEGIN
  IF public.is_razul_owner() IS DISTINCT FROM true OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Verified owner with two-step sign-in required' USING ERRCODE = '42501';
  END IF;
  PERFORM public.assert_fresh_mfa(900);
  IF _per_transfer_limit IS NULL OR _daily_limit IS NULL
     OR _per_transfer_limit NOT BETWEEN 1 AND 1000000000
     OR _daily_limit NOT BETWEEN _per_transfer_limit AND 1000000000 THEN
    RAISE EXCEPTION 'Invalid internal-unit limits';
  END IF;
  UPDATE public.evolution_treasury_accounts
    SET per_transfer_limit_units = _per_transfer_limit, daily_limit_units = _daily_limit
    WHERE id = _account_id AND owner_id = auth.uid() RETURNING * INTO _account;
  IF NOT FOUND THEN RAISE EXCEPTION 'Internal account not found'; END IF;
  INSERT INTO public.evolution_treasury_audit (owner_id, action, account_id, detail)
  VALUES (auth.uid(), 'limits_changed', _account.id,
          jsonb_build_object('perTransferLimit', _per_transfer_limit, 'dailyLimit', _daily_limit));
  RETURN jsonb_build_object('ok', true, 'accountId', _account.id);
END $$;

CREATE OR REPLACE FUNCTION public.evolution_treasury_prepare_journal(
  _kind text, _source uuid, _destination uuid, _amount bigint, _note text, _request_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _journal public.evolution_treasury_journals; _recipient public.evolution_treasury_accounts;
BEGIN
  IF public.is_razul_owner() IS DISTINCT FROM true OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Verified owner with two-step sign-in required' USING ERRCODE = '42501';
  END IF;
  IF _request_id IS NULL OR _amount IS NULL OR _amount NOT BETWEEN 1 AND 1000000000
     OR char_length(coalesce(_note, '')) > 280 THEN
    RAISE EXCEPTION 'Invalid internal journal request';
  END IF;
  SELECT * INTO _journal FROM public.evolution_treasury_journals
    WHERE owner_id = auth.uid() AND request_id = _request_id;
  IF FOUND THEN
    IF _journal.kind IS DISTINCT FROM _kind OR _journal.source_account_id IS DISTINCT FROM _source
       OR _journal.destination_account_id IS DISTINCT FROM _destination OR _journal.amount_units IS DISTINCT FROM _amount
       OR _journal.note IS DISTINCT FROM coalesce(_note, '') THEN
      RAISE EXCEPTION 'Request identifier was already used for a different journal';
    END IF;
    RETURN jsonb_build_object('ok', true, 'journalId', _journal.id, 'amountUnits', _journal.amount_units, 'existing', true);
  END IF;
  IF _kind NOT IN ('opening', 'income', 'expense', 'transfer') THEN RAISE EXCEPTION 'Invalid internal journal kind'; END IF;
  IF (_kind IN ('opening', 'income') AND (_source IS NOT NULL OR _destination IS NULL))
     OR (_kind = 'expense' AND (_source IS NULL OR _destination IS NOT NULL))
     OR (_kind = 'transfer' AND (_source IS NULL OR _destination IS NULL OR _source = _destination)) THEN
    RAISE EXCEPTION 'Choose the correct internal source and recipient for this journal';
  END IF;
  IF _source IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.evolution_treasury_accounts WHERE id = _source AND owner_id = auth.uid() AND status = 'active'
  ) THEN RAISE EXCEPTION 'Active internal source not found'; END IF;
  IF _destination IS NOT NULL THEN
    SELECT * INTO _recipient FROM public.evolution_treasury_accounts
      WHERE id = _destination AND owner_id = auth.uid() AND status = 'active';
    IF NOT FOUND THEN RAISE EXCEPTION 'Active internal recipient not found'; END IF;
    IF _kind = 'transfer' AND _recipient.verified_at IS NULL THEN
      RAISE EXCEPTION 'Verify the recipient name before preparing this transfer';
    END IF;
  END IF;
  INSERT INTO public.evolution_treasury_journals
    (owner_id, request_id, kind, source_account_id, destination_account_id, amount_units, note)
  VALUES (auth.uid(), _request_id, _kind, _source, _destination, _amount, coalesce(_note, ''))
  RETURNING * INTO _journal;
  INSERT INTO public.evolution_treasury_audit (owner_id, action, journal_id, detail)
  VALUES (auth.uid(), 'journal_prepared', _journal.id,
          jsonb_build_object('kind', _kind, 'amountUnits', _amount, 'expiresAt', _journal.expires_at));
  RETURN jsonb_build_object('ok', true, 'journalId', _journal.id, 'amountUnits', _amount, 'existing', false);
END $$;

CREATE OR REPLACE FUNCTION public.evolution_treasury_post_journal(
  _journal_id uuid, _amount_confirmation bigint
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _journal public.evolution_treasury_journals;
  _source public.evolution_treasury_accounts;
  _destination public.evolution_treasury_accounts;
  _balance bigint; _daily bigint; _stop boolean;
BEGIN
  IF public.is_razul_owner() IS DISTINCT FROM true OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Verified owner with two-step sign-in required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO _journal FROM public.evolution_treasury_journals
    WHERE id = _journal_id AND owner_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Internal journal not found'; END IF;
  IF _journal.status = 'posted' THEN
    RETURN jsonb_build_object('ok', true, 'journalId', _journal.id, 'status', 'posted', 'existing', true);
  END IF;
  IF _journal.status <> 'pending' THEN RAISE EXCEPTION 'Cancelled internal journal cannot be posted'; END IF;
  PERFORM public.assert_fresh_mfa(900);
  IF _amount_confirmation IS DISTINCT FROM _journal.amount_units THEN
    RAISE EXCEPTION 'Enter the exact internal-unit amount to confirm';
  END IF;
  IF _journal.expires_at <= now() THEN RAISE EXCEPTION 'Internal journal confirmation expired; prepare it again'; END IF;
  SELECT emergency_stop INTO _stop FROM public.omni_terminal_controls WHERE id = 1 FOR SHARE;
  IF _stop IS DISTINCT FROM false THEN RAISE EXCEPTION 'Emergency Stop is engaged or unavailable; posting is blocked'; END IF;
  PERFORM 1 FROM public.evolution_treasury_accounts
    WHERE id IN (_journal.source_account_id, _journal.destination_account_id) ORDER BY id FOR UPDATE;
  IF _journal.source_account_id IS NOT NULL THEN
    SELECT * INTO _source FROM public.evolution_treasury_accounts WHERE id = _journal.source_account_id;
    IF _source.owner_id IS DISTINCT FROM auth.uid() OR _source.status <> 'active' THEN RAISE EXCEPTION 'Active internal source not found'; END IF;
    IF _journal.amount_units > _source.per_transfer_limit_units THEN RAISE EXCEPTION 'Per-transfer internal-unit limit exceeded'; END IF;
    SELECT coalesce(sum(-e.signed_units), 0) INTO _daily
      FROM public.evolution_treasury_entries e
      JOIN public.evolution_treasury_journals j ON j.id = e.journal_id
      WHERE e.account_id = _source.id AND e.signed_units < 0 AND j.status = 'posted'
        AND j.posted_at >= date_trunc('day', now());
    IF _daily + _journal.amount_units > _source.daily_limit_units THEN RAISE EXCEPTION 'Daily internal-unit limit exceeded'; END IF;
    SELECT coalesce(sum(signed_units), 0) INTO _balance FROM public.evolution_treasury_entries
      WHERE account_id = _source.id;
    IF _balance < _journal.amount_units THEN RAISE EXCEPTION 'Insufficient internal units; no overdraft was created'; END IF;
  END IF;
  IF _journal.destination_account_id IS NOT NULL THEN
    SELECT * INTO _destination FROM public.evolution_treasury_accounts WHERE id = _journal.destination_account_id;
    IF _destination.owner_id IS DISTINCT FROM auth.uid() OR _destination.status <> 'active' THEN RAISE EXCEPTION 'Active internal recipient not found'; END IF;
    IF _journal.kind = 'transfer' AND _destination.verified_at IS NULL THEN RAISE EXCEPTION 'Internal recipient verification is required'; END IF;
  END IF;
  UPDATE public.evolution_treasury_journals SET status = 'posted', posted_at = now() WHERE id = _journal.id;
  IF _journal.source_account_id IS NOT NULL THEN
    INSERT INTO public.evolution_treasury_entries (owner_id, journal_id, account_id, entry_role, signed_units)
    VALUES (auth.uid(), _journal.id, _journal.source_account_id, 'internal', -_journal.amount_units);
  ELSE
    INSERT INTO public.evolution_treasury_entries (owner_id, journal_id, account_id, entry_role, signed_units)
    VALUES (auth.uid(), _journal.id, NULL, 'counterpart', -_journal.amount_units);
  END IF;
  IF _journal.destination_account_id IS NOT NULL THEN
    INSERT INTO public.evolution_treasury_entries (owner_id, journal_id, account_id, entry_role, signed_units)
    VALUES (auth.uid(), _journal.id, _journal.destination_account_id, 'internal', _journal.amount_units);
  ELSE
    INSERT INTO public.evolution_treasury_entries (owner_id, journal_id, account_id, entry_role, signed_units)
    VALUES (auth.uid(), _journal.id, NULL, 'counterpart', _journal.amount_units);
  END IF;
  INSERT INTO public.evolution_treasury_audit (owner_id, action, journal_id, detail)
  VALUES (auth.uid(), 'journal_posted', _journal.id,
          jsonb_build_object('kind', _journal.kind, 'amountUnits', _journal.amount_units));
  RETURN jsonb_build_object('ok', true, 'journalId', _journal.id, 'status', 'posted', 'existing', false);
END $$;

CREATE OR REPLACE FUNCTION public.evolution_treasury_cancel_journal(_journal_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _journal public.evolution_treasury_journals;
BEGIN
  IF public.is_razul_owner() IS DISTINCT FROM true OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Verified owner with two-step sign-in required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO _journal FROM public.evolution_treasury_journals
    WHERE id = _journal_id AND owner_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Internal journal not found'; END IF;
  IF _journal.status = 'cancelled' THEN RETURN jsonb_build_object('ok', true, 'journalId', _journal.id, 'existing', true); END IF;
  IF _journal.status <> 'pending' THEN RAISE EXCEPTION 'Posted internal journals cannot be cancelled'; END IF;
  UPDATE public.evolution_treasury_journals SET status = 'cancelled' WHERE id = _journal.id;
  INSERT INTO public.evolution_treasury_audit (owner_id, action, journal_id)
  VALUES (auth.uid(), 'journal_cancelled', _journal.id);
  RETURN jsonb_build_object('ok', true, 'journalId', _journal.id, 'existing', false);
END $$;

CREATE OR REPLACE FUNCTION public.evolution_treasury_read_snapshot()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF public.is_razul_owner() IS DISTINCT FROM true OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Verified owner with two-step sign-in required' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'checkedAt', now(), 'realMoney', false, 'unitName', 'internal units',
    'accounts', coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id', a.id, 'name', a.name, 'status', a.status, 'verifiedAt', a.verified_at,
      'perTransferLimitUnits', a.per_transfer_limit_units, 'dailyLimitUnits', a.daily_limit_units,
      'balanceUnits', coalesce((SELECT sum(e.signed_units) FROM public.evolution_treasury_entries e WHERE e.account_id = a.id), 0),
      'dailyOutUnits', coalesce((SELECT sum(-e.signed_units) FROM public.evolution_treasury_entries e
        JOIN public.evolution_treasury_journals j ON j.id = e.journal_id
        WHERE e.account_id = a.id AND e.signed_units < 0 AND j.status = 'posted' AND j.posted_at >= date_trunc('day', now())), 0)
    ) ORDER BY a.created_at) FROM public.evolution_treasury_accounts a WHERE a.owner_id = auth.uid()), '[]'::jsonb),
    'journals', coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id', j.id, 'kind', j.kind, 'amountUnits', j.amount_units, 'note', j.note, 'status', j.status,
      'createdAt', j.created_at, 'expiresAt', j.expires_at, 'postedAt', j.posted_at,
      'sourceAccountId', j.source_account_id, 'destinationAccountId', j.destination_account_id,
      'sourceName', s.name, 'destinationName', d.name
    ) ORDER BY j.created_at DESC) FROM (SELECT * FROM public.evolution_treasury_journals WHERE owner_id = auth.uid() ORDER BY created_at DESC LIMIT 100) j
      LEFT JOIN public.evolution_treasury_accounts s ON s.id = j.source_account_id
      LEFT JOIN public.evolution_treasury_accounts d ON d.id = j.destination_account_id), '[]'::jsonb),
    'audit', coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id', a.id, 'action', a.action, 'journalId', a.journal_id, 'accountId', a.account_id,
      'detail', a.detail, 'createdAt', a.created_at
    ) ORDER BY a.created_at DESC) FROM (SELECT * FROM public.evolution_treasury_audit WHERE owner_id = auth.uid() ORDER BY created_at DESC LIMIT 100) a), '[]'::jsonb)
  );
END $$;

REVOKE ALL ON FUNCTION public.evolution_treasury_create_account(text, bigint, bigint, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.evolution_treasury_verify_recipient(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.evolution_treasury_set_limits(uuid, bigint, bigint) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.evolution_treasury_prepare_journal(text, uuid, uuid, bigint, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.evolution_treasury_post_journal(uuid, bigint) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.evolution_treasury_cancel_journal(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.evolution_treasury_read_snapshot() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.evolution_treasury_create_account(text, bigint, bigint, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.evolution_treasury_verify_recipient(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.evolution_treasury_set_limits(uuid, bigint, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.evolution_treasury_prepare_journal(text, uuid, uuid, bigint, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.evolution_treasury_post_journal(uuid, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.evolution_treasury_cancel_journal(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.evolution_treasury_read_snapshot() TO authenticated;