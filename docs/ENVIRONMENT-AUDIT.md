# Tracked environment audit

Scope: tracked `.env` at base `af67266cebd4dd141ad28dfebd258379f5425486`
and its sole introducing historical version
`138cef0a43f6b0c1bce2d8827e4c9117bdb52562`, reachable from the fetched main
history. Values were classified locally without printing them to logs or this
document. This is not a scan of deleted remote refs, external forks or deployed
Railway/Lovable secret stores.

| Tracked variable                | Classification                                                |
| ------------------------------- | ------------------------------------------------------------- |
| `SUPABASE_PROJECT_ID`           | Public project identifier                                     |
| `VITE_SUPABASE_PROJECT_ID`      | Public project identifier                                     |
| `SUPABASE_URL`                  | Public HTTPS Supabase endpoint; no embedded credentials/query |
| `VITE_SUPABASE_URL`             | Public HTTPS Supabase endpoint; no embedded credentials/query |
| `SUPABASE_PUBLISHABLE_KEY`      | Supabase `sb_publishable_` client key, not a server secret    |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase `sb_publishable_` client key, not a server secret    |

No service-role, `sb_secret_`, provider, cron or private API credential was found
in the inspected `.env` versions. **No secret rotation is indicated by these
six values alone.** A public publishable key is expected to be shipped to the
browser and is safe only with correctly enforced RLS, auth and grants. This
audit does not independently prove the live database policies.

## Proposed owner-reviewed hygiene

Leave `.env` unchanged in this startup PR to avoid silently breaking Lovable
builds or deployments that currently obtain public configuration from it.
In a separate reviewed change, after identifying all build-time/runtime
configuration sources:

1. Add `.env`/`.env.*` ignore rules with an explicit `.env.example` exception.
2. Provide `.env.example` with placeholders for these six public values, never
   real private keys. Vite uses the public `VITE_*` settings at build time;
   server auth additionally needs its matching server-side settings.
3. Configure each authorized environment separately through its approved
   settings mechanism, then use `git rm --cached .env` (preserves the local file)
   and confirm a clean build with that environment's approved configuration.

Removing a file from tracking **does not remove historical versions**. No
history rewrite is warranted for the inspected public identifiers/keys alone.
Lovable's synchronization rules also forbid rewriting published history without
explicit owner coordination.

If a later audit finds an actual privileged secret in any ref: treat it as
exposed, request approval for provider-native revocation/rotation first, inventory
consumers without copying credentials, and coordinate any separately approved
history remediation with Lovable, GitHub caches/forks and all collaborators.
Never assume history deletion revokes a secret. No such rotation, ref deletion,
force push, credential test, permission change or production configuration change
was performed here.
