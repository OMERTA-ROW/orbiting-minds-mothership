import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { retiredArea, savedBrowserRecords } from "@/lib/retired-areas";

/**
 * Honest page for an address that used to hold a demo. Says what a real version
 * needs, links to the working page to use instead, and lets the visitor download
 * anything the old screen saved in this browser (never deleted, no sign-in data).
 */
export function RetiredAreaPage() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const area = retiredArea(path);
  const [saved, setSaved] = useState<Record<string, string> | null>(null);
  useEffect(() => {
    try {
      setSaved(savedBrowserRecords(window.localStorage));
    } catch {
      setSaved({});
    }
  }, []);
  const count = saved ? Object.keys(saved).length : 0;
  const download = () => {
    if (!saved) return;
    const blob = new Blob(
      [JSON.stringify({ exportedAt: new Date().toISOString(), records: saved }, null, 2)],
      {
        type: "application/json",
      },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "evolution-browser-records.json";
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <section className="mx-auto max-w-xl space-y-5 px-5 py-20 text-sm sm:px-6">
      <p className="eyebrow">Not connected</p>
      <h1 className="text-3xl text-foreground">{area?.name ?? "This page"} isn't available</h1>
      <p className="leading-7 text-muted-foreground">
        {area?.needs ?? "This feature isn't connected to a real service."}
      </p>
      <div className="flex flex-wrap gap-2">
        {area?.instead && (
          <Button asChild variant="cosmic">
            <Link to={area.instead.to}>{area.instead.label}</Link>
          </Button>
        )}
        <Button asChild variant="outline">
          <Link to="/">Go to home</Link>
        </Button>
      </div>
      {count > 0 && (
        <div className="rounded-md border border-border p-4 text-xs leading-6 text-muted-foreground">
          <p>
            This browser still holds {count} saved record{count === 1 ? "" : "s"} from earlier
            screens. Nothing was deleted.
          </p>
          <Button size="sm" variant="outline" className="mt-2" onClick={download}>
            Download saved browser records
          </Button>
        </div>
      )}
    </section>
  );
}
