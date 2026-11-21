-- Dread and Draco memory (owner-controlled). The owner saves, reviews and deletes entries through the
-- existing owner/aal2 functions. A per-agent switch (off by default) lets that agent's delegated chat reply
-- read only that agent's own entries for the delegation's owner, once per reply, inside the same checks as
-- the reply (delegation, AI approval, Emergency Stop). Memory text is never copied into run or audit rows.
ALTER TABLE public.omni_agent_memories DROP CONSTRAINT omni_agent_memories_agent_id_check;
ALTER TABLE public.omni_agent_memories ADD CONSTRAINT omni_agent_memories_agent_id_check
  CHECK (agent_id IN ('omni', 'jackboy', 'jax', 'razul', 'sabrina', 'guardian', 'hercules', 'honeycomb', 'dread', 'draco'));
ALTER TABLE public.omni_agent_memory_audit DROP CONSTRAINT omni_agent_memory_audit_event_check;
ALTER TABLE public.omni_agent_memory_audit ADD CONSTRAINT omni_agent_memory_audit_event_check
  CHECK (event IN ('saved', 'deleted', 'retrieved', 'deleted_all', 'chat_use_on', 'chat_use_off', 'used_in_chat'));

CREATE OR REPLACE FUNCTION public.omni_memory_valid_agent(_agent text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $$
  SELECT COALESCE(_agent, '') IN ('omni', 'jackboy', 'jax', 'razul', 'sabrina', 'guardian', 'hercules', 'honeycomb', 'dread', 'draco')
$$;

CREATE TABLE public.omni_agent_memory_settings (
  owner_id uuid NOT NULL,
  agent_id text NOT NULL CHECK (agent_id IN ('dread', 'draco')),
  use_in_chat boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, agent_id)
);
REVOKE ALL ON public.omni_agent_memory_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.omni_agent_memory_settings TO authenticated;
GRANT ALL ON public.omni_agent_memory_settings TO service_role;
ALTER TABLE public.omni_agent_memory_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Verified MFA owner reads own memory settings"
  ON public.omni_agent_memory_settings FOR SELECT TO authenticated
  USING (public.is_razul_owner() AND owner_id = auth.uid());
COMMENT ON TABLE public.omni_agent_memory_settings IS
  'Owner switch per chat agent: whether its OMNI web chat replies may read that agent''s own saved memory. Missing row = off.';

-- Which agent's memory a reply read and how much (no text). Single use per reply.
ALTER TABLE public.omni_delegated_chat_runs
  ADD COLUMN memory_agent_id text CHECK (memory_agent_id IN ('dread', 'draco')),
  ADD COLUMN memory_entries integer CHECK (memory_entries BETWEEN 0 AND 40),
  ADD COLUMN memory_chars integer CHECK (memory_chars BETWEEN 0 AND 6000);

CREATE OR REPLACE FUNCTION public.omni_memory_set_chat_use(_agent text, _on boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  PERFORM public.assert_razul_owner();
  IF COALESCE(_agent, '') NOT IN ('dread', 'draco') OR _on IS NULL THEN
    RAISE EXCEPTION 'Only Dread and Draco can use memory in chat' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.omni_agent_memory_settings (owner_id, agent_id, use_in_chat, updated_at)
  VALUES (auth.uid(), _agent, _on, now())
  ON CONFLICT (owner_id, agent_id) DO UPDATE SET use_in_chat = EXCLUDED.use_in_chat, updated_at = now();
  INSERT INTO public.omni_agent_memory_audit (actor_id, agent_id, event, item_count)
  VALUES (auth.uid(), _agent, CASE WHEN _on THEN 'chat_use_on' ELSE 'chat_use_off' END, 0);
  RETURN _on;
END $$;

CREATE OR REPLACE FUNCTION public.omni_memory_delete_all(_agent text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  _n integer;
BEGIN
  PERFORM public.assert_razul_owner();
  IF NOT public.omni_memory_valid_agent(_agent) THEN
    RAISE EXCEPTION 'Unknown agent' USING ERRCODE = '22023';
  END IF;
  DELETE FROM public.omni_agent_memories m WHERE m.owner_id = auth.uid() AND m.agent_id = _agent;
  GET DIAGNOSTICS _n = ROW_COUNT;
  INSERT INTO public.omni_agent_memory_audit (actor_id, agent_id, event, item_count)
  VALUES (auth.uid(), _agent, 'deleted_all', _n);
  RETURN _n;
END $$;

-- Service-only. Called by the chat server right after admission, before the model call.
CREATE OR REPLACE FUNCTION public.omni_delegation_chat_memory(
  _token_hash text, _audience text, _run_id uuid, _agent text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  _c jsonb;
  _r public.omni_delegated_chat_runs;
  _on boolean;
  _entries jsonb;
  _n integer;
  _chars integer;
  _total integer;
BEGIN
  IF COALESCE(_agent, '') NOT IN ('dread', 'draco') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'agent_without_memory');
  END IF;
  -- Same checks as the request-bound re-check: delegation, run, AI approval, Emergency Stop.
  _c := public.omni_delegation_check_chat(_token_hash, _audience, _run_id);
  IF (_c->>'ok')::boolean IS DISTINCT FROM true THEN
    RETURN jsonb_build_object('ok', false, 'reason', COALESCE(_c->>'reason', 'check_unavailable'));
  END IF;
  SELECT * INTO _r FROM public.omni_delegated_chat_runs WHERE id = _run_id FOR UPDATE;
  IF _r.memory_agent_id IS NOT NULL OR _r.memory_entries IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'memory_already_read');
  END IF;
  SELECT s.use_in_chat INTO _on FROM public.omni_agent_memory_settings s
  WHERE s.owner_id = _r.owner_id AND s.agent_id = _agent;
  IF NOT COALESCE(_on, false) THEN
    UPDATE public.omni_delegated_chat_runs SET memory_agent_id = _agent, memory_entries = 0, memory_chars = 0
    WHERE id = _run_id;
    RETURN jsonb_build_object('ok', true, 'enabled', false, 'entries', '[]'::jsonb, 'omitted', 0);
  END IF;
  SELECT count(*) INTO _total FROM public.omni_agent_memories m
  WHERE m.owner_id = _r.owner_id AND m.agent_id = _agent;
  WITH ordered AS (
    SELECT m.id, m.kind, m.title, m.body, m.created_at,
           sum(length(m.title) + length(m.body)) OVER (ORDER BY m.created_at DESC, m.id) AS running,
           row_number() OVER (ORDER BY m.created_at DESC, m.id) AS rn
    FROM public.omni_agent_memories m
    WHERE m.owner_id = _r.owner_id AND m.agent_id = _agent
  ), kept AS (
    SELECT * FROM ordered WHERE running <= 6000 AND rn <= 40
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', k.id, 'kind', k.kind, 'title', k.title, 'body', k.body,
                                               'created_at', k.created_at) ORDER BY k.rn), '[]'::jsonb),
         count(*), COALESCE(max(k.running), 0)
    INTO _entries, _n, _chars
  FROM kept k;
  UPDATE public.omni_delegated_chat_runs SET memory_agent_id = _agent, memory_entries = _n, memory_chars = _chars
  WHERE id = _run_id;
  INSERT INTO public.omni_agent_memory_audit (actor_id, agent_id, event, item_count)
  VALUES (_r.owner_id, _agent, 'used_in_chat', _n);
  RETURN jsonb_build_object('ok', true, 'enabled', true, 'entries', _entries, 'omitted', _total - _n);
END $$;

REVOKE ALL ON FUNCTION public.omni_memory_valid_agent(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.omni_memory_valid_agent(text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.omni_memory_set_chat_use(text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.omni_memory_set_chat_use(text, boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.omni_memory_delete_all(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.omni_memory_delete_all(text) TO authenticated;
REVOKE ALL ON FUNCTION public.omni_delegation_chat_memory(text, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.omni_delegation_chat_memory(text, text, uuid, text) TO service_role;