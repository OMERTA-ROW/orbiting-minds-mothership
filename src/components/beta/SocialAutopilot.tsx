import { useState } from "react";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Ban, CalendarClock, Download, Save, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { socialDraftQuery } from "@/lib/omni-social-query";
import { saveSocialDraft, transitionSocialDraft } from "@/lib/omni-social.functions";
import { calendarPlans, socialContent, socialExport, socialPlatforms } from "@/lib/omni-platforms";

type FormContent = {
  platform: (typeof socialPlatforms)[number];
  accountLabel: string;
  title: string;
  body: string;
  altText: string;
  hashtags: string;
  license: string;
  targetDate: string;
  timezone: "UTC";
  rights: boolean;
  privacy: boolean;
};
const empty: FormContent = {
  platform: "linkedin",
  accountLabel: "",
  title: "",
  body: "",
  altText: "",
  hashtags: "",
  license: "",
  targetDate: "",
  timezone: "UTC",
  rights: false,
  privacy: false,
};
export function SocialAutopilot({ projects }: { projects: { id: string; name: string }[] }) {
  const { data } = useSuspenseQuery(socialDraftQuery),
    query = useQueryClient(),
    save = useServerFn(saveSocialDraft),
    transition = useServerFn(transitionSocialDraft);
  const [form, setForm] = useState<FormContent>(empty),
    [project, setProject] = useState(""),
    [id, setId] = useState(""),
    [consent, setConsent] = useState(false),
    [review, setReview] = useState(false),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const active = data.rows.find((v) => v.id === id),
    valid = socialContent.safeParse(form);
  // JSON field ordering can differ after database roundtrip; compare parsed fields canonically.
  const same =
    active &&
    socialContent.safeParse(active.content).success &&
    Object.entries(form).every(([k, v]) => (active.content as Record<string, unknown>)[k] === v);
  const patch = (v: Partial<FormContent>) => {
    setForm((s) => ({ ...s, ...v }));
    setConsent(false);
    setReview(false);
  };
  const act = async (fn: () => Promise<unknown>, message: string) => {
    setBusy(true);
    setNotice("");
    try {
      await fn();
      setNotice(message);
      setReview(false);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Action failed; no post recorded.");
    } finally {
      await query
        .invalidateQueries({ queryKey: socialDraftQuery.queryKey })
        .catch(() => setNotice("Refresh failed; reload before another action."));
      setBusy(false);
    }
  };
  const load = (row: (typeof data.rows)[number]) => {
    const parsed = socialContent.safeParse(row.content);
    if (!parsed.success) {
      setNotice("Saved plan invalid; no action.");
      return;
    }
    setForm(parsed.data);
    setProject(row.project_id);
    setId(row.id);
    setConsent(false);
    setReview(false);
    setNotice("");
  };
  return (
    <section aria-label="Social Autopilot" className="space-y-6">
      <div className="flex flex-wrap justify-between gap-4">
        <div>
          <h3 className="text-xl">Creator Social Autopilot</h3>
          <p className="mt-3 text-xs font-mono text-warning">
            PRIVATE DRAFTS / CALENDAR INTENTIONS · AUTOPILOT OFF
          </p>
        </div>
        <Button
          variant="signal"
          disabled={busy || !data.rows.some((v) => v.state !== "STOPPED")}
          onClick={() =>
            void act(
              () => transition({ data: { action: "stop_all" } }),
              "All stored plans stopped. No connected provider, remote job or post to stop.",
            )
          }
        >
          <Ban size={14} />
          Stop all plans
        </Button>
      </div>
      <p className="text-xs leading-6 text-muted-foreground">
        No social account connected. Labels are declarations, dates are UTC intentions, not
        scheduled jobs. Media upload, format/caption rendering, quotas, retries, reconnect alerts
        and verified platform receipts are unavailable. Existing private WAV edits and manual Distro
        exports remain separate from posting.
      </p>
      <div className="grid items-start gap-8 lg:grid-cols-2">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void act(async () => {
              if (!consent) throw new Error("Explicit save consent required.");
              const row = await save({
                data: {
                  projectId: project,
                  id: id || undefined,
                  revision: active?.revision,
                  content: socialContent.parse(form),
                  consent,
                },
              });
              if (row) setId(row.id);
            }, "Private DRAFT saved. Changed content clears review; nothing scheduled or posted.");
          }}
        >
          <label className="block text-xs">
            Your project
            <select
              aria-label="Social owned project"
              required
              value={project}
              disabled={!!id}
              className="exchange-select mt-2 w-full"
              onChange={(e) => {
                setProject(e.target.value);
                setConsent(false);
                setReview(false);
              }}
            >
              <option value="">Select project</option>
              {projects.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs">
            Platform
            <select
              aria-label="Social platform"
              value={form.platform}
              className="exchange-select mt-2 w-full"
              onChange={(e) => patch({ platform: e.target.value as FormContent["platform"] })}
            >
              {socialPlatforms.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          {(
            [
              ["accountLabel", "Declared account label"],
              ["title", "Post title"],
              ["license", "Rights and credits"],
              ["hashtags", "Hashtags"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="block text-xs">
              {label}
              <Input
                aria-label={label}
                value={form[key]}
                required={key !== "hashtags"}
                maxLength={key === "license" ? 500 : key === "hashtags" ? 300 : 100}
                className="mt-2"
                onChange={(e) => patch({ [key]: e.target.value })}
              />
            </label>
          ))}
          <label className="block text-xs">
            Caption / post text
            <Textarea
              aria-label="Post caption"
              value={form.body}
              required
              maxLength={3000}
              className="mt-2"
              onChange={(e) => patch({ body: e.target.value })}
            />
          </label>
          <label className="block text-xs">
            Accessibility alt text
            <Textarea
              aria-label="Post alt text"
              value={form.altText}
              maxLength={500}
              className="mt-2"
              onChange={(e) => patch({ altText: e.target.value })}
            />
          </label>
          <label className="block text-xs">
            Target time — UTC intention only
            <Input
              aria-label="Social target time UTC"
              type="datetime-local"
              value={form.targetDate ? form.targetDate.slice(0, 16) : ""}
              className="mt-2"
              onChange={(e) => {
                const value = e.target.value;
                patch({ targetDate: value ? `${value}:00.000Z` : "" });
              }}
            />
          </label>
          <label className="flex gap-2 text-xs leading-6">
            <input
              aria-label="Social rights consent"
              type="checkbox"
              checked={form.rights}
              onChange={(e) => patch({ rights: e.target.checked })}
            />
            I declare rights, credits and likeness permission for this non-sensitive draft.
          </label>
          <label className="flex gap-2 text-xs leading-6">
            <input
              aria-label="Social privacy consent"
              type="checkbox"
              checked={form.privacy}
              onChange={(e) => patch({ privacy: e.target.checked })}
            />
            I approve private account storage, not external publication.
          </label>
          <label className="flex gap-2 text-xs leading-6">
            <input
              aria-label="Save social consent"
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            Save this exact private plan; no account permission or automatic rule granted.
          </label>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy || !project || !valid.success || !consent}>
              <Save size={14} />
              Save social draft
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setForm(empty);
                setProject("");
                setId("");
                setReview(false);
                setConsent(false);
              }}
            >
              New draft
            </Button>
          </div>
          {active && (
            <div className="space-y-4 border-t border-border pt-4">
              <p className="text-xs font-mono text-warning">
                {active.state} · revision {active.revision} · NOT DELIVERED
              </p>
              <label className="flex gap-2 text-xs leading-6">
                <input
                  aria-label="Review social consent"
                  type="checkbox"
                  checked={review}
                  onChange={(e) => setReview(e.target.checked)}
                />
                I reviewed the exact saved caption, declared account, rights/privacy and date
                intention. This does not approve posting.
              </label>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  disabled={busy || !same || !review || active.state !== "DRAFT"}
                  onClick={() =>
                    void act(
                      () =>
                        transition({
                          data: {
                            action: "review",
                            id: active.id,
                            revision: active.revision,
                            approve: true,
                          },
                        }),
                      "Exact private plan reviewed. Publishing stays blocked.",
                    )
                  }
                >
                  <ShieldCheck size={14} />
                  Review social draft
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy || active.state === "STOPPED"}
                  onClick={() =>
                    void act(
                      () =>
                        transition({
                          data: { action: "stop", id: active.id, revision: active.revision },
                        }),
                      "Stored plan stopped and review withdrawn. No remote acknowledgment claimed.",
                    )
                  }
                >
                  <Ban size={14} />
                  Stop this plan
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy || !same}
                  onClick={() => {
                    const value = socialExport(active.content, active.state);
                    const url = URL.createObjectURL(
                      new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
                    );
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = "omni-social-plan.json";
                    a.click();
                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                  }}
                >
                  <Download size={14} />
                  Export social plan
                </Button>
              </div>
            </div>
          )}
        </form>
        <div className="space-y-6">
          <article className="border-y border-gold/30 py-5">
            <p className="eyebrow">Text preview / not a platform render</p>
            <h4 className="mt-3 break-words text-lg">{form.title || "Untitled draft"}</h4>
            <p className="mt-2 break-words text-xs text-muted-foreground">
              {form.platform} · {form.accountLabel || "No account label"} · NOT CONNECTED
            </p>
            <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-7">
              {form.body || "No caption"}
            </p>
            <p className="mt-3 break-words text-xs text-muted-foreground">{form.hashtags}</p>
            <p className="mt-4 text-xs text-warning">
              No media attached or checked. Rights are declarations, not independent clearance. No
              estimated fee or receipt.
            </p>
          </article>
          <div>
            <h4 className="flex items-center gap-2 text-lg">
              <CalendarClock size={16} />
              Planning calendar · UTC
            </h4>
            <ul className="mt-4 space-y-4">
              {calendarPlans(data.rows).map((row) => {
                const c = socialContent.parse(row.content);
                return (
                  <li key={row.id} className="border-t border-border pt-3">
                    <time className="text-xs font-mono text-gold">
                      {c.targetDate.replace("T", " ").replace(".000Z", " UTC")}
                    </time>
                    <p className="mt-2 break-words text-sm">{c.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {c.platform} · {row.state} · NO SCHEDULED DELIVERY
                    </p>
                    <Button size="sm" variant="ghost" onClick={() => load(row)}>
                      Load social plan
                    </Button>
                  </li>
                );
              })}
              {!calendarPlans(data.rows).length && (
                <li className="text-xs text-muted-foreground">No dated private plans.</li>
              )}
            </ul>
          </div>
          <div>
            <h4 className="text-lg">Saved private drafts</h4>
            {data.rows.map((row) => {
              const parsed = socialContent.safeParse(row.content);
              return (
                <div key={row.id} className="mt-4 border-t border-border pt-3">
                  <p className="break-words text-sm">
                    {parsed.success ? parsed.data.title : "Invalid saved plan"} · {row.state}
                  </p>
                  <Button size="sm" variant="ghost" onClick={() => load(row)}>
                    Load draft
                  </Button>
                </div>
              );
            })}
          </div>
          <Button asChild variant="ghost">
            <Link to="/quantum-studio">Private edits and manual Distro</Link>
          </Button>
        </div>
      </div>
      {notice && (
        <p role="status" className="break-words text-xs text-warning">
          {notice}
        </p>
      )}
      <details>
        <summary className="cursor-pointer text-sm">Private plan change history</summary>
        <ul className="mt-4 space-y-3">
          {data.audit.map((v) => (
            <li key={v.id} className="text-xs text-muted-foreground">
              {v.action} · {new Date(v.occurred_at).toLocaleString()} · stored record change, not a
              platform receipt
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
