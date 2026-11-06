import { Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Download, FlaskConical, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useGenesis } from "@/hooks/use-genesis";
import { decisionInput, genesisPackage, trustAssessment, type Capsule } from "@/lib/genesis";
import { downloadJson } from "@/lib/genesis-sdk";
import { GenesisShell, IdentitySelect, FormNotice, fieldLabel } from "./GenesisShell";
export function CapsulePage({ id }: { id: string }) {
  const { store, dispatch } = useGenesis();
  const capsule = store.capsules.find((item) => item.id === id);
  const [message, setMessage] = useState("");
  if (!capsule)
    return (
      <GenesisShell title="Capsule unavailable">
        <p className="text-muted-foreground">
          This capsule is local to the browser where it was submitted.
        </p>
        <Button asChild variant="signal" className="mt-6">
          <Link to="/challenges">Open challenges</Link>
        </Button>
      </GenesisShell>
    );
  const author = store.identities.find((item) => item.id === capsule.identityId);
  const assessment = trustAssessment(store, capsule);
  const twins = store.twins.filter((item) => item.capsuleId === capsule.id);
  const decisions = store.decisions.filter((item) => item.capsuleId === capsule.id);
  const list = () => {
    try {
      dispatch({ type: "list", capsuleId: capsule.id, actorId: capsule.identityId });
      setMessage(
        "Demo listing prepared. Reward accounting remains demo-only; no money, publication or release.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not list capsule.");
    }
  };
  return (
    <GenesisShell title={capsule.title} eyebrow="Documented capsule · local demo">
      <div className="mb-9 flex flex-wrap gap-6 font-mono text-xs text-gold-light">
        <span>{capsule.state}</span>
        <span>{capsule.license} · self-declared</span>
        <span>NOT CERTIFIED</span>
      </div>
      <div className="grid gap-14 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <section className="border-t border-border py-8">
            <h2 className="text-xl">Purpose and compatibility</h2>
            <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-loose text-muted-foreground">
              {capsule.explanation}
            </p>
            <p className="mt-5 break-words text-xs text-gold-light">
              Human attribution: {author?.name ?? "Unknown local identity"}
              {author?.agentName ? ` · operator of ${author.agentName}` : ""} · self-declared /
              unverified
            </p>
            <Link
              to="/challenges/$id"
              params={{ id: capsule.challengeId }}
              className="mt-4 inline-block text-sm text-gold-light underline"
            >
              Parent challenge and acceptance criteria
            </Link>
          </section>
          {capsule.code && (
            <section className="border-t border-border py-8">
              <h2 className="mb-5 text-xl">Submitted code · not executed</h2>
              <pre tabIndex={0} className="exchange-code">
                <code translate="no">{capsule.code}</code>
              </pre>
            </section>
          )}
          <section className="border-t border-border py-8">
            <h2 className="text-xl">Source and rights</h2>
            <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-loose text-muted-foreground">
              {capsule.dependencies}
            </p>
            <p className="mt-4 text-xs text-warning">
              Sharing rights declared by submitter; ownership and licensing have not been
              independently checked.
            </p>
            {capsule.sourceUrl && (
              <a
                href={capsule.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 block break-all text-sm text-gold-light underline"
              >
                {capsule.sourceUrl}
              </a>
            )}
            {capsule.contributionId && (
              <Link
                to="/code-exchange/$id"
                params={{ id: capsule.contributionId }}
                className="mt-4 inline-block text-sm text-gold-light underline"
              >
                Cited Code Exchange contribution · DEMO
              </Link>
            )}
          </section>
          <section className="border-t border-border py-8">
            <h2 className="text-xl">Test procedure and rollback</h2>
            <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-loose text-muted-foreground">
              {capsule.testPlan}
            </p>
            <h3 className="mt-6 font-sans text-sm font-semibold">Rollback / risks</h3>
            <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-loose text-muted-foreground">
              {capsule.rollback}
            </p>
          </section>
          <section className="border-t border-border py-8">
            <h2 className="text-xl">Recorded synthetic tests</h2>
            {twins.length === 0 && (
              <p className="mt-5 text-sm text-muted-foreground">
                No simulation recorded. This is not tested code.
              </p>
            )}
            <ol className="mt-5 space-y-5">
              {twins.map((twin) => (
                <li key={twin.id} className="border-l border-gold/30 pl-5">
                  <p className="font-mono text-xs text-gold-light">SIMULATION · {twin.outcome}</p>
                  <p className="mt-3 text-sm">
                    {twin.resultMs} ms modeled / {twin.targetMs} ms target
                  </p>
                  <p className="mt-2 text-xs leading-loose text-muted-foreground">
                    Baseline {twin.baselineMs} ms × workload {twin.workload} × (1 −{" "}
                    {twin.efficiencyPercent}% assumed efficiency). {twin.model}. No capsule
                    execution or hardware evidence.
                  </p>
                  <time
                    dateTime={twin.createdAt}
                    className="mt-3 block font-mono text-[10px] text-muted-foreground"
                  >
                    {new Date(twin.createdAt).toLocaleString()}
                  </time>
                </li>
              ))}
            </ol>
          </section>
          <ReviewForm capsule={capsule} />
          <ol className="space-y-6">
            {decisions.map((decision) => (
              <li key={decision.id} className="border-l border-gold/30 pl-5">
                <p className="text-sm text-gold-light">
                  {decision.decision} · DEMO / not real approval
                </p>
                <p className="mt-2 break-words text-xs text-muted-foreground">
                  {store.identities.find((person) => person.id === decision.reviewerId)?.name} ·
                  local unverified reviewer
                </p>
                <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-loose text-muted-foreground">
                  {decision.note}
                </p>
              </li>
            ))}
          </ol>
        </div>
        <aside className="min-w-0 border-t border-border pt-8 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
          <ShieldCheck className="mb-5 text-gold" size={28} />
          <h2 className="text-xl">Readiness assessment</h2>
          <dl className="mt-6 space-y-5 text-xs">
            {Object.entries(assessment).map(([key, value]) => (
              <div key={key}>
                <dt className="text-muted-foreground">{key}</dt>
                <dd className="mt-2 break-words font-mono text-gold-light">{String(value)}</dd>
              </div>
            ))}
          </dl>
          <Button asChild variant="signal" className="mt-8 h-auto min-h-11 whitespace-normal">
            <Link to="/digital-twin" search={{ capsule: capsule.id }}>
              <FlaskConical size={16} />
              Configure synthetic twin
            </Link>
          </Button>
          <Button
            variant="signal"
            className="mt-4 h-auto min-h-11 whitespace-normal"
            disabled={capsule.state !== "Demo approved"}
            onClick={list}
          >
            Prepare demo marketplace listing
          </Button>
          <Button
            variant="ghost"
            className="mt-4 h-auto min-h-11 whitespace-normal"
            onClick={() => {
              try {
                downloadJson(`DEMO-capsule-${capsule.id}.json`, genesisPackage(store, capsule));
                setMessage("Unsigned demo manifest downloaded. External release remains disabled.");
              } catch {
                setMessage("Download unavailable in this browser.");
              }
            }}
          >
            <Download size={16} />
            Download unsigned demo manifest
          </Button>
          <FormNotice message={message} />
          <p className="mt-6 text-xs leading-loose text-muted-foreground">
            USD price TBD. Any reward is demo-only recognition, not an earned or payable balance. A
            real authenticated owner must approve distribution and funding.
          </p>
          <Button disabled variant="outline" className="mt-5 h-auto whitespace-normal">
            Sign / distribute / pay · disabled
          </Button>
        </aside>
      </div>
    </GenesisShell>
  );
}
function ReviewForm({ capsule }: { capsule: Capsule }) {
  const { dispatch } = useGenesis();
  const [message, setMessage] = useState("");
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const parsed = decisionInput.safeParse({ ...Object.fromEntries(data), capsuleId: capsule.id });
    if (!parsed.success) {
      setMessage("Choose a distinct opted-in reviewer and add a reason of at least 10 characters.");
      return;
    }
    try {
      dispatch({ type: "decision", input: parsed.data });
      setMessage("Local demo decision recorded; no certification or real owner approval.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Review could not be saved.");
    }
  };
  return (
    <section className="border-t border-border py-8">
      <h2 className="text-xl">Human review rehearsal</h2>
      <p className="mt-4 text-xs leading-loose text-muted-foreground">
        A different local identity must review. Demo approval requires the latest simulation within
        target and a declared reusable license. Identities can be created by anyone in this browser;
        this does not enforce real independence.
      </p>
      <form onSubmit={submit} noValidate className="mt-6 grid gap-5">
        <IdentitySelect
          name="reviewerId"
          scope="review_proposals"
          label="Local reviewer identity"
        />
        <label className={fieldLabel}>
          Decision
          <select name="decision" className="exchange-select mt-2 w-full">
            <option>Request changes</option>
            <option>Demo approve</option>
          </select>
        </label>
        <label className={fieldLabel}>
          Reason, evidence gaps and security/license findings
          <Textarea name="note" className="mt-2" required maxLength={4000} />
        </label>
        <FormNotice message={message} />
        <Button
          type="submit"
          variant="signal"
          className="h-auto min-h-11 justify-self-start whitespace-normal"
        >
          Record demo reviewer decision
        </Button>
      </form>
    </section>
  );
}
