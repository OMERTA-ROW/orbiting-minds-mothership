import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { setShowPreviews } from "@/lib/preview-setting";

/** Shown instead of a demo/sample area while design previews are switched off. */
export function PreviewHidden() {
  return (
    <section className="mx-auto max-w-xl space-y-5 px-5 py-20 text-sm sm:px-6">
      <p className="eyebrow">Not available</p>
      <h1 className="text-3xl text-foreground">This isn't part of the working site</h1>
      <p className="leading-7 text-muted-foreground">
        This area was an early design preview with sample or simulated content. Nothing in it
        works for real, so it's hidden. No account data lives here.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="cosmic">
          <Link to="/">Go to home</Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/beta">My projects</Link>
        </Button>
      </div>
      <details className="pt-4 text-xs text-muted-foreground">
        <summary className="cursor-pointer">Advanced</summary>
        <p className="mt-2 leading-6">
          You can show design previews in this browser. They stay labeled as demos and never
          change anything real.
        </p>
        <Button size="sm" variant="ghost" className="mt-2" onClick={() => setShowPreviews(true)}>
          Show design previews
        </Button>
      </details>
    </section>
  );
}
