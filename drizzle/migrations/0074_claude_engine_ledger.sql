CREATE TABLE public.claude_prices (
  model text PRIMARY KEY CHECK (model IN ('claude-sonnet-5-5', 'claude-opus-5-5')),
  in_cents_per_mtok numeric(10,4) NOT NULL CHECK (in_cents_per_mtok > 0),
  out_cents_per_mtok numeric(10,4) NOT NULL CHECK (out_cents_per_mtok > 0),
  confirmed_by uuid NOT NULL,
  confirmed_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.claude_prices FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.claude_prices TO authenticated;
GRANT ALL ON public.claude_prices TO service_role;
ALTER TABLE public.claude_prices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner reads Claude prices" ON public.claude_prices
  FOR SELECT TO authenticated USING (public.is_razul_owner());

CREATE TABLE public.claude_engine_settings (
  owner_id uuid NOT NULL,
  agent_id text NOT NULL CHECK (agent_id IN ('omni', 'dread', 'draco')),
  model text NOT NULL CHECK (model IN ('claude-sonnet-5-5', 'claude-opus-5-5')),
  enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, agent_id)
);
REVOKE ALL ON public.claude_engine_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.claude_engine_settings TO authenticated;
GRANT ALL ON public.claude_engine_settings TO service_role;
ALTER TABLE public.claude_engine_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner reads own Claude engine settings" ON public.claude_engine_settings
  FOR SELECT TO authenticated USING (owner_id = auth.uid() AND public.is_razul_owner());

CREATE TABLE public.claude_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  run_id uuid NOT NULL UNIQUE,
  agent_id text NOT NULL CHECK (agent_id IN ('omni', 'dread', 'draco')),
  model text NOT NULL CHECK (model IN ('claude-sonnet-5-5', 'claude-opus-5-5')),
  status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'completed', 'failed', 'cancelled')),
  estimate_cents integer NOT NULL CHECK (estimate_cents BETWEEN 1 AND 50),
  actual_cents integer CHECK (actual_cents >= 0),
  input_tokens integer CHECK (input_tokens >= 0),
  output_tokens integer CHECK (output_tokens >= 0),
  reserved_at timestamptz NOT NULL DEFAULT now(),
  settled_at timestamptz,
  CHECK ((status = 'reserved') = (settled_at IS NULL))
);
CREATE INDEX claude_usage_owner_idx ON public.claude_usage (owner_id, reserved_at DESC);
REVOKE ALL ON public.claude_usage FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.claude_usage TO authenticated;
GRANT ALL ON public.claude_usage TO service_role;
ALTER TABLE public.claude_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner reads own Claude usage" ON public.claude_usage
  FOR SELECT TO authenticated USING (owner_id = auth.uid() AND public.is_razul_owner());
COMMENT ON TABLE public.claude_usage IS 'Claude call cost ledger. Metadata only; no prompt or reply text.';

-- Allow the two Claude engines on delegated chat runs (metadata stays honest about the engine used).
ALTER TABLE public.omni_delegated_chat_runs DROP CONSTRAINT IF EXISTS omni_delegated_chat_runs_model_check;
ALTER TABLE public.omni_delegated_chat_runs ADD CONSTRAINT omni_delegated_chat_runs_model_check
  CHECK (model IN ('openai/gpt-6-astra', 'claude-sonnet-5-5', 'claude-opus-5-5'));

CREATE OR REPLACE FUNCTION public.omni_delegation_begin_chat(
  _token_hash text, _audience text, _model text, _message_count integer, _input_chars integer
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _v jsonb;
  _owner uuid;
  _run uuid := gen_random_uuid();
  _guarded integer;
BEGIN
  _v := public.omni_delegation_use(_token_hash, _audience, 'chat:write');
  IF _v->>'status' <> 'valid' THEN
    RETURN jsonb_build_object('ok', false, 'reason', _v->>'status');
  END IF;
  _owner := (_v->>'owner_id')::uuid;
  IF _model IS NULL OR _model NOT IN ('openai/gpt-6-astra', 'claude-sonnet-5-5', 'claude-opus-5-5') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'model_not_available');
  END IF;
  IF _message_count IS NULL OR _message_count NOT BETWEEN 1 AND 20
     OR _input_chars IS NULL OR _input_chars NOT BETWEEN 1 AND 24000 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_request');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.beta_access a
                 WHERE a.user_id = _owner AND a.ai_approved AND NOT a.paused) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'ai_not_approved');
  END IF;
  IF public.omni_stop_engaged() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'emergency_stop_engaged');
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('omni_delegated_chat:' || _owner::text));
  IF (SELECT count(*) FROM public.omni_delegated_chat_runs
      WHERE owner_id = _owner AND started_at > now() - interval '24 hours') >= 30 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'daily_limit');
  END IF;
  INSERT INTO public.ai_gateway_state (feature, blocked_status, message)
  VALUES ('evolution-omni', 503,
          'OMNI request ' || _run::text || ' is in progress or its outcome needs owner review. No automatic restart.')
  ON CONFLICT (feature) DO NOTHING;
  GET DIAGNOSTICS _guarded = ROW_COUNT;
  IF _guarded <> 1 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'ai_busy_or_paused');
  END IF;
  INSERT INTO public.omni_delegated_chat_runs (id, owner_id, delegation_id, model, message_count, input_chars)
  VALUES (_run, _owner, (_v->>'delegation_id')::uuid, _model, _message_count, _input_chars);
  INSERT INTO public.razul_control_audit (actor_id, action, record_type, record_id)
  VALUES (_owner, 'chat_start_delegated', 'omni_delegated_chat', _run::text);
  RETURN jsonb_build_object('ok', true, 'run_id', _run);
END $$;
REVOKE ALL ON FUNCTION public.omni_delegation_begin_chat(text, text, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.omni_delegation_begin_chat(text, text, text, integer, integer) TO service_role;

-- Pure cost estimate in cents (ceil). Input tokens are counted conservatively as chars/3.
CREATE OR REPLACE FUNCTION public.claude_estimate_cents(_in_tokens integer, _out_tokens integer, _in_price numeric, _out_price numeric)
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT ceil((_in_tokens::numeric * _in_price + _out_tokens::numeric * _out_price) / 1000000)::integer
$$;

-- Reserve a Claude call against the caps. Lock order: Stop row, run row, per-owner ledger lock.
CREATE OR REPLACE FUNCTION public.claude_reserve(_run_id uuid, _agent text, _model text, _input_chars integer, _max_output_tokens integer)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _stop boolean;
  _r public.omni_delegated_chat_runs;
  _p public.claude_prices;
  _est integer;
  _day integer;
BEGIN
  SELECT emergency_stop INTO _stop FROM public.omni_terminal_controls WHERE id = 1 FOR SHARE;
  IF _stop IS DISTINCT FROM false THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'emergency_stop_engaged');
  END IF;
  SELECT * INTO _r FROM public.omni_delegated_chat_runs WHERE id = _run_id FOR UPDATE;
  IF NOT FOUND OR _r.status <> 'running' OR _r.model IS DISTINCT FROM _model THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_request');
  END IF;
  IF _input_chars IS NULL OR _input_chars NOT BETWEEN 1 AND 24000
     OR _max_output_tokens IS NULL OR _max_output_tokens NOT BETWEEN 1 AND 4000 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_request');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.claude_engine_settings s
                 WHERE s.owner_id = _r.owner_id AND s.agent_id = _agent AND s.model = _model AND s.enabled) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'engine_not_enabled');
  END IF;
  SELECT * INTO _p FROM public.claude_prices WHERE model = _model;
  IF NOT FOUND OR _p.confirmed_at < now() - interval '30 days' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'price_not_confirmed');
  END IF;
  _est := public.claude_estimate_cents(ceil(_input_chars / 3.0)::integer + 200, _max_output_tokens,
                                       _p.in_cents_per_mtok, _p.out_cents_per_mtok);
  IF _est < 1 THEN _est := 1; END IF;
  IF _est > 50 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'call_cap', 'estimate_cents', _est);
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('claude_ledger:' || _r.owner_id::text));
  SELECT coalesce(sum(CASE WHEN status = 'reserved' THEN estimate_cents ELSE coalesce(actual_cents, estimate_cents) END), 0)
    INTO _day FROM public.claude_usage
    WHERE owner_id = _r.owner_id AND reserved_at > now() - interval '24 hours';
  IF _day + _est > 500 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'daily_cap', 'estimate_cents', _est);
  END IF;
  INSERT INTO public.claude_usage (owner_id, run_id, agent_id, model, estimate_cents)
  VALUES (_r.owner_id, _run_id, _agent, _model, _est);
  RETURN jsonb_build_object('ok', true, 'estimate_cents', _est);
END $$;
REVOKE ALL ON FUNCTION public.claude_reserve(uuid, text, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claude_reserve(uuid, text, text, integer, integer) TO service_role;

-- Settle once with Anthropic's reported token usage; unknown usage keeps the estimate as cost.
CREATE OR REPLACE FUNCTION public.claude_settle(_run_id uuid, _status text, _input_tokens integer, _output_tokens integer)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _u public.claude_usage;
  _p public.claude_prices;
  _actual integer;
BEGIN
  IF _status NOT IN ('completed', 'failed', 'cancelled') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_request');
  END IF;
  SELECT * INTO _u FROM public.claude_usage WHERE run_id = _run_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_reserved'); END IF;
  IF _u.status <> 'reserved' THEN RETURN jsonb_build_object('ok', false, 'reason', 'already_settled'); END IF;
  SELECT * INTO _p FROM public.claude_prices WHERE model = _u.model;
  IF _input_tokens IS NULL OR _output_tokens IS NULL OR _input_tokens < 0 OR _output_tokens < 0 OR NOT FOUND THEN
    _actual := _u.estimate_cents;
  ELSE
    _actual := public.claude_estimate_cents(_input_tokens, _output_tokens, _p.in_cents_per_mtok, _p.out_cents_per_mtok);
  END IF;
  UPDATE public.claude_usage SET status = _status, actual_cents = _actual,
    input_tokens = _input_tokens, output_tokens = _output_tokens, settled_at = now()
  WHERE id = _u.id;
  INSERT INTO public.razul_control_audit (actor_id, action, record_type, record_id)
  VALUES (_u.owner_id, 'claude_settle_' || _status, 'claude_usage', _run_id::text);
  RETURN jsonb_build_object('ok', true, 'actual_cents', _actual);
END $$;
REVOKE ALL ON FUNCTION public.claude_settle(uuid, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claude_settle(uuid, text, integer, integer) TO service_role;

-- Owner (aal2) controls: prices and per-agent engine switches.
CREATE OR REPLACE FUNCTION public.claude_owner_set_price(_model text, _in numeric, _out numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.is_razul_owner() OR coalesce(auth.jwt()->>'aal', '') <> 'aal2' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'owner_unverified');
  END IF;
  IF _model NOT IN ('claude-sonnet-5-5', 'claude-opus-5-5') OR _in IS NULL OR _out IS NULL
     OR _in <= 0 OR _out <= 0 OR _in > 1000000 OR _out > 1000000 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_request');
  END IF;
  INSERT INTO public.claude_prices (model, in_cents_per_mtok, out_cents_per_mtok, confirmed_by, confirmed_at)
  VALUES (_model, _in, _out, auth.uid(), now())
  ON CONFLICT (model) DO UPDATE SET in_cents_per_mtok = EXCLUDED.in_cents_per_mtok,
    out_cents_per_mtok = EXCLUDED.out_cents_per_mtok, confirmed_by = EXCLUDED.confirmed_by, confirmed_at = now();
  INSERT INTO public.razul_control_audit (actor_id, action, record_type, record_id)
  VALUES (auth.uid(), 'claude_price_confirmed', 'claude_prices', _model);
  RETURN jsonb_build_object('ok', true);
END $$;
REVOKE ALL ON FUNCTION public.claude_owner_set_price(text, numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claude_owner_set_price(text, numeric, numeric) TO authenticated;

CREATE OR REPLACE FUNCTION public.claude_owner_set_engine(_agent text, _model text, _enabled boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.is_razul_owner() OR coalesce(auth.jwt()->>'aal', '') <> 'aal2' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'owner_unverified');
  END IF;
  IF _agent NOT IN ('omni', 'dread', 'draco') OR _model NOT IN ('claude-sonnet-5-5', 'claude-opus-5-5') OR _enabled IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_request');
  END IF;
  INSERT INTO public.claude_engine_settings (owner_id, agent_id, model, enabled, updated_at)
  VALUES (auth.uid(), _agent, _model, _enabled, now())
  ON CONFLICT (owner_id, agent_id) DO UPDATE SET model = EXCLUDED.model, enabled = EXCLUDED.enabled, updated_at = now();
  INSERT INTO public.razul_control_audit (actor_id, action, record_type, record_id)
  VALUES (auth.uid(), CASE WHEN _enabled THEN 'claude_engine_on' ELSE 'claude_engine_off' END, 'claude_engine_settings', _agent);
  RETURN jsonb_build_object('ok', true);
END $$;
REVOKE ALL ON FUNCTION public.claude_owner_set_engine(text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claude_owner_set_engine(text, text, boolean) TO authenticated;