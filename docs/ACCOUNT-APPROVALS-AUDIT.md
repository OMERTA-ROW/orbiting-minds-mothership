# Account sign-in and Activation Approvals audit (2026-11-13, read-only)

## What happened at sign-in today (auth log + database, same user id throughout)
| UTC | Event |
|---|---|
| 16:17:53 | Google sign-in, existing account `40543e40…` (created 2026-11-01, one Google identity) |
| 16:19:36 | Two-step code accepted (old authenticator, enrolled 2026-11-12) |
| 16:20:51 | "Turn off two-step sign-in" confirmed on Account security: old authenticator + recovery codes removed (`mfa_disabled` event) |
| 16:20:54 | New authenticator setup started; two wrong codes; accepted 16:22:06 |
| 16:23:12 | 10 new recovery codes created |

No second account exists (`auth.users` = 1 row). Owner role, beta record and project are unchanged.
Turning two-step off and setting it up again looks like starting over, but it is the same account.

## Identity uniqueness (already enforced)
- `auth.identities UNIQUE (provider_id, provider)`: a returning Google sign-in always resolves to the same account.
- `beta_access` primary key on `user_id` + `ON CONFLICT DO NOTHING` sign-up trigger: idempotent.
- `user_roles UNIQUE (user_id, role)`; `claim_owner()` locks `owner_config` and refuses a second owner or unconfirmed email.
- No `profiles` table exists, so no profile can be duplicated.
- Platform note: the sign-in service links a new provider to an existing account when the provider's email is
  verified and matches (for example email/password after the confirmation link is opened). This app never merges
  accounts itself and has no control over that platform rule; email confirmation stays required.

## Why the owner saw nothing on Activation Approvals
Code for database update `0051_activation_approval_checks` shipped, but the update was never applied
(51 of 52 updates applied). The page read the missing `activation_approval_checks` table, failed, and showed the
generic "private to the verified owner" screen, even to the owner.
Fixed in source: the page now lists approvals without the check store, says exactly which update is missing,
disables Run check, and shows a specific reason when access is refused (not signed in, not the owner, two-step
code needed, records unreadable).

## Current approval records (unchanged)
Step 1 approved 2026-11-12 21:25 UTC; steps 2–10 pending. Step 1 predates today's two-step reset, so the page
and server functions now treat it as "Needs fresh approval".

## Owner approvals required (not done)
1. Apply `drizzle/migrations/0051_activation_approval_checks.sql` byte-for-byte. Effect: creates the check store and
   resets every non-pending approval to Pending with a `fresh_evidence_required` audit row (today: step 1).
2. Optional proposed update 0052 (not written to the migrations folder): enforce the security-reset rule in the
   database too, and a single-owner index.

```sql
CREATE UNIQUE INDEX user_roles_single_owner ON public.user_roles (role) WHERE role = 'owner';

CREATE FUNCTION public.activation_approvals_on_security_reset() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.event IN ('mfa_disabled', 'recovery_completed', 'admin_factor_removed')
     AND public.has_role(NEW.user_id, 'owner') THEN
    INSERT INTO public.razul_control_audit(actor_id, action, record_type, record_id)
    SELECT NEW.user_id, 'security_reset', 'activation_approval', step::text
    FROM public.activation_approvals WHERE status <> 'pending';
    UPDATE public.activation_approvals
    SET status = 'pending', approver_id = NULL, decided_at = now(), note = '',
        approval_expires_at = NULL, spend_confirmations = NULL, revision = revision + 1
    WHERE status <> 'pending';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.activation_approvals_on_security_reset() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER activation_approvals_security_reset AFTER INSERT ON public.owner_mfa_recovery_events
  FOR EACH ROW EXECUTE FUNCTION public.activation_approvals_on_security_reset();
```
