-- Per-agent OMNI memory kept in Mothership only. The verified two-step owner saves, lists (one agent per call)
-- and deletes entries explicitly. No agent, model, OMNI/Railway service or Jackboy reads this table, and nothing
-- here sends data anywhere. The audit keeps metadata only (no titles, bodies or hashes), so a delete is a real delete.
CREATE TABLE public.omni_agent_memories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  agent_id text NOT NULL CHECK (agent_id IN ('omni', 'jackboy', 'jax', 'razul', 'sabrina', 'guardian', 'hercules', 'honeycomb')),
  kind text NOT NULL CHECK (kind IN ('fact', 'instruction', 'preference', 'reference', 'note')),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 120),
  body text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 8000),
  source_kind text NOT NULL CHECK (source_kind IN ('owner_typed', 'terminal_session', 'held_task', 'document', 'web_page')),
  source_ref text NOT NULL DEFAULT '' CHECK (length(source_ref) <= 300),
  body_sha256 text NOT NULL CHECK (body_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX omni_agent_memories_scope_idx ON public.omni_agent_memories (owner_id, agent_id, created_at DESC);
-- No direct browser access: reads go through omni_memory_list, which always requires exactly one agent.
REVOKE ALL ON public.omni_agent_memories FROM anon, authenticated;
GRANT ALL ON public.omni_agent_memories TO service_role;
ALTER TABLE public.omni_agent_memories ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.omni_agent_memory_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid NOT NULL,
  agent_id text NOT NULL,
  memory_id uuid,
  event text NOT NULL CHECK (event IN ('saved', 'deleted', 'retrieved')),
  item_count integer NOT NULL DEFAULT 0 CHECK (item_count >= 0)
);
CREATE INDEX omni_agent_memory_audit_scope_idx ON public.omni_agent_memory_audit (actor_id, agent_id, at DESC);
REVOKE ALL ON public.omni_agent_memory_audit FROM anon, authenticated;
GRANT SELECT ON public.omni_agent_memory_audit TO authenticated;
GRANT ALL ON public.omni_agent_memory_audit TO service_role;
ALTER TABLE public.omni_agent_memory_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Verified MFA owner reads own memory audit"
  ON public.omni_agent_memory_audit FOR SELECT TO authenticated
  USING (public.is_razul_owner() AND actor_id = auth.uid());
CREATE TRIGGER omni_agent_memory_audit_append_only BEFORE UPDATE OR DELETE ON public.omni_agent_memory_audit
  FOR EACH ROW EXECUTE FUNCTION public.omni_append_only();
CREATE TRIGGER omni_agent_memory_audit_no_truncate BEFORE TRUNCATE ON public.omni_agent_memory_audit
  FOR EACH STATEMENT EXECUTE FUNCTION public.omni_append_only();

CREATE OR REPLACE FUNCTION public.omni_memory_valid_agent(_agent text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $$
  SELECT COALESCE(_agent, '') IN ('omni', 'jackboy', 'jax', 'razul', 'sabrina', 'guardian', 'hercules', 'honeycomb')
$$;

CREATE OR REPLACE FUNCTION public.omni_memory_save(
  _agent text, _kind text, _title text, _body text, _source_kind text, _source_ref text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  _id uuid;
  _title_clean text := COALESCE(btrim(_title), '');
  _body_clean text := COALESCE(btrim(_body), '');
  _ref text := COALESCE(btrim(_source_ref), '');
BEGIN
  PERFORM public.assert_razul_owner();
  IF NOT public.omni_memory_valid_agent(_agent) THEN
    RAISE EXCEPTION 'Unknown agent' USING ERRCODE = '22023';
  END IF;
  IF public.omni_terminal_secret_like(_title_clean) OR public.omni_terminal_secret_like(_body_clean)
     OR public.omni_terminal_secret_like(_ref) THEN
    RAISE EXCEPTION 'This looks like a key or token; remove it before saving' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(*) FROM public.omni_agent_memories m WHERE m.owner_id = auth.uid() AND m.agent_id = _agent) >= 500 THEN
    RAISE EXCEPTION 'This agent already has 500 memories; delete some first' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.omni_agent_memories (owner_id, agent_id, kind, title, body, source_kind, source_ref, body_sha256)
  VALUES (auth.uid(), _agent, _kind, _title_clean, _body_clean, _source_kind, _ref,
          encode(sha256(convert_to(_body_clean, 'UTF8')), 'hex'))
  RETURNING id INTO _id;
  INSERT INTO public.omni_agent_memory_audit (actor_id, agent_id, memory_id, event, item_count)
  VALUES (auth.uid(), _agent, _id, 'saved', 1);
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.omni_memory_list(_agent text)
RETURNS SETOF public.omni_agent_memories
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
  SELECT count(*) INTO _n FROM public.omni_agent_memories m WHERE m.owner_id = auth.uid() AND m.agent_id = _agent;
  INSERT INTO public.omni_agent_memory_audit (actor_id, agent_id, event, item_count)
  VALUES (auth.uid(), _agent, 'retrieved', LEAST(_n, 200));
  RETURN QUERY
    SELECT * FROM public.omni_agent_memories m
    WHERE m.owner_id = auth.uid() AND m.agent_id = _agent
    ORDER BY m.created_at DESC
    LIMIT 200;
END $$;

CREATE OR REPLACE FUNCTION public.omni_memory_delete(_id uuid, _agent text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  PERFORM public.assert_razul_owner();
  IF NOT public.omni_memory_valid_agent(_agent) THEN
    RAISE EXCEPTION 'Unknown agent' USING ERRCODE = '22023';
  END IF;
  DELETE FROM public.omni_agent_memories m
  WHERE m.id = _id AND m.owner_id = auth.uid() AND m.agent_id = _agent;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Memory not found for this agent' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.omni_agent_memory_audit (actor_id, agent_id, memory_id, event, item_count)
  VALUES (auth.uid(), _agent, _id, 'deleted', 1);
  RETURN true;
END $$;

REVOKE ALL ON FUNCTION public.omni_memory_valid_agent(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.omni_memory_save(text, text, text, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.omni_memory_list(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.omni_memory_delete(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.omni_memory_valid_agent(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.omni_memory_save(text, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.omni_memory_list(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.omni_memory_delete(uuid, text) TO authenticated;