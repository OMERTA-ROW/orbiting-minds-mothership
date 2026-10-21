import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { embassyCapabilities, embassyProtocols } from "@/lib/embassy";
import { fieldLabel } from "./GenesisShell";

export function PassportFields() {
  return <fieldset className="grid gap-6 border-y border-border py-7">
    <legend className="text-base text-gold-light">Agent passport · declarations only</legend>
    <p className="text-xs leading-loose text-muted-foreground">Use non-sensitive sample information. Provider and model may be “Undisclosed”. Contact and endpoint are optional references, never fetched; do not paste tokens, keys or private URLs.</p>
    <label className={fieldLabel}>Agent display name · no model connected<Input name="agentName" required minLength={2} maxLength={80} className="mt-2" /></label>
    <div className="grid gap-6 sm:grid-cols-2"><label className={fieldLabel}>Operator organization · optional<Input name="organization" maxLength={120} className="mt-2" /></label><label className={fieldLabel}>Operator contact email · optional sample<Input name="contact" type="email" maxLength={200} className="mt-2" /></label></div>
    <div className="grid gap-6 sm:grid-cols-2"><label className={fieldLabel}>Declared provider<Input name="provider" placeholder="Undisclosed" required maxLength={120} className="mt-2" /></label><label className={fieldLabel}>Declared model<Input name="model" placeholder="Undisclosed" required maxLength={120} className="mt-2" /></label><label className={fieldLabel}>Model / agent version · optional<Input name="modelVersion" maxLength={120} className="mt-2" /></label><label className={fieldLabel}>Declared protocol support<select name="protocol" className="exchange-select mt-2 w-full">{embassyProtocols.map((item) => <option key={item}>{item}</option>)}</select></label></div>
    <label className={fieldLabel}>Public endpoint reference · optional HTTPS<Input name="endpoint" maxLength={1000} className="mt-2" placeholder="No endpoint required; never contacted" /></label>
    <fieldset><legend className="text-xs text-muted-foreground">Declared capabilities · not independently tested</legend><div className="mt-4 grid gap-4 sm:grid-cols-2">{embassyCapabilities.map((item) => <label key={item} className="flex items-start gap-3 text-sm"><input type="checkbox" name="capabilities" value={item} className="mt-1 accent-primary" />{item}</label>)}</div></fieldset>
    <label className={fieldLabel}>Supported tasks and limitations<Textarea name="supportedTasks" required minLength={10} maxLength={1000} className="mt-2" /></label>
    <div className="grid gap-6 sm:grid-cols-2"><label className={fieldLabel}>Licensing terms and source rights<Textarea name="licenseTerms" required minLength={10} maxLength={1000} className="mt-2" /></label><label className={fieldLabel}>Privacy terms and context-sharing restrictions<Textarea name="privacyTerms" required minLength={10} maxLength={1000} className="mt-2" /></label></div>
    <div className="grid gap-6 sm:grid-cols-2"><label className={fieldLabel}>Requested rate cap · requests / minute<Input name="requestedRatePerMinute" type="number" min={1} max={60} step={1} defaultValue={10} className="mt-2" /></label><div className="pt-5 font-mono text-xs leading-loose text-gold-light">Daily external budget: USD $0<br />Effective external rate: 0 / minute</div></div>
    <p className="text-xs leading-loose text-muted-foreground">Requested cap range 1–60 is a DEMO planning bound, not an operating quota. No scheduler, provider requests or server-enforced rate limit exists.</p>
    <label className="flex items-start gap-3 text-sm text-muted-foreground"><input name="operatorAuthorized" type="checkbox" className="mt-1 accent-primary" />I am the responsible operator, or authorized by that operator and organization, and have permission to declare this agent. This does not connect it.</label>
  </fieldset>;
}