# OMNI secrets and integrations audit (read-only)

Based on setting names the code reads, and the names saved in Lovable (10). No values were read. Nothing was changed. CODE stays off and emergency stop stays on. The $10 total cap is still unverified.

## Already set in Lovable (no action)
| Name | Purpose | Status |
|---|---|---|
| LOVABLE_API_KEY | OMNI/Razul text agent through the built-in AI service | Managed, present. Never tested with a real request |
| LOVABLE_CRON_SECRET | Signs the scheduled daily knowledge and Razul feed runs | Managed, present |
| SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY / SUPABASE_SERVICE_ROLE_KEY | Sign-in, database, owner checks | Supplied automatically by Lovable Cloud. Never add these by hand |
| OMNI_LINK_CLIENT_ID, OMNI_LINK_OWNER_ID, OMNI_LINK_PROJECT_ID, OMNI_LINK_APPROVAL_ID | Jackboy link identity | Present. Format checked earlier |
| OMNI_LINK_BOOTSTRAP_KEY, OMNI_LINK_HMAC_SECRET | Jackboy link signing keys | Present. Must match Railway exactly (unverified) |
| JACKBOY_LINK_ORIGIN | Jackboy's public Railway web address (option A) | Present |

## Still needed for the core OMNI to Jackboy link, in order
1. **Jackboy side (Railway, owner):** pin Node 26+, apply migration `0030_omni_sessions`, confirm SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set for Jackboy's *own* database, and confirm `/api/public/omni/link` treats Railway's proxy as HTTPS. CODE_PROVIDER_API_KEY stays on Railway only. Never duplicate it in Lovable.
2. **JACKBOY_LINK_MOTHERSHIP_OWNER_ID (Lovable):** your OMNI account ID. Comes from your signed-in account; I can fill it in safely after you approve.
3. **OMNI_LINK_APPROVAL_EXPIRES_AT (Lovable and Railway, same value):** set at approval step 7, at most 24 hours ahead.
4. **JACKBOY_LINK_SELF_TEST_ENABLED (Lovable):** turn on only at step 8. Turn it off again afterwards.
5. **JACKBOY_LINK_ENABLED (Lovable) plus OMNI_LINK_ENABLED (Railway):** live switches, step 9 only.
6. **CODE production switch (Railway):** step 10, only after the $10 OpenAI cap and $5 daily limit are confirmed in your OpenAI dashboard.

## Optional or future (do not set now)
- JACKBOY_DISPATCH_ENABLED / _CLIENT_ID / _HMAC_SECRET: sending jobs to Jackboy. Deferred until the runner exists.
- JACKBOY_CALLBACK_ENABLED / _ORIGIN / _CLIENT_ID / _HMAC_SECRET: Jackboy reporting results back. Deferred.
- LOVABLE_CRON_SECRET_PREVIOUS: only used while the cron secret is being rotated.

## Redundant or mismatched
- **HC_OWNER_EMAIL:** saved, but no code reads it. Safe to leave or delete later. Owner identity comes from the database instead.
- **JACKBOY_CALLBACK_CA_FILE:** points to a certificate file, which conflicts with option A. Never set it. The callback code should get the same public-certificate fix later.

## Area-by-area results
- **Sign-in and two-factor:** live. Needs no extra keys.
- **Voice:** uses the browser's built-in dictation. Needs no key.
- **Agent provider:** connected through LOVABLE_API_KEY. A real request is still unverified.
- **CODE gateway:** runs on Railway. Off.
- **Mac/Windows companion, Honeycomb, GitHub and social:** demo or blocked. No secrets are needed yet. GitHub needs no secrets for this project.

## Blockers
Everything Jackboy-side in step 1, the matching key values (only Railway can confirm them), owner approvals for steps 7 to 10, and the unverified $10 total cap.

## If approved
I would make no code changes. The only possible next action is opening a secure form for JACKBOY_LINK_MOTHERSHIP_OWNER_ID, and only if you ask.
