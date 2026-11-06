import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Download, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useGenesis } from "@/hooks/use-genesis";
import { agentPassport } from "@/lib/embassy";
import { downloadJson } from "@/lib/genesis-sdk";
import { FormNotice } from "./GenesisShell";

export function PassportRegistry() {
  const { store, dispatch } = useGenesis();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [message, setMessage] = useState("");
  const people = store.identities.filter(
    (person) =>
      (!status || agentPassport(person).status === status) &&
      `${person.name} ${person.agentName} ${person.kind} ${person.passport?.provider ?? ""} ${person.passport?.model ?? ""}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  return (
    <section id="local-registry" className="mt-16 scroll-mt-28 border-t border-border pt-10">
      <p className="eyebrow">01 / Passport archive</p>
      <h2 className="mt-5 text-3xl">Local registry</h2>
      <p className="mt-4 max-w-3xl text-sm leading-loose text-muted-foreground">
        Only declarations made in this browser appear here. Pending passports are not verified
        identities. Verified status is reserved for a future authenticated operator check; no public
        agent directory exists.
      </p>
      <div className="mt-6 flex flex-wrap gap-4">
        <Input
          aria-label="Search local passports"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Name, agent, provider or model"
          className="w-full sm:w-80"
        />
        <select
          aria-label="Passport status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="exchange-select w-full sm:w-48"
        >
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="verified">Verified · none</option>
          <option value="revoked">Revoked</option>
        </select>
      </div>
      <div className="mt-5">
        <FormNotice message={message} />
      </div>
      {people.length === 0 && (
        <p className="mt-6 text-sm text-muted-foreground">
          No matching local passports. No outside agents have enrolled.
        </p>
      )}
      <div className="mt-6 grid gap-8 md:grid-cols-2">
        {people.map((person) => {
          const passport = agentPassport(person);
          const declaration = person.passport;
          return (
            <article
              key={person.id}
              className="min-w-0 rounded-md border border-border bg-card/30 p-6"
            >
              <div className="flex flex-wrap justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-mono text-[9px] text-muted-foreground">
                    DEMO PASSPORT / {person.kind}
                  </p>
                  <h3 className="mt-3 break-words text-xl">{person.agentName || person.name}</h3>
                  <p className="mt-3 break-words text-xs text-muted-foreground">
                    {person.agentName
                      ? `Responsible human: ${person.name}`
                      : "Self-declared human attribution"}
                  </p>
                </div>
                <span className="font-mono text-xs uppercase text-warning">
                  {passport.status} · DEMO
                </span>
              </div>
              <p className="mt-5 text-sm">
                {person.role} · local consent {person.state === "Active" ? "active" : "revoked"}
              </p>
              <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-5 text-xs">
                <div>
                  <dt className="text-muted-foreground">Provider / model</dt>
                  <dd className="mt-2 break-words">
                    {declaration
                      ? `${declaration.provider} / ${declaration.model}`
                      : "Not declared / not connected"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Version / protocol</dt>
                  <dd className="mt-2 break-words">
                    {declaration
                      ? `${declaration.modelVersion || "Undisclosed"} / ${declaration.protocol}`
                      : "None"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Requested rate</dt>
                  <dd className="mt-2">
                    {declaration?.requestedRatePerMinute ?? "Undeclared"} / minute
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Effective external access</dt>
                  <dd className="mt-2 text-gold-light">0 requests · USD $0</dd>
                </div>
              </dl>
              <p className="mt-6 text-xs text-muted-foreground">Requested local workflow scopes</p>
              <ul className="mt-3 space-y-2 break-words font-mono text-[10px] text-gold-light">
                {person.scopes.map((scope) => (
                  <li key={scope}>{scope}</li>
                ))}
              </ul>
              <p className="mt-4 text-xs leading-loose text-warning">
                Effective real permissions: NONE · identity and capabilities unverified · no API
                keys
              </p>
              {declaration && (
                <details className="mt-5 border-y border-border py-4">
                  <summary className="cursor-pointer text-sm text-gold-light">
                    Operator declaration and terms
                  </summary>
                  <div className="mt-4 space-y-4 break-words text-xs leading-loose text-muted-foreground">
                    <p>
                      Organization: {declaration.organization || "Undisclosed"} · contact:{" "}
                      {declaration.contact || "Not supplied"}
                    </p>
                    <p>Capabilities: {declaration.capabilities.join(", ")}</p>
                    <p>{declaration.supportedTasks}</p>
                    <p>License: {declaration.licenseTerms}</p>
                    <p>Privacy: {declaration.privacyTerms}</p>
                    <p className="break-all">
                      Endpoint: {declaration.endpoint || "Not supplied"} · never contacted
                    </p>
                    <p>Operator authorization self-declared; not independently verified.</p>
                  </div>
                </details>
              )}
              <div className="mt-5 flex flex-wrap gap-2">
                <Button
                  variant="ghost"
                  className="h-auto min-h-11 whitespace-normal"
                  onClick={() => {
                    try {
                      downloadJson(`DEMO-passport-${person.id}.json`, passport);
                      setMessage(
                        "Unsigned DEMO passport downloaded. It cannot authorize an API or verify an operator.",
                      );
                    } catch {
                      setMessage("Download unavailable.");
                    }
                  }}
                >
                  <Download size={14} />
                  Download passport
                </Button>
                {person.state === "Active" && (
                  <Button
                    variant="ghost"
                    className="h-auto min-h-11 whitespace-normal text-warning"
                    onClick={() => {
                      try {
                        dispatch({ type: "revoke", identityId: person.id });
                        setMessage(
                          "Local consent revoked and dependent demo approvals withdrawn; no external service was contacted.",
                        );
                      } catch (error) {
                        setMessage(error instanceof Error ? error.message : "Revocation failed.");
                      }
                    }}
                    aria-label={`Revoke local consent for ${person.agentName || person.name}`}
                  >
                    <ShieldOff size={14} />
                    Revoke local consent
                  </Button>
                )}
              </div>
              <Button
                disabled
                variant="outline"
                className="mt-3 h-auto min-h-10 whitespace-normal text-xs"
              >
                Verify operator · secure setup required
              </Button>
              {person.kind === "Sponsor" && person.state === "Active" && (
                <Button asChild variant="signal" className="mt-4 h-auto min-h-10 whitespace-normal">
                  <Link to="/challenges">Propose an unfunded challenge</Link>
                </Button>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
