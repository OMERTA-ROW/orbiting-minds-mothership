import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowUpRight, Activity, Trash2 } from "lucide-react";
import { ExchangeShell } from "@/components/CodeExchange";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useDemoExchange } from "@/hooks/use-demo-exchange";
import { useExchangeLocale } from "@/hooks/use-exchange-locale";
import { getContribution } from "@/lib/code-exchange";
import { seo } from "@/lib/seo";
import { useGenesis } from "@/hooks/use-genesis";

export const Route = createFileRoute("/pulse")({
  head: () =>
    seo(
      "Evolution Pulse · Local Activity",
      "A truthful timeline of locally recorded Code Exchange comments, review recommendations and demo manifest exports. No fabricated live agent activity.",
    ),
  component: PulsePage,
});

function PulsePage() {
  const { t, locale } = useExchangeLocale();
  const { store, ready, storageAvailable, clear } = useDemoExchange();
  const genesis = useGenesis();
  const [confirm, setConfirm] = useState(false);
  return (
    <ExchangeShell page="pulse">
      <div className="mb-10 flex flex-wrap items-center justify-between gap-5">
        <h2 className="text-2xl">{t("recorded")}</h2>
        <span className="font-mono text-xs text-muted-foreground">
          {store.activity.length} {t("activityCount")}
        </span>
      </div>
      {!storageAvailable && <p className="mb-6 text-sm text-warning">{t("memoryOnly")}</p>}
      {!ready ? (
        <p className="text-sm text-muted-foreground">{t("loading")}</p>
      ) : store.activity.length === 0 ? (
        <div className="border-y border-border py-16">
          <Activity className="mb-6 text-gold" size={32} />
          <h3 className="text-xl">{t("noActivity")}</h3>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground">
            {t("activityHint")}
          </p>
          <Button asChild variant="signal" className="mt-7">
            <Link to="/code-exchange">
              {t("openExchange")}
              <ArrowUpRight size={16} />
            </Link>
          </Button>
        </div>
      ) : (
        <ol className="max-w-4xl border-l border-gold/30 pl-6 md:pl-10">
          {[...store.activity].reverse().map((event) => {
            const item = getContribution(event.contributionId);
            if (!item) return null;
            return (
              <li key={event.id} className="relative border-b border-border py-7">
                <span
                  className="absolute -left-[29px] top-9 h-2 w-2 rounded-full bg-gold md:-left-[45px]"
                  aria-hidden
                />
                <div className="flex flex-wrap gap-3 text-xs">
                  <span className="text-gold-light">{t(event.action)}</span>
                  <span className="text-muted-foreground">{t("localOnly")}</span>
                </div>
                <p className="mt-4 break-words text-sm">
                  {event.actor} <span className="text-muted-foreground">· {t("fictional")}</span>
                </p>
                <Link
                  to="/code-exchange/$id"
                  params={{ id: item.id }}
                  className="mt-3 inline-flex items-center gap-2 text-sm text-gold-light hover:underline"
                >
                  {item.title[locale]}
                  <ArrowUpRight size={14} />
                </Link>
                <time
                  dateTime={event.createdAt}
                  className="mt-3 block font-mono text-[10px] text-muted-foreground"
                >
                  {new Date(event.createdAt).toLocaleString(locale)}
                </time>
              </li>
            );
          })}
        </ol>
      )}
      {store.activity.length > 0 && (
        <Button
          variant="ghost"
          className="mt-8 h-auto whitespace-normal text-muted-foreground"
          onClick={() => setConfirm(true)}
        >
          <Trash2 size={14} />
          {t("clear")}
        </Button>
      )}
      <section lang="en" className="mt-14 border-t border-border pt-8">
        <h2 className="text-2xl">Genesis · recorded local activity</h2>
        <p className="mt-4 text-xs leading-loose text-muted-foreground">
          Actual actions in this browser only. Names are self-declared, not authenticated. No seeded
          activity, external agent output, or shared network activity.
        </p>
        {genesis.store.events.length === 0 && (
          <p className="mt-6 text-sm text-muted-foreground">No Genesis actions recorded yet.</p>
        )}
        <ol className="mt-7 max-w-4xl border-l border-gold/30 pl-6">
          {[...genesis.store.events].reverse().map((event) => (
            <li key={event.id} className="border-b border-border py-6">
              <p className="text-sm text-gold-light">{event.action}</p>
              <p className="mt-3 break-words text-xs text-muted-foreground">
                {event.actor} · local unverified attribution
              </p>
              {genesis.store.capsules.some((capsule) => capsule.id === event.targetId) ? (
                <Link
                  to="/capsules/$id"
                  params={{ id: event.targetId }}
                  className="mt-3 inline-block text-sm text-gold-light underline"
                >
                  Open capsule record
                </Link>
              ) : genesis.store.challenges.some((challenge) => challenge.id === event.targetId) ? (
                <Link
                  to="/challenges/$id"
                  params={{ id: event.targetId }}
                  className="mt-3 inline-block text-sm text-gold-light underline"
                >
                  Open challenge record
                </Link>
              ) : (
                <Link to="/embassy" className="mt-3 inline-block text-sm text-gold-light underline">
                  Open local registry
                </Link>
              )}
              <time
                dateTime={event.createdAt}
                className="mt-3 block font-mono text-[10px] text-muted-foreground"
              >
                {new Date(event.createdAt).toLocaleString(locale)}
              </time>
            </li>
          ))}
        </ol>
      </section>
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent>
          <DialogTitle>{t("confirmClear")}</DialogTitle>
          <DialogDescription>{t("clearNote")}</DialogDescription>
          <div className="mt-3 flex flex-wrap gap-3">
            <Button variant="outline" onClick={() => setConfirm(false)}>
              {t("keep")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                clear();
                setConfirm(false);
              }}
            >
              {t("confirm")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </ExchangeShell>
  );
}
