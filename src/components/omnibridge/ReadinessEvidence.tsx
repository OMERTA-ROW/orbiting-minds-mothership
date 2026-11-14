import type { EvidenceGroup, EvidenceRow, EvidenceStatus } from "@/lib/readiness-evidence";

const GROUPS: Array<{ id: EvidenceGroup; title: string }> = [
  { id: "handshake", title: "Live handshake" },
  { id: "permit", title: "Signed permit decision" },
  { id: "authorization", title: "Owner authorization" },
  { id: "expiry", title: "Approval expiry" },
  { id: "stops", title: "Stop state" },
];

const STATUS_TEXT: Record<EvidenceStatus, string> = {
  current: "Current",
  stale: "Stale",
  expired: "Expired",
  missing: "Not recorded",
  unreadable: "Unreadable",
};

function stamp(iso: string | null, now: number) {
  if (!iso) return { text: "—", rel: "" };
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return { text: iso, rel: "" };
  const mins = Math.round((t - now) / 60_000);
  const abs = Math.abs(mins);
  const span =
    abs < 120
      ? `${abs} min`
      : abs < 2880
        ? `${Math.round(abs / 60)} h`
        : `${Math.round(abs / 1440)} d`;
  return {
    text: new Date(t).toLocaleString(undefined, { timeZoneName: "short" }),
    rel: mins === 0 ? "now" : mins < 0 ? `${span} ago` : `in ${span}`,
  };
}

/** Read-only: shows what each readiness record says, when, and from where. No actions. */
export function ReadinessEvidence({ rows, now }: { rows: EvidenceRow[]; now: number }) {
  return (
    <section
      id="readiness-evidence"
      aria-labelledby="readiness-evidence-title"
      className="scroll-mt-24 space-y-3 rounded-lg border bg-card p-4"
    >
      <div>
        <h2 id="readiness-evidence-title" className="text-lg">
          Readiness evidence
        </h2>
        <p className="text-xs text-muted-foreground">
          Read-only. Each line shows the latest stored record, its time and its source. “Current”
          means the record is recent enough for its rule — not that a stop is released or work may
          run. Nothing here sends a request to Jackboy.
        </p>
      </div>
      {GROUPS.map((g) => {
        const items = rows.filter((r) => r.group === g.id);
        if (!items.length) return null;
        return (
          <div key={g.id} className="space-y-1">
            <h3 className="text-sm font-medium">{g.title}</h3>
            <div className="overflow-x-auto rounded border">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-2 py-1.5 font-medium">
                      Record
                    </th>
                    <th scope="col" className="px-2 py-1.5 font-medium">
                      Value
                    </th>
                    <th scope="col" className="px-2 py-1.5 font-medium">
                      Evidence
                    </th>
                    <th scope="col" className="px-2 py-1.5 font-medium">
                      Time
                    </th>
                    <th scope="col" className="px-2 py-1.5 font-medium">
                      Source
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((r) => {
                    const t = stamp(r.at, now);
                    return (
                      <tr
                        key={r.id}
                        data-testid={`evidence-${r.id}`}
                        className="border-t align-top"
                      >
                        <th scope="row" className="px-2 py-1.5 font-medium">
                          {r.label}
                          <p className="font-normal text-muted-foreground">{r.detail}</p>
                        </th>
                        <td className="px-2 py-1.5">{r.value}</td>
                        <td
                          className={`px-2 py-1.5 font-medium ${r.status === "current" ? "text-primary" : "text-destructive"}`}
                        >
                          {STATUS_TEXT[r.status]}
                        </td>
                        <td className="px-2 py-1.5">
                          <span className="text-muted-foreground">{r.atLabel}</span>
                          <br />
                          {r.at ? <time dateTime={r.at}>{t.text}</time> : "—"}
                          {t.rel && <span className="text-muted-foreground"> · {t.rel}</span>}
                        </td>
                        <td className="px-2 py-1.5">
                          {r.source}
                          <span className="block text-muted-foreground">
                            {r.signed ? "Signed by Jackboy" : "Not a Jackboy signature"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </section>
  );
}
