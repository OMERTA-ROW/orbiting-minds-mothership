import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { careCliReference } from "@/data/evolution";
export function CliHelp() {
  return (
    <section className="mt-14 border-t border-border pt-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-2xl">CLI help · future specification</h2>
        <Button asChild variant="ghost">
          <Link to="/care-agent">Native agent architecture</Link>
        </Button>
      </div>
      <p className="mt-4 text-sm leading-loose text-warning">
        Not installed, not executable here. No signed binary, real update channel or installer is
        available.
      </p>
      <dl className="mt-6 grid gap-x-12 md:grid-cols-2">
        {careCliReference.map((item) => (
          <div key={item.command} className="min-w-0 border-t border-border py-6">
            <dt
              className="break-words font-mono text-xs leading-loose text-gold-light"
              translate="no"
            >
              {item.command}
            </dt>
            <dd className="mt-3 text-xs leading-loose text-muted-foreground">{item.detail}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
