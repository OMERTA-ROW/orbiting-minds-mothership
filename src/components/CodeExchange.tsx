import { Link } from "@tanstack/react-router";
import { useState, type FormEvent, type ReactNode } from "react";
import { ArrowLeft, ArrowUpRight, Bot, Check, Code2, Copy, Download, GitBranch, Globe2, LockKeyhole, MessageSquare, Search, ShieldAlert, UserRound } from "lucide-react";
import { DemoBadge, PageHeader, Section } from "@/components/evo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { codeContributions, exchangeStates, roboticsScenarios, type CodeContribution } from "@/data/evolution";
import { demoFeedbackInput, emptyExchangeFilters, filterContributions, packagePreview, referenceLinks, type ExchangeFilters, type DemoFeedbackInput } from "@/lib/code-exchange";
import { useDemoExchange } from "@/hooks/use-demo-exchange";
import { useExchangeLocale } from "@/hooks/use-exchange-locale";
import { GenesisEntryPoints } from "@/components/genesis/GenesisShell";

export function ExchangeShell({ page, children }: { page: "exchange" | "commons" | "pulse"; children: ReactNode }) {
  const { t, locale, setLocale } = useExchangeLocale();
  return <div lang={locale}>
    <PageHeader eyebrow={t("network")} title={t(page)}>
      <p>{page === "exchange" ? t("subtitle") : page === "commons" ? t("commonsIntro") : t("pulseIntro")}</p>
    </PageHeader>
    <Section>
      <div className="mb-9 flex flex-wrap items-center justify-between gap-6 border-y border-border py-4">
        <nav aria-label={t("network")} className="flex flex-wrap gap-2">
          {([{ to: "/code-exchange", key: "exchange" }, { to: "/commons", key: "commons" }, { to: "/pulse", key: "pulse" }] as const).map((item) => <Button asChild key={item.key} variant={page === item.key ? "signal" : "ghost"}><Link to={item.to} aria-current={page === item.key ? "page" : undefined}>{t(item.key)}</Link></Button>)}
          <Button asChild variant="ghost"><Link to="/code-vault">{locale==="es"?"Bóveda · demo":"Code Vault · Demo"}</Link></Button>
        </nav>
        <label className="flex items-center gap-2 text-xs text-muted-foreground"><Globe2 size={16} className="text-gold" /><span className="sr-only">{t("language")}</span><select aria-label={t("language")} className="exchange-select w-32" value={locale} onChange={(event) => setLocale(event.target.value === "es" ? "es" : "en")}><option value="en">English</option><option value="es">Español</option></select></label>
      </div>
      <div lang={locale}>
        <div className="mb-10 border-l-2 border-gold/60 pl-5"><DemoBadge label={t("demo")} /><p className="mt-3 max-w-4xl text-sm leading-relaxed text-muted-foreground">{t("boundary")}</p></div>
        {children}
        <GenesisEntryPoints />
        <p className="mt-14 border-t border-border pt-6 text-xs leading-relaxed text-muted-foreground">{t("accuracy")}</p>
      </div>
    </Section>
  </div>;
}

export function ContributionCard({ item }: { item: CodeContribution }) {
  const { t, locale } = useExchangeLocale();
  const Icon = item.authorType === "Human" ? UserRound : Bot;
  return <article className="exchange-contribution relative flex min-w-0 flex-col border-t border-border pb-7 pt-6">
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3 font-mono text-[10px]"><span className="text-gold-light">{item.language} / {t(item.industry)}</span><span className="text-muted-foreground">{t(item.readiness)}</span></div>
    <h2 className="font-sans text-xl font-semibold leading-relaxed"><Link to="/code-exchange/$id" params={{ id: item.id }} className="hover:text-gold-light">{item.title[locale]}</Link></h2>
    <p className="mt-3 flex-1 text-sm leading-relaxed text-muted-foreground">{item.description[locale]}</p>
    <div className="mt-6 flex items-start gap-3 border-l border-gold/30 pl-4"><Icon size={17} className="mt-1 shrink-0 text-gold" /><div className="min-w-0 text-xs"><p>{item.author}<span className="text-muted-foreground"> · {t(item.authorType)}</span></p>{item.operator && <p className="mt-1 leading-relaxed text-muted-foreground">{t("operator")}: {item.operator}</p>}<p className="mt-1 text-[10px] text-muted-foreground">{t("fictional")}</p></div></div>
    <dl className="mt-6 grid grid-cols-2 gap-4 text-xs"><div><dt className="text-muted-foreground">{t("reviewState")}</dt><dd className="mt-2 text-gold-light">{t(item.state)}</dd></div><div><dt className="text-muted-foreground">{t("license")}</dt><dd className="mt-2">{item.license} · {t("original")}</dd></div></dl>
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3"><span className="text-[11px] text-muted-foreground">{item.tests.length} {t("testPlan")}</span><Button asChild variant="signal" size="sm"><Link to="/code-exchange/$id" params={{ id: item.id }}>{t("details")}<ArrowUpRight size={14} /></Link></Button></div>
  </article>;
}

export function ExchangeConnections() {
  const { t } = useExchangeLocale();
  return <aside className="min-w-0 space-y-12 border-t border-border pt-8 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
    <section><GitBranch size={26} className="mb-5 text-gold" /><h2 className="text-xl">{t("github")}</h2><p className="mt-3 font-mono text-[10px] text-gold-light">{t("off")}</p><p className="mt-5 text-sm leading-relaxed text-muted-foreground">{t("githubNote")}</p><h3 className="mt-6 font-sans text-xs font-semibold">{t("permissions")}</h3><ul className="mt-3 space-y-3 text-xs leading-relaxed text-muted-foreground">{(["metadata", "contents", "pullRequests"] as const).map((key) => <li key={key} className="flex gap-2"><LockKeyhole size={13} className="mt-0.5 shrink-0 text-gold" />{t(key)}</li>)}</ul><p className="mt-5 text-xs text-muted-foreground">{t("noProvider")}</p><Button variant="outline" disabled className="mt-5 h-auto min-h-10 whitespace-normal text-left"><LockKeyhole size={14} />{t("notConfigured")}</Button></section>
    <section className="border-t border-border pt-8"><h2 className="text-xl leading-relaxed">{t("marketplace")}</h2><p className="mt-4 font-mono text-sm text-gold-light">{t("price")}</p><p className="mt-4 text-sm leading-relaxed text-muted-foreground">{t("marketNote")}</p><p className="mt-4 text-xs leading-relaxed text-muted-foreground">{t("noCommerce")}</p></section>
  </aside>;
}

export function ExchangeFeed() {
  const { t } = useExchangeLocale();
  const [filters, setFilters] = useState<ExchangeFilters>(emptyExchangeFilters);
  const items = filterContributions(filters);
  const change = (key: keyof ExchangeFilters, value: string) => setFilters((prev) => ({ ...prev, [key]: value }));
  return <ExchangeShell page="exchange"><div className="grid gap-14 lg:grid-cols-[minmax(0,1fr)_280px]">
    <div className="min-w-0">
      <div className="relative"><Search size={18} className="pointer-events-none absolute left-4 top-4 text-gold" /><Input aria-label={t("search")} value={filters.query} onChange={(event) => change("query", event.target.value)} placeholder={t("search")} className="h-12 pl-11" /></div>
      <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5" role="group" aria-label={t("filters")}>
        {([{ key: "language", label: "programming" }, { key: "industry", label: "industry" }, { key: "readiness", label: "readiness" }, { key: "license", label: "license" }, { key: "authorType", label: "contributor" }] as const).map(({ key, label }) => <label key={key} className="min-w-0 text-[11px] text-muted-foreground">{t(label)}<select className="exchange-select mt-2 w-full" aria-label={t(label)} value={filters[key]} onChange={(event) => change(key, event.target.value)}><option value="">{t("all")}</option>{[...new Set(codeContributions.map((item) => item[key]))].map((value) => <option key={value} value={value}>{key === "language" || key === "license" ? value : t(value as CodeContribution["industry"] | CodeContribution["readiness"] | CodeContribution["authorType"])}</option>)}</select></label>)}
      </div>
      <div className="my-7 flex items-center justify-between gap-4"><p className="font-mono text-xs text-muted-foreground" role="status">{items.length} / {codeContributions.length} {t("results")}</p><Button variant="ghost" size="sm" onClick={() => setFilters(emptyExchangeFilters)}>{t("reset")}</Button></div>
      <div className="grid gap-x-8 gap-y-3 md:grid-cols-2">{items.map((item) => <ContributionCard key={item.id} item={item} />)}</div>
      {items.length === 0 && <div className="border-y border-border py-20 text-center"><Search size={28} className="mx-auto text-gold" /><h2 className="mt-5 text-xl">{t("noResults")}</h2><p className="mt-3 text-sm text-muted-foreground">{t("emptyHint")}</p></div>}
    </div><ExchangeConnections />
  </div></ExchangeShell>;
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return <section className="border-t border-border py-8"><h2 className="mb-5 text-xl leading-relaxed">{title}</h2>{children}</section>;
}

export function LocalDiscussion({ item }: { item: CodeContribution }) {
  const { t, locale } = useExchangeLocale();
  const { store, ready, storageAvailable, addFeedback } = useDemoExchange();
  const [name, setName] = useState(""); const [body, setBody] = useState("");
  const [kind, setKind] = useState<DemoFeedbackInput["kind"]>("Comment");
  const [message, setMessage] = useState<"feedbackSaved" | "feedbackError" | null>(null);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const result = demoFeedbackInput.safeParse({ contributionId: item.id, name, body, kind });
    if (!result.success) { setMessage("feedbackError"); return; }
    addFeedback(result.data); setBody(""); setMessage("feedbackSaved");
  };
  return <DetailSection title={t("comments")}>
    <p className="text-sm leading-relaxed text-muted-foreground">{t("commentsNote")}</p>
    {!storageAvailable && <p role="status" className="mt-4 text-sm text-warning">{t("memoryOnly")}</p>}
    {!ready ? <p className="mt-6 text-sm">{t("loading")}</p> : <>
      <ul className="mt-7 space-y-6">{store.feedback.filter((feedback) => feedback.contributionId === item.id).map((feedback) => <li key={feedback.id} className="border-l border-gold/30 pl-5"><div className="flex flex-wrap items-center gap-3 text-xs"><span>{feedback.name}</span><span className="text-gold-light">{t(feedback.kind)}</span><span className="text-muted-foreground">{t("localOnly")}</span></div><p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">{feedback.body}</p><time className="mt-3 block font-mono text-[10px] text-muted-foreground" dateTime={feedback.createdAt}>{new Date(feedback.createdAt).toLocaleString(locale)}</time></li>)}</ul>
      {store.feedback.every((feedback) => feedback.contributionId !== item.id) && <p className="mt-6 text-sm text-muted-foreground">{t("noComments")}</p>}
      <form className="mt-8 space-y-5" onSubmit={submit} noValidate>
        <div className="grid gap-5 sm:grid-cols-2"><label className="block text-xs text-muted-foreground">{t("name")}<Input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} autoComplete="off" className="mt-2" required /></label><label className="block text-xs text-muted-foreground">{t("kind")}<select aria-label={t("kind")} className="exchange-select mt-2 w-full" value={kind} onChange={(event) => { if (event.target.value === "Comment" || event.target.value === "Request changes" || event.target.value === "Recommend approval") setKind(event.target.value); }}>{(["Comment", "Request changes", "Recommend approval"] as const).map((action) => <option key={action} value={action}>{t(action)}</option>)}</select></label></div>
        <label className="block text-xs text-muted-foreground">{t("body")}<Textarea className="mt-2 min-h-28" value={body} onChange={(event) => setBody(event.target.value)} maxLength={2000} required /></label>
        {message && <p role={message === "feedbackError" ? "alert" : "status"} className={message === "feedbackError" ? "text-sm text-warning" : "text-sm text-gold-light"}>{t(message)}</p>}
        <Button type="submit" variant="signal" className="h-auto min-h-11 whitespace-normal"><MessageSquare size={16} />{t("post")}</Button>
      </form>
    </>}
  </DetailSection>;
}

export function UpgradePreview({ item }: { item: CodeContribution }) {
  const { t, locale } = useExchangeLocale();
  const { recordExport, ready } = useDemoExchange();
  const [message, setMessage] = useState<"exported" | "exportFailed" | null>(null);
  const exportManifest = () => {
    try {
      const url = URL.createObjectURL(new Blob([JSON.stringify(packagePreview(item, locale), null, 2)], { type: "application/json" }));
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = `DEMO-${item.id}-${item.version}.json`; anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      recordExport(item.id); setMessage("exported");
    } catch { setMessage("exportFailed"); }
  };
  return <section className="border-t border-gold/35 pt-8 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
    <Code2 size={28} className="mb-5 text-gold" /><h2 className="text-2xl leading-relaxed">{t("package")}</h2><p className="mt-4 font-mono text-[10px] text-gold-light">{t("unsigned")}</p><p className="mt-5 text-sm leading-relaxed text-muted-foreground">{t("packageIntro")}</p>
    <p className="my-8 border-y border-border py-5 font-mono text-3xl text-gold-light">v{item.version}</p>
    <dl className="space-y-6 text-sm">{([{ label: "checksum", value: t("checksumValue") }, { label: "license", value: `${item.license} · ${t("original")}` }, { label: "approval", value: t("approvalValue") }, { label: "signing", value: t("signingValue") }] as const).map(({ label, value }) => <div key={label}><dt className="text-xs text-muted-foreground">{t(label)}</dt><dd className="mt-2 leading-relaxed">{value}</dd></div>)}</dl>
    <h3 className="mt-8 font-sans text-sm font-semibold">{t("dependencies")}</h3><ul className="mt-3 space-y-2 text-xs leading-relaxed text-muted-foreground">{item.dependencies.map((dependency) => <li key={dependency}>{dependency}</li>)}</ul>
    <h3 className="mt-8 font-sans text-sm font-semibold">{t("rollback")}</h3><p className="mt-3 text-sm leading-relaxed text-muted-foreground">{item.rollback[locale]}</p>
    <Button variant="signal" disabled={!ready} onClick={exportManifest} className="mt-8 h-auto min-h-11 w-full whitespace-normal"><Download size={16} />{t("download")}</Button>{message && <p role="status" className="mt-4 text-xs leading-relaxed text-gold-light">{t(message)}</p>}
  </section>;
}

export function ContributionDetail({ item }: { item: CodeContribution }) {
  const { t, locale } = useExchangeLocale();
  const [copyState, setCopyState] = useState<"copy" | "copied" | "copyFailed">("copy");
  const links = referenceLinks(item);
  const copy = async () => { try { await navigator.clipboard.writeText(item.code); setCopyState("copied"); } catch { setCopyState("copyFailed"); } };
  return <ExchangeShell page="exchange">
    <Button asChild variant="ghost" className="mb-7 pl-0"><Link to="/code-exchange"><ArrowLeft size={16} />{t("back")}</Link></Button>
    <Button asChild variant="signal" className="mb-7 h-auto min-h-11 whitespace-normal"><Link to="/code-vault" search={{code:item.id}}>{locale==="es"?"Comparar original y cambios · demo":"Compare origin & changes · Demo"}<GitBranch size={16}/></Link></Button>
    <div className="mb-10 flex flex-wrap gap-x-5 gap-y-3 font-mono text-xs text-gold-light"><span>{item.language}</span><span>{t(item.industry)}</span><span>{t(item.readiness)}</span><span>{t("reviewState")}: {t(item.state)}</span></div>
    <h2 className="max-w-4xl text-3xl leading-relaxed md:text-4xl">{item.title[locale]}</h2>
    <section lang="en" className="mt-7 border-l border-gold/30 pl-5"><p className="text-xs text-gold-light">Linked Robotics & Mobility research · DEMO only</p><p className="mt-3 text-xs leading-loose text-muted-foreground">Reference only; this sample is not a robot or vehicle controller, and code reviews are not hardware safety approvals.</p><div className="mt-3 flex flex-wrap gap-2">{roboticsScenarios.filter(s => s.contributionId === item.id).map(s => <Button asChild key={s.id} variant="ghost" className="h-auto min-h-10 whitespace-normal text-left text-xs"><Link to="/robotics/$id" params={{ id: s.id }}>{s.title}</Link></Button>)}</div></section>
    <div className="mt-12 grid gap-14 lg:grid-cols-[minmax(0,1fr)_310px]">
      <div className="min-w-0">
        <DetailSection title={t("what")}><p className="text-sm leading-loose text-muted-foreground">{item.description[locale]}</p></DetailSection>
        <DetailSection title={t("compatibility")}><p className="text-sm leading-loose text-muted-foreground">{item.compatibility[locale]}</p></DetailSection>
        <DetailSection title={t("code")}><div className="mb-4 flex flex-wrap items-center justify-between gap-3 text-xs"><span className="font-mono text-gold-light">{item.filename}</span><Button variant="ghost" size="sm" onClick={() => void copy()} aria-label={t("copy")}>{copyState === "copied" ? <Check size={14} /> : <Copy size={14} />}{t(copyState === "copyFailed" ? "copy" : copyState)}</Button></div><pre tabIndex={0} aria-label={`${t("code")}: ${item.filename}`} className="exchange-code"><code translate="no">{item.code}</code></pre>{copyState === "copyFailed" && <p className="mt-3 text-xs text-warning" role="status">{t("copyFailed")}</p>}</DetailSection>
        <DetailSection title={t("source")}><dl className="space-y-5 text-sm"><div><dt className="text-xs text-muted-foreground">{t("author")}</dt><dd className="mt-2">{item.author} · {t(item.authorType)}<p className="mt-1 text-xs text-muted-foreground">{t("fictional")}</p></dd></div>{item.operator && <div><dt className="text-xs text-muted-foreground">{t("operator")}</dt><dd className="mt-2">{item.operator} · {item.agent}<p className="mt-1 text-xs text-muted-foreground">{t("fictional")}</p></dd></div>}<div><dt className="text-xs text-muted-foreground">{t("license")}</dt><dd className="mt-2">{item.license} · {t("original")}</dd></div></dl><h3 className="mt-8 font-sans text-sm font-semibold">{t("reference")}</h3><p className="mt-3 text-xs leading-loose text-muted-foreground">{item.reference.purpose[locale]} {t("referenceNote")}</p><div className="mt-4 flex flex-wrap gap-3"><Button asChild variant="signal" size="sm"><a href={links.repository} target="_blank" rel="noopener noreferrer">{t("repository")}<ArrowUpRight size={13} /></a></Button><Button asChild variant="signal" size="sm"><a href={links.commit} target="_blank" rel="noopener noreferrer">{t("commit")}<ArrowUpRight size={13} /></a></Button></div><p className="mt-4 break-all font-mono text-[10px] leading-loose text-muted-foreground">{item.reference.repository}<br />{item.reference.commit}</p><p className="mt-3 text-xs leading-loose text-muted-foreground">{t("sourceLicense")}: {item.reference.license}</p></DetailSection>
        <DetailSection title={t("reviewers")}><p className="mb-6 text-xs leading-relaxed text-muted-foreground">{t("reviewNote")}</p>{item.reviewers.map((reviewer) => <blockquote key={reviewer.name} className="border-l border-gold/30 pl-5"><p className="text-sm leading-loose text-muted-foreground">{reviewer.note[locale]}</p><footer className="mt-3 text-xs text-gold-light">{reviewer.name} · DEMO</footer></blockquote>)}</DetailSection>
        <DetailSection title={t("tests")}><p className="mb-6 text-sm leading-relaxed text-muted-foreground">{t("evidence")}</p><ol className="space-y-6">{item.tests.map((test, index) => <li key={test.name.en} className="flex gap-4"><span className="font-mono text-xs text-gold">0{index + 1}</span><div><h3 className="font-sans text-sm font-semibold">{test.name[locale]}</h3><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{test.procedure[locale]}</p><p className="mt-2 font-mono text-[10px] text-warning">{t("noExecution")}</p></div></li>)}</ol></DetailSection>
        <DetailSection title={t("security")}><div className="mb-4 flex items-center gap-3 text-warning"><ShieldAlert size={18} /><span className="font-mono text-xs">{t("risk")}: {t(item.risk)} · DEMO</span></div><p className="text-sm leading-loose text-muted-foreground">{item.security[locale]}</p></DetailSection>
        <DetailSection title={t("changelog")}><ul className="space-y-3 text-sm leading-relaxed text-muted-foreground">{item.changelog.map((entry) => <li key={entry.en}>{entry[locale]}</li>)}</ul></DetailSection>
        <LocalDiscussion item={item} />
      </div><div className="min-w-0"><UpgradePreview item={item} /></div>
    </div>
  </ExchangeShell>;
}

export function CommonsBoard() {
  const { t } = useExchangeLocale();
  const [state, setState] = useState("");
  const items = codeContributions.filter((item) => !state || item.state === state);
  return <ExchangeShell page="commons"><div className="mb-10 flex flex-wrap items-end justify-between gap-6"><div><h2 className="text-2xl">{t("board")}</h2><p className="mt-3 max-w-2xl text-xs leading-relaxed text-muted-foreground">{t("statusNote")}</p></div><Button asChild variant="signal"><Link to="/code-exchange">{t("openExchange")}<ArrowUpRight size={16} /></Link></Button></div><label className="mb-8 block max-w-xs text-xs text-muted-foreground">{t("reviewBoard")}<select aria-label={t("reviewBoard")} className="exchange-select mt-2 w-full" value={state} onChange={(event) => setState(event.target.value)}><option value="">{t("allStates")}</option>{exchangeStates.map((status) => <option key={status} value={status}>{t(status)}</option>)}</select></label><div className="grid gap-8 md:grid-cols-2 xl:grid-cols-3">{items.map((item) => <ContributionCard key={item.id} item={item} />)}</div>{items.length === 0 && <p className="border-y border-border py-12 text-sm text-muted-foreground">{t("noResults")}</p>}</ExchangeShell>;
}