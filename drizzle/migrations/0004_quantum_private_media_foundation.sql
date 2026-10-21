ALTER TABLE public.beta_access ADD COLUMN studio_approved boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.beta_access.studio_approved IS 'Service-managed default-deny media beta gate, separate from AI approval.';
CREATE TABLE public.studio_assets (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL DEFAULT auth.uid(), project_id uuid NOT NULL,
 role text NOT NULL CHECK (role IN ('original','enhanced')), source_id uuid,
 byte_size integer NOT NULL CHECK (byte_size BETWEEN 44 AND 4194304), gain_db numeric CHECK (gain_db BETWEEN -24 AND 12),
 rights_consent boolean NOT NULL CHECK (rights_consent), privacy_consent boolean NOT NULL CHECK (privacy_consent),
 metrics jsonb, sha256 text CHECK (sha256 IS NULL OR sha256 ~ '^[a-f0-9]{64}$'), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,owner_id), FOREIGN KEY (project_id,owner_id) REFERENCES public.beta_projects(id,owner_id) ON DELETE CASCADE,
 FOREIGN KEY (source_id,owner_id) REFERENCES public.studio_assets(id,owner_id),
 CHECK ((role='original' AND source_id IS NULL AND gain_db IS NULL) OR (role='enhanced' AND source_id IS NOT NULL AND gain_db IS NOT NULL))
);
REVOKE ALL ON public.studio_assets FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.studio_assets TO authenticated;
GRANT ALL ON public.studio_assets TO service_role;
ALTER TABLE public.studio_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY studio_owner_read ON public.studio_assets FOR SELECT TO authenticated USING ((SELECT auth.uid())=owner_id);
CREATE POLICY studio_owner_delete ON public.studio_assets FOR DELETE TO authenticated USING ((SELECT auth.uid())=owner_id);
CREATE POLICY studio_owner_insert ON public.studio_assets FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid())=owner_id AND EXISTS (SELECT 1 FROM public.beta_access a WHERE a.user_id=(SELECT auth.uid()) AND a.studio_approved AND NOT a.paused));
CREATE INDEX studio_assets_owner_idx ON public.studio_assets(owner_id);
CREATE FUNCTION public.limit_studio_assets() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.owner_id::text,0));
 IF (SELECT count(*) FROM public.studio_assets WHERE owner_id=NEW.owner_id)>=8 THEN RAISE EXCEPTION 'Media beta limit is eight assets including versions'; END IF;
 IF NEW.source_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.studio_assets s WHERE s.id=NEW.source_id AND s.owner_id=NEW.owner_id AND s.project_id=NEW.project_id AND s.role='original') THEN RAISE EXCEPTION 'Invalid original source'; END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.limit_studio_assets() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER studio_asset_limits BEFORE INSERT ON public.studio_assets FOR EACH ROW EXECUTE FUNCTION public.limit_studio_assets();
CREATE TRIGGER studio_asset_audit AFTER INSERT OR DELETE ON public.studio_assets FOR EACH ROW EXECUTE FUNCTION public.record_beta_change();
CREATE POLICY studio_storage_read ON storage.objects FOR SELECT TO authenticated USING (bucket_id='quantum-studio' AND EXISTS (SELECT 1 FROM public.studio_assets s WHERE s.owner_id=(SELECT auth.uid()) AND name=s.owner_id::text||'/'||s.id::text||'/audio.wav'));
CREATE POLICY studio_storage_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id='quantum-studio' AND EXISTS (SELECT 1 FROM public.studio_assets s JOIN public.beta_access a ON a.user_id=s.owner_id WHERE s.owner_id=(SELECT auth.uid()) AND a.studio_approved AND NOT a.paused AND name=s.owner_id::text||'/'||s.id::text||'/audio.wav' AND (metadata->>'size')::bigint<=s.byte_size AND metadata->>'mimetype' IN ('audio/wav','audio/x-wav','audio/wave')));
CREATE POLICY studio_storage_delete ON storage.objects FOR DELETE TO authenticated USING (bucket_id='quantum-studio' AND EXISTS (SELECT 1 FROM public.studio_assets s WHERE s.owner_id=(SELECT auth.uid()) AND name=s.owner_id::text||'/'||s.id::text||'/audio.wav'));
COMMENT ON TABLE public.studio_assets IS 'Private consented WAV versions; immutable owner records and measured metadata, not signed receipts or independent audio quality/rights proof. No public URLs or publication. Eight assets per owner.';