import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { DemoBadge } from "@/components/evo";
import {
  addFeedback,
  enrollProject,
  feedbackChannels,
  forbiddenGoalHints,
  gatewayReadiness,
  loadGatewayStore,
  OMNI_GATEWAY_STORE_KEY,
  projectScopes,
  receiveJob,
  revokeProject,
  type EnrolledProject,
  type FeedbackChannel,
  type GatewayJob,
  type GatewayStore,
  type ProjectScope,
} from "@/lib/omni-gateway";

const inputCls = "mt-1 w-full rounded border border-border bg-background p-2 text-sm";

export function OmniGateway() {
  const [store, setStore] = useState<GatewayStore>(() =>
    loadGatewayStore(
      typeof window === "undefined" ? null : window.localStorage.getItem(OMNI_GATEWAY_STORE_KEY),
    ),
  );
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  // enrollment form
  const [pName, setPName] = useState("");
  const [pOrigin, setPOrigin] = useState("");
  const [pScopes, setPScopes] = useState<ProjectScope[]>(["read-source", "propose-patch"]);
  const [pConfirmed, setPConfirmed] = useState(false);

  // job form
  const [jobProject, setJobProject] = useState("");
  const [goal, setGoal] = useState("");
  const [approvalNote, setApprovalNote] = useState("");
  const [jackboyApproved, setJackboyApproved] = useState(false);
  const [noUntrusted, setNoUntrusted] = useState(false);

  // feedback form
  const [fbJob, setFbJob] = useState("");
  const [fbChannel, setFbChannel] = useState<FeedbackChannel>("angeltech-quality");
  const [fbNote, setFbNote] = useState("");

  useEffect(() => {
    window.localStorage.setItem(OMNI_GATEWAY_STORE_KEY, JSON.stringify(store));
  }, [store]);

  const readiness = gatewayReadiness();
  const enrolledProjects = store.projects.filter((p) => p.status === "enrolled");
  const toggleScope = (s: ProjectScope) =>
    setPScopes((list) => (list.includes(s) ? list.filter((x) => x !== s) : [...list, s]));

  function saveEnrollment(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const project = enrollProject(
        { name: pName, origin: pOrigin, scopes: pScopes, ownerConfirmed: pConfirmed },
        crypto.randomUUID(),
        new Date().toISOString(),
      );
      setStore((s) => ({ ...s, projects: [...s.projects, project] }));
      setPName("");
      setPOrigin("");
      setPConfirmed(false);
      setStatus(`Enrolled ${project.name} (local record only).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Enrollment was not accepted.");
    }
  }

  function submitJob(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const project = store.projects.find((p) => p.id === jobProject);
    if (!project) {
      setError("Select an enrolled project.");
      return;
    }
    try {
      const job = receiveJob(
        {
          projectId: project.id,
          goal,
          jackboyApproved,
          approvalNote,
          noUntrustedCode: noUntrusted,
        },
        project,
        crypto.randomUUID(),
        new Date().toISOString(),
      );
      setStore((s) => ({ ...s, jobs: [...s.jobs, job] }));
      setGoal("");
      setApprovalNote("");
      setJackboyApproved(false);
      setNoUntrusted(false);
      setStatus("Task received and blocked: no sandbox runner is connected.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Task was not accepted.");
    }
  }

  function saveFeedback(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const entry = addFeedback(
        { jobId: fbJob, channel: fbChannel, note: fbNote },
        crypto.randomUUID(),
        new Date().toISOString(),
      );
      setStore((s) => ({ ...s, feedback: [...s.feedback, entry] }));
      setFbNote("");
      setStatus("Advisory feedback recorded locally.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Feedback was not accepted.");
    }
  }

  function revoke(id: string) {
    setStore((s) => ({
      ...s,
      projects: s.projects.map((p) =>
        p.id === id ? revokeProject(p, new Date().toISOString()) : p,
      ),
    }));
    setStatus("Enrollment revoked; scopes withdrawn.");
  }

  return (
    <div className="mx-auto max-w-5xl px-5 py-14">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="eyebrow">Private · owner accounts only</p>
          <h1 className="mt-3 text-4xl">OMNI Coding Gateway</h1>
        </div>
        <DemoBadge label="BLOCKED · RUNNER NOT CONNECTED" />
      </div>
      <p className="mt-4 max-w-3xl text-sm leading-7 text-muted-foreground">
        The gateway is designed to receive Jackboy-approved code tasks, propose patches, run them in
        an isolated sandbox and return logs, diffs and pass/fail evidence for review. None of that
        pipeline is connected yet, so every task stops as <strong>Blocked</strong> before any code
        is generated or executed. Records below are browser-local planning data only.
      </p>

      <section
        aria-label="Activation prerequisites"
        className="mt-8 rounded border border-gold/30 p-5"
      >
        <h2 className="text-xl">Activation prerequisites</h2>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
          {readiness.blockers.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      </section>

      <div className="mt-10 grid gap-8 md:grid-cols-2">
        <section aria-label="Project enrollment">
          <h2 className="text-2xl">Project enrollment</h2>
          <form onSubmit={saveEnrollment} className="mt-4 space-y-3">
            <label className="block text-xs">
              Project name
              <input
                aria-label="Project name"
                value={pName}
                onChange={(e) => setPName(e.target.value)}
                className={inputCls}
              />
            </label>
            <label className="block text-xs">
              Origin (label only — no repository is connected)
              <input
                aria-label="Project origin"
                value={pOrigin}
                onChange={(e) => setPOrigin(e.target.value)}
                className={inputCls}
              />
            </label>
            <fieldset className="text-xs">
              <legend>Requested scopes (least privilege)</legend>
              {projectScopes.map((s) => (
                <label key={s} className="mr-3 inline-flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={pScopes.includes(s)}
                    onChange={() => toggleScope(s)}
                  />{" "}
                  {s}
                </label>
              ))}
            </fieldset>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={pConfirmed}
                onChange={(e) => setPConfirmed(e.target.checked)}
              />
              I am the owner and confirm this enrollment
            </label>
            <Button size="sm" type="submit">
              Enroll project
            </Button>
          </form>
          <ul className="mt-4 space-y-2 text-xs">
            {store.projects.map((p: EnrolledProject) => (
              <li key={p.id} className="rounded border border-border p-3">
                <strong>{p.name}</strong> · {p.status} · scopes: {p.scopes.join(", ")}
                {p.status === "enrolled" && (
                  <Button variant="outline" size="sm" className="ml-3" onClick={() => revoke(p.id)}>
                    Revoke
                  </Button>
                )}
              </li>
            ))}
            {store.projects.length === 0 && (
              <li className="text-muted-foreground">No projects enrolled.</li>
            )}
          </ul>
        </section>

        <section aria-label="Jackboy task intake">
          <h2 className="text-2xl">Jackboy task intake</h2>
          <form onSubmit={submitJob} className="mt-4 space-y-3">
            <label className="block text-xs">
              Enrolled project
              <select
                aria-label="Enrolled project"
                value={jobProject}
                onChange={(e) => setJobProject(e.target.value)}
                className={inputCls}
              >
                <option value="">Select…</option>
                {enrolledProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs">
              Task goal
              <textarea
                aria-label="Task goal"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                rows={3}
                className={inputCls}
              />
            </label>
            {goal && forbiddenGoalHints(goal).length > 0 && (
              <p className="text-xs text-warning">
                Goal mentions {forbiddenGoalHints(goal).join(", ")} — the gateway never performs
                these; owner review required.
              </p>
            )}
            <label className="block text-xs">
              Jackboy approval note
              <input
                aria-label="Jackboy approval note"
                value={approvalNote}
                onChange={(e) => setApprovalNote(e.target.value)}
                className={inputCls}
              />
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={jackboyApproved}
                onChange={(e) => setJackboyApproved(e.target.checked)}
              />
              Jackboy approved this task
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={noUntrusted}
                onChange={(e) => setNoUntrusted(e.target.checked)}
              />
              This task does not ask OMNI to run scraped or untrusted code
            </label>
            <Button size="sm" type="submit">
              Submit task
            </Button>
          </form>
        </section>
      </div>

      <section aria-label="Jobs" className="mt-10">
        <h2 className="text-2xl">Jobs</h2>
        <ul className="mt-4 space-y-3 text-xs">
          {store.jobs.map((j: GatewayJob) => (
            <li key={j.id} className="rounded border border-border p-3">
              <p>
                <strong>{j.goal.slice(0, 120)}</strong>
              </p>
              <p className="mt-1">
                State: <strong>{j.state}</strong> · not saved to any server
              </p>
              <ol className="mt-2 space-y-1 text-muted-foreground">
                {j.log.map((l, i) => (
                  <li key={i}>
                    {l.at.slice(11, 19)} · {l.state} · {l.note}
                  </li>
                ))}
              </ol>
            </li>
          ))}
          {store.jobs.length === 0 && (
            <li className="text-muted-foreground">No tasks submitted.</li>
          )}
        </ul>
      </section>

      <section aria-label="Feedback channels" className="mt-10">
        <h2 className="text-2xl">Quality &amp; security feedback</h2>
        <p className="mt-2 max-w-3xl text-xs leading-6 text-muted-foreground">
          AngelTech quality and DemonTech defensive-security notes are advisory only. They never
          change a job's state, grant authority, or trigger any action.
        </p>
        <form onSubmit={saveFeedback} className="mt-4 grid gap-3 md:grid-cols-3">
          <label className="block text-xs">
            Job
            <select
              aria-label="Feedback job"
              value={fbJob}
              onChange={(e) => setFbJob(e.target.value)}
              className={inputCls}
            >
              <option value="">Select…</option>
              {store.jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.goal.slice(0, 60)}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs">
            Channel
            <select
              aria-label="Feedback channel"
              value={fbChannel}
              onChange={(e) => setFbChannel(e.target.value as FeedbackChannel)}
              className={inputCls}
            >
              {feedbackChannels.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs">
            Advisory note
            <input
              aria-label="Advisory note"
              value={fbNote}
              onChange={(e) => setFbNote(e.target.value)}
              className={inputCls}
            />
          </label>
          <div className="md:col-span-3">
            <Button size="sm" type="submit">
              Record feedback
            </Button>
          </div>
        </form>
        <ul className="mt-4 space-y-1 text-xs text-muted-foreground">
          {store.feedback.map((f) => (
            <li key={f.id}>
              {f.at.slice(0, 10)} · {f.channel} · {f.note}
            </li>
          ))}
        </ul>
      </section>

      <div aria-live="polite" className="mt-6">
        {status && (
          <p role="status" className="text-xs text-gold">
            {status}
          </p>
        )}
        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
