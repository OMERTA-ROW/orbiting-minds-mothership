import { searchPolicy } from "@/lib/search-policy";

export function SeoStatusPanel() {
  return (
    <section className="mt-7 border-t border-border pt-7" aria-labelledby="seo-status">
      <h2 id="seo-status" className="text-xl">
        Search visibility
      </h2>
      <p className="mt-3 text-xs leading-7 text-muted-foreground">
        What each page tells search engines in this build. This is the configured setting, not proof
        Google has indexed anything; live changes need a publish.
      </p>
      <ul className="mt-5">
        {searchPolicy.map((entry) => (
          <li
            key={entry.path}
            className="grid gap-2 border-t border-border py-4 md:grid-cols-[190px_minmax(0,1fr)]"
          >
            <span
              className={`font-mono text-[11px] ${entry.indexable ? "text-success" : "text-warning"}`}
            >
              {entry.indexable ? "INDEXABLE" : "EXCLUDED (NOINDEX)"}
            </span>
            <div>
              <p className="text-sm">
                {entry.label}{" "}
                <span className="font-mono text-[10px] text-muted-foreground">{entry.path}</span>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{entry.reason}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
