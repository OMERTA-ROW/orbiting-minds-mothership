import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { DemoBadge, GoldButton, PageHeader, Section } from "@/components/evo";
import { seo } from "@/lib/seo";
import { OpenCallPaths } from "@/components/genesis/OpenCall";

export const Route = createFileRoute("/join")({
  head: () => seo("Join the Network", "Request to join EVOLUTION as a developer, researcher, agent operator or partner."),
  component: Page,
});

const schema = z.object({
  name: z.string().trim().min(2, "Please enter your name (2+ characters).").max(80),
  email: z.string().trim().email("Enter a valid email address.").max(200),
  role: z.enum(["Developer", "Researcher", "AI agent operator", "Inventor", "Partner"], { errorMap: () => ({ message: "Choose a role." }) }),
  mode: z.enum(["Public", "Invite-only", "Private"]),
  interest: z.string().trim().min(10, "Tell us a little more (10+ characters).").max(600),
  consent: z.literal(true, { errorMap: () => ({ message: "Please confirm you understand this is a demo." }) }),
});

type Errors = Partial<Record<keyof z.infer<typeof schema>, string>>;
const field = "w-full rounded-lg border border-input bg-card px-3 py-2.5 text-sm focus:border-gold focus:outline-none";

function Page() {
  const [errors, setErrors] = useState<Errors>({});
  const [done, setDone] = useState<string | null>(null);

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const r = schema.safeParse({ ...Object.fromEntries(fd), consent: fd.get("consent") === "on" });
    if (!r.success) {
      const errs: Errors = {};
      r.error.issues.forEach((i) => { errs[i.path[0] as keyof Errors] ??= i.message; });
      setErrors(errs);
      return;
    }
    setErrors({});
    setDone(r.data.name);
  };

  const err = (k: keyof Errors) => errors[k] && <p id={`${k}-err`} className="mt-1 text-xs text-destructive">{errors[k]}</p>;

  return (
    <>
      <PageHeader eyebrow="Join" title="Join the Network">
        Request early access. <DemoBadge className="ml-1 align-middle" label="Local demo · nothing is sent" />
      </PageHeader>
      <Section>
        <div className="mb-10"><OpenCallPaths /></div>
        <div className="glass mx-auto max-w-2xl p-6 md:p-8">
          {done ? (
            <div role="status" className="py-8 text-center">
              <p className="font-display text-3xl text-gold-gradient">Welcome aboard, {done}.</p>
              <p className="mt-3 text-sm text-muted-foreground">Your request was validated locally in this demo. No data was stored or sent — a real waitlist is not yet connected.</p>
              <GoldButton variant="ghost" className="mt-6" onClick={() => setDone(null)}>Submit another</GoldButton>
            </div>
          ) : (
            <form onSubmit={submit} noValidate className="grid gap-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <label className="text-sm">Name<input name="name" className={field + " mt-1.5"} aria-invalid={!!errors.name} aria-describedby="name-err" />{err("name")}</label>
                <label className="text-sm">Email<input name="email" type="email" className={field + " mt-1.5"} aria-invalid={!!errors.email} aria-describedby="email-err" />{err("email")}</label>
              </div>
              <div className="grid gap-5 sm:grid-cols-2">
                <label className="text-sm">Role
                  <select name="role" defaultValue="" className={field + " mt-1.5"} aria-invalid={!!errors.role}>
                    <option value="" disabled>Select…</option>
                    {["Developer", "Researcher", "AI agent operator", "Inventor", "Partner"].map((r) => <option key={r}>{r}</option>)}
                  </select>{err("role")}
                </label>
                <label className="text-sm">Participation mode
                  <select name="mode" defaultValue="Private" className={field + " mt-1.5"}>
                    {["Public", "Invite-only", "Private"].map((r) => <option key={r}>{r}</option>)}
                  </select>
                </label>
              </div>
              <label className="text-sm">What would you like to evolve?<textarea name="interest" rows={4} className={field + " mt-1.5"} aria-invalid={!!errors.interest} />{err("interest")}</label>
              <label className="flex items-start gap-2 text-sm text-muted-foreground">
                <input type="checkbox" name="consent" className="mt-1 accent-[var(--gold)]" />
                I understand this is an owner-reviewed prototype and my request is only validated locally.
              </label>
              {err("consent")}
              <GoldButton type="submit" className="justify-self-start">Request access</GoldButton>
            </form>
          )}
        </div>
      </Section>
    </>
  );
}
