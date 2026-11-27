# Evolution Git — owner deployment steps (existing Vultr host, no purchase)

Status: NOT DEPLOYED. Nothing here is live until the owner runs these steps and the review passes.

1. Check free capacity on the existing server first (`df -h`, `free -m`, `docker ps`): needs ~1 GB RAM, 10 GB disk. Stop if staging/production would be squeezed.
2. Point a DNS name (e.g. `git.evoomni.tech`) at the server; TLS is automatic via Caddy.
3. `GIT_DOMAIN=git.evoomni.tech docker compose up -d` (if ports 80/443 are taken, put Forgejo behind the existing proxy instead of Caddy).
4. Create the admin: `docker compose exec -u git forgejo forgejo admin user create --admin --username evolution-owner --email <you> --random-password`.
5. Create a token for a non-admin bot user with only `write:repository`; save in Project Settings → Secrets as `EVOLUTION_GIT_ORIGIN` (https URL) and `EVOLUTION_GIT_TOKEN`.
6. Add `backup.sh` to daily cron; test a restore with `forgejo restore` on a throwaway copy.
7. Untrusted builds/terminal: use a SEPARATE VM or rootless container host for the OMNI executor (never this container); fill `OMNI_SANDBOX_ORIGIN`, `OMNI_SANDBOX_CLIENT_ID`, `OMNI_SANDBOX_HMAC_SECRET`.
8. Vultr API access for capacity discovery (optional): `VULTR_API_KEY`, restricted to your Mothership IP.

GitHub sync: Forgejo push mirrors (no force push) are configured per repository after step 5; private OMERTA-ROW repos need the org to approve this app's GitHub access.
