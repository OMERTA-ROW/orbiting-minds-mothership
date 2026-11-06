# OMNI–Jackboy link: secure setting entry (plan only)

Nothing gets changed while you review this plan. No code edits, secrets, deploys, publishing, live switches or self-test.

## Current status (checked by name only, no values read)

| Setting | Where it goes | Status here |
|---|---|---|
| OMNI_LINK_CLIENT_ID | OMNI + Jackboy host | Missing |
| OMNI_LINK_PROJECT_ID | OMNI + Jackboy host | Missing |
| OMNI_LINK_OWNER_ID | OMNI + Jackboy host | Missing |
| OMNI_LINK_APPROVAL_ID | OMNI + Jackboy host | Missing |
| OMNI_LINK_APPROVAL_EXPIRES_AT | OMNI + Jackboy host | Missing (add only right before the approved test) |
| OMNI_LINK_BOOTSTRAP_KEY | OMNI + Jackboy host (identical) | Missing |
| OMNI_LINK_HMAC_SECRET | OMNI + Jackboy host (identical) | Missing |
| JACKBOY_LINK_ORIGIN (Railway HTTPS address) | OMNI + Jackboy host | Missing |
| OMNI_LINK_BIND_ADDRESS, TLS cert/key paths | Jackboy Railway host only | Unknown (I can't see Railway) |
| Audit directory | Jackboy host | Unknown: the spec names no audit-directory setting. Confirm it in Jackboy's guide |
| OMNI_LINK_ENABLED, OMNI_LINK_NODE_RUNNER_ENABLED | Jackboy host | Must stay unset until you approve the self-test |

The only secrets in this project now are HC_OWNER_EMAIL and two managed system keys. None of them are link settings.

## Which entry prompts Lovable can show

- **Lovable can't open a secure entry form here.** The secret tools I have can only store a value I already know or mint a random one, and minted values can never be revealed. The two shared keys must match Jackboy exactly, so I won't generate them.
- **You enter everything yourself** in **Project Settings → Secrets**, one name at a time, using the exact names above. Never paste values into chat.
- **Railway settings** are added in Railway's own Variables screen. Lovable can't reach it.

## Where each value comes from

1. **CLIENT_ID**: a short name you choose (letters, numbers, `-` or `_`, up to 64 characters). Use the same name on both sides.
2. **PROJECT_ID and OWNER_ID**: copy them from the Jackboy Dev Control project (its owner project record and your owner account). Don't use OMNI's IDs.
3. **APPROVAL_ID**: the ID of the new grant you review and approve in Jackboy.
4. **APPROVAL_EXPIRES_AT**: a date and time at most 24 hours ahead, set just before the test.
5. **BOOTSTRAP_KEY and HMAC_SECRET**: if Jackboy already has values, copy them from your password manager. Don't make replacements. If they don't exist yet, create two separate 32-byte hex values in your password manager, then save each one in both places.
6. **JACKBOY_LINK_ORIGIN**: Railway's public HTTPS address for the Node 26+ service. Use the address only, with no path.

## After approval (still no live link)

- I check that each name is present, without reading values, and report present, missing or unknown.
- The live switches and self-test stay off until you approve them separately.
