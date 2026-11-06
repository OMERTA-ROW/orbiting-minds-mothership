import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { DemoBadge } from "@/components/evo";
import {
  ADAPTERS,
  canSend,
  ingestEmail,
  rightsPath,
  specimenFlags,
  visibleTo,
  type Matter,
  type RightsFile,
} from "@/lib/omni-rights";
import { useOmniLocalRecords } from "@/hooks/use-omni-local-records";

const KEY = "evolution.omni-rights.v1";
const sample = (clientId: string): Matter[] => [
  {
    id: `${clientId}-tm`,
    clientId,
    module: "trademark",
    title: "NOVAQUILL (fictional)",
    mark: "NOVAQUILL",
    goods: "Paper notebooks",
    jurisdiction: "US",
    state: "prepared",
    reference: `SN-${clientId}-0001`,
    trustedSenders: ["notices@example.test"],
    contributions: [],
    files: [],
    messages: [],
    drafts: [],
    deadlines: [],
    history: [],
  },
  {
    id: `${clientId}-cr`,
    clientId,
    module: "copyright",
    title: "Starlight Atlas (fictional book)",
    jurisdiction: "US",
    state: "prepared",
    trustedSenders: [],
    contributions: [{ who: "Sample Author", kind: "human", part: "Text" }],
    files: [],
    messages: [],
    drafts: [],
    deadlines: [],
    history: [],
  },
];

async function sha(file: File) {
  const b = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

export function OmniRights() {
  const {
    records: matters,
    setRecords: setMatters,
    storageNotice,
  } = useOmniLocalRecords<Matter[]>({
    key: KEY,
    initial: [],
    read: (raw) => (raw ? JSON.parse(raw) : [...sample("client-a"), ...sample("client-b")]),
    collections: [],
  });
  const [client, setClient] = useState("client-a");
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const mine = visibleTo(matters, client);
  const tm = mine.find((m) => m.module === "trademark");

  async function addSpecimen(file: File) {
    if (busy) return;
    if (!tm) {
      setNote("No trademark matter is available. Saved records have not been changed.");
      return;
    }
    setBusy(true);
    setNote("Checking specimen fingerprint…");
    try {
      const f: RightsFile = {
        name: file.name,
        sha256: await sha(file),
        folder: "Specimens",
        sourceUrl: url || undefined,
        capturedAt: new Date().toISOString(),
      };
      setMatters((all) =>
        all.map((m) =>
          m.id === tm.id
            ? {
                ...m,
                files: [...m.files, f],
                history: [...m.history, `specimen ${f.name} preserved unchanged`],
              }
            : m,
        ),
      );
      setNote(
        "Specimen fingerprint added to this browser record. Original file unchanged; no registration or upload.",
      );
    } catch {
      setNote(
        "Specimen was not added. The file could not be read or fingerprinted; select it again to retry. Existing records are unchanged.",
      );
    } finally {
      setBusy(false);
    }
  }
  function fixtureEmail() {
    if (!tm) {
      setNote("No trademark matter is available; fixture intake was not performed.");
      return;
    }
    const r = ingestEmail(matters, client, {
      id: `fixture-${client}`,
      from: "notices@example.test",
      subject: `Status for ${tm.reference}`,
      body: "Fixture notice. Please confirm receipt.",
    });
    setMatters(r.matters);
    setNote(r.reason);
  }

  return (
    <div className="mx-auto max-w-[1300px] px-4 pb-20 pt-8 md:px-8">
      <header className="border-b border-gold/30 pb-6">
        <div className="flex flex-wrap items-center gap-3">
          <span className="eyebrow">OMNI / rights workspace</span>
          <DemoBadge label="LOCAL · FICTIONAL SAMPLES" />
        </div>
        <h1 className="mt-4 text-4xl">OMNI Rights</h1>
        <Button asChild variant="ghost" size="sm" className="mt-3">
          <Link to="/omni-legal">Omni Legal · synthetic preparation</Link>
        </Button>
        <p className="mt-3 max-w-3xl text-xs leading-6 text-warning">
          Organising tool, not a lawyer or filing service. Saved in this browser only. Storing a
          file or fingerprint is not registration; capturing a specimen is not acceptance. No
          filings, payments, signatures or emails happen here.
        </p>
      </header>
      {storageNotice && (
        <p role="status" className="mt-4 text-sm text-warning">
          {storageNotice}
        </p>
      )}
      <label className="mt-6 flex items-center gap-3 text-xs">
        Client
        <select
          aria-label="Client"
          className="exchange-select"
          value={client}
          onChange={(e) => {
            setClient(e.target.value);
            setNote("");
          }}
        >
          <option value="client-a">Client A (fictional)</option>
          <option value="client-b">Client B (fictional)</option>
        </select>
      </label>
      <section className="mt-6 grid gap-4 md:grid-cols-3">
        {ADAPTERS.map((a) => (
          <div key={a.id} className="border border-border p-4 text-xs">
            <b>{a.name}</b>
            <p className="mt-1 text-warning">{a.status}</p>
            {a.url && (
              <a className="text-gold underline" href={a.url} target="_blank" rel="noreferrer">
                Official portal
              </a>
            )}
          </div>
        ))}
      </section>
      {mine.map((m) => (
        <section key={m.id} className="mt-6 border border-border p-5 text-xs">
          <h2 className="text-xl">{m.title}</h2>
          <p className="mt-1 text-muted-foreground">
            {m.module} · {m.state} · ref {m.reference ?? "none"} · folder{" "}
            {rightsPath("Books", "Sample", m, "Originals")}
          </p>
          {m.module === "trademark" && (
            <div className="mt-3">
              <input
                aria-label="Capture URL"
                className="exchange-select"
                placeholder="https://… page the capture came from"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
              <input
                aria-label="Specimen capture file"
                type="file"
                disabled={busy}
                className="ml-3"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void addSpecimen(f);
                  e.target.value = "";
                }}
              />
              <Button size="sm" variant="ghost" className="ml-3" onClick={fixtureEmail}>
                Ingest fixture email
              </Button>
            </div>
          )}
          <ul className="mt-3 space-y-1">
            {m.files.map((f, i) => {
              const flags = specimenFlags(m, f);
              return (
                <li key={i}>
                  {f.name} · {f.sha256.slice(0, 10)}… · {f.sourceUrl ?? "no URL"} · {f.capturedAt}{" "}
                  {flags.length ? (
                    <span className="text-warning">— {flags.join(" ")}</span>
                  ) : (
                    <span className="text-gold-light">— ready for human review</span>
                  )}
                </li>
              );
            })}
          </ul>
          {m.drafts.map((d, i) => {
            const s = canSend(d, false);
            return (
              <p key={i} className="mt-2">
                {d} <span className="text-warning">{s.reason}</span>
              </p>
            );
          })}
          <ul className="mt-2 text-muted-foreground">
            {m.history.map((h, i) => (
              <li key={i}>{h}</li>
            ))}
          </ul>
        </section>
      ))}
      {note && (
        <p role="status" className="mt-4 text-xs text-gold-light">
          {note}
        </p>
      )}
    </div>
  );
}
