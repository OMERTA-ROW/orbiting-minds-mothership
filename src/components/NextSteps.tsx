import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { CheckCircle2, Circle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAccount } from "@/hooks/use-account";
import { Button } from "@/components/ui/button";
import { readOwnerRecovery } from "@/lib/owner-mfa.functions";

type Step = { done: boolean; label: string; to: "/account-security" | "/members" | "/omni-dock" | "/beta"; optional?: boolean; action: string };
type State =
  | { kind: "loading" }
  | { kind: "member" }
  | { kind: "owner"; steps: Step[] }
  | { kind: "error" };

/** Pure: owner onboarding steps from real account state, in order. */
export function ownerSteps(s: { factors: number; aal2: boolean; codes: number | null }): Step[] {
  return [
    { done: s.factors > 0, label: "Set up your authenticator app", to: "/account-security", action: "Set up" },
    { done: s.aal2, label: "Enter today's 6-digit code", to: "/account-security", action: "Enter code" },
    { done: (s.codes ?? 0) > 0, label: "Save recovery codes", to: "/account-security", action: "Create codes" },
    { done: false, label: "Invite a member", to: "/members", optional: true, action: "Invite" },
    { done: false, label: "Pair a desktop or phone app", to: "/omni-dock", optional: true, action: "Open Docking Bay" },
  ];
}

/** Signed-in home panel: the next real thing to do, from actual account state. */
export function NextSteps() {
  const { user, ready } = useAccount();
  const readRecovery = useServerFn(readOwnerRecovery);
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    if (!ready || !user) return;
    let live = true;
    void (async () => {
      try {
        const [rec, f, a] = await Promise.all([
          readRecovery(),
          supabase.auth.mfa.listFactors(),
          supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
        ]);
        if (!live) return;
        if (!rec.isOwner) return setState({ kind: "member" });
        const factors = f.error
          ? 0
          : (f.data.all ?? []).filter((x) => x.factor_type === "totp" && x.status === "verified").length;
        setState({
          kind: "owner",
          steps: ownerSteps({ factors, aal2: !a.error && a.data.currentLevel === "aal2", codes: rec.codesRemaining }),
        });
      } catch {
        if (live) setState({ kind: "error" });
      }
    })();
    return () => {
      live = false;
    };
  }, [ready, user, readRecovery]);

  if (!ready || !user) return null;
  const next = state.kind === "owner" ? state.steps.find((s) => !s.done && !s.optional) : undefined;

  return (
    <section aria-labelledby="next-h" className="rounded-lg border border-gold/40 bg-background/70 p-5">
      <h2 id="next-h" className="text-lg text-gold-light">
        Your next step
      </h2>
      {state.kind === "loading" && (
        <p role="status" className="mt-2 text-sm text-muted-foreground">
          Checking your account…
        </p>
      )}
      {state.kind === "error" && (
        <p role="alert" className="mt-2 text-sm text-warning">
          Couldn't check your account right now. Your projects are still available.
        </p>
      )}
      {state.kind === "member" && (
        <div className="mt-2 space-y-3 text-sm text-muted-foreground">
          <p>You're signed in. Your private projects are ready. OMNI chat opens once the owner approves AI access for you.</p>
          <Button asChild variant="cosmic" size="sm">
            <Link to="/beta">Open my projects</Link>
          </Button>
        </div>
      )}
      {state.kind === "owner" && (
        <div className="mt-3 space-y-4">
          <ol className="space-y-2 text-sm">
            {state.steps.map((s) => {
              const Icon = s.done ? CheckCircle2 : Circle;
              return (
                <li key={s.label} className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2">
                    <Icon size={16} className={s.done ? "text-success" : "text-muted-foreground"} aria-hidden />
                    <span className={s.done ? "text-muted-foreground line-through" : "text-foreground"}>
                      {s.done && <span className="sr-only">Done: </span>}
                      {s.label}
                      {s.optional && <span className="text-xs text-muted-foreground"> (optional)</span>}
                    </span>
                  </span>
                  {!s.done && (
                    <Link to={s.to} className="shrink-0 text-xs text-gold-light underline underline-offset-4">
                      {s.action}
                    </Link>
                  )}
                </li>
              );
            })}
          </ol>
          {next ? (
            <Button asChild variant="cosmic" size="sm">
              <Link to={next.to}>{next.label}</Link>
            </Button>
          ) : (
            <p className="text-sm text-success">Security setup is complete for this session.</p>
          )}
        </div>
      )}
    </section>
  );
}
