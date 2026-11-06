import { useState } from "react";
import { Laptop, Server, Tablet, Smartphone, Link2, KeyRound, ShieldX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { guardianDeviceFixtures, guardianDeviceScopes } from "@/data/evolution";
import { useGuardian } from "@/hooks/use-guardian";
import { GuardianShell, GuardianHistory, GuardianNotice, useGuardianAction } from "./GuardianShell";
import type { GuardianStore, DeviceScope } from "@/lib/guardian";
export function DeviceDirectory() {
  const { store, now } = useGuardian();
  const { run, message } = useGuardianAction();
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("");
  const [pairDevice, setPairDevice] = useState("mac-demo");
  const [code, setCode] = useState("");
  const [consent, setConsent] = useState(false);
  const pending = [...store.pairings]
    .reverse()
    .find((p) => p.deviceId === pairDevice && p.state === "Pending");
  const active = pending && Date.parse(pending.expiresAt) > Date.parse(now);
  const fixtures = guardianDeviceFixtures.filter(
    (d) =>
      `${d.name} ${d.os} ${d.kind}`.toLowerCase().includes(query.toLowerCase()) &&
      (!group || store.devices.find((s) => s.id === d.id)?.group === group),
  );
  return (
    <>
      <div className="mb-8 flex flex-wrap gap-4">
        <label className="min-w-0 flex-1 text-xs text-muted-foreground">
          Find a fictional device
          <input
            className="exchange-select mt-2 w-full"
            placeholder="Name or platform"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label className="text-xs text-muted-foreground">
          Group
          <select
            className="exchange-select mt-2 block w-full"
            value={group}
            onChange={(e) => setGroup(e.target.value)}
          >
            <option value="">All groups</option>
            {["Home", "Work", "Lab"].map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {fixtures.map((f) => {
          const d = store.devices.find((d) => d.id === f.id);
          return d ? <DeviceCard key={f.id} device={d} /> : null;
        })}
      </div>
      {!fixtures.length && (
        <p className="mt-5 text-muted-foreground">No matching fictional devices.</p>
      )}
      <section id="pairing" className="mt-14 border-t border-border pt-8">
        <h2 className="flex items-center gap-3 text-2xl">
          <Link2 size={22} className="text-gold" />
          Join by code · local rehearsal
        </h2>
        <p className="mt-4 max-w-3xl text-sm leading-loose text-muted-foreground">
          5-minute single-use example bound to one fictional device. Confirmation creates a
          15-minute local demo identity with scopes OFF. Real pairing requires authenticated owner
          and physical device confirmation, device keypair and signed native/companion software. No
          QR or installer pretends to enroll a host.
        </p>
        <div className="mt-6 grid gap-5 md:grid-cols-2">
          <div>
            <label className="text-xs">
              Pairing device
              <select
                aria-label="Pairing device"
                className="exchange-select mt-2 block w-full"
                value={pairDevice}
                onChange={(e) => {
                  setPairDevice(e.target.value);
                  setCode("");
                  setConsent(false);
                }}
              >
                {guardianDeviceFixtures.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
            <Button
              variant="signal"
              className="mt-4"
              disabled={store.paused}
              onClick={() => {
                if (run({ type: "pairCode", deviceId: pairDevice })) {
                  setCode("");
                  setConsent(false);
                }
              }}
            >
              <KeyRound size={16} />
              Generate demo join code
            </Button>
            {pending && (
              <div className="mt-4 border-l border-gold/40 pl-4">
                <p className="break-all font-mono text-lg text-gold-light">{pending.code}</p>
                <p className="mt-3 text-xs text-muted-foreground">
                  {active ? "Expires" : "Expired"}: {pending.expiresAt} · never an access credential
                </p>
              </div>
            )}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (run({ type: "pairConfirm", deviceId: pairDevice, code, consent })) {
                setCode("");
                setConsent(false);
              }
            }}
          >
            <label className="text-xs">
              Demo join code
              <input
                aria-label="Demo join code"
                className="exchange-select mt-2 w-full font-mono"
                maxLength={13}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="DEMO-XXXXXXXX"
              />
            </label>
            <label className="mt-4 flex items-start gap-3 text-xs leading-loose">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-1 shrink-0"
              />
              I confirm this fictional pairing; no real device ownership or OS permission is
              verified.
            </label>
            <Button
              type="submit"
              variant="cosmic"
              className="mt-4"
              disabled={!consent || !code || store.paused}
            >
              Confirm demo pairing
            </Button>
          </form>
        </div>
        <GuardianNotice message={message} />
      </section>
    </>
  );
}
function DeviceCard({ device: d }: { device: GuardianStore["devices"][number] }) {
  const { store, now } = useGuardian();
  const { run, message } = useGuardianAction();
  const [consent, setConsent] = useState(false);
  const f = guardianDeviceFixtures.find((f) => f.id === d.id);
  if (!f) return null;
  const Icon =
    f.kind === "Server"
      ? Server
      : f.kind === "Tablet"
        ? Tablet
        : f.kind === "Phone"
          ? Smartphone
          : Laptop;
  const valid =
    !store.paused &&
    d.state === "Demo paired" &&
    Boolean(d.expiresAt && Date.parse(d.expiresAt) > Date.parse(now));
  return (
    <article aria-label={f.name} className="min-w-0 rounded-md border border-border bg-card/30 p-5">
      <div className="flex items-center justify-between gap-4">
        <Icon size={25} className="text-gold" />
        <span className="font-mono text-[10px] text-gold-light">DEMO · NOT CONNECTED</span>
      </div>
      <h3 className="mt-5 text-xl leading-relaxed">{f.name}</h3>
      <p className="mt-2 text-xs text-muted-foreground">
        {f.os} · {f.kind} · {f.samplePresence}
      </p>
      <dl className="mt-5 grid grid-cols-2 gap-3 text-xs">
        <dt className="text-muted-foreground">Identity</dt>
        <dd>
          {d.state}
          {d.state === "Demo paired" && !valid ? " · expired" : ""}
        </dd>
        <dt className="text-muted-foreground">Owner</dt>
        <dd>Unverified demo participant</dd>
        <dt className="text-muted-foreground">Agent version</dt>
        <dd>None installed</dd>
        <dt className="text-muted-foreground">Last real check-in</dt>
        <dd>Never</dd>
        <dt className="text-muted-foreground">Battery / network</dt>
        <dd className="break-words">
          {f.battery} / {f.network}
        </dd>
        <dt className="text-muted-foreground">Telemetry</dt>
        <dd>OFF · no data collected</dd>
        <dt className="text-muted-foreground">Signature / OS checks</dt>
        <dd className="text-warning">NOT VERIFIED</dd>
      </dl>
      {d.expiresAt && (
        <p className="mt-4 break-words font-mono text-[10px] text-muted-foreground">
          Demo identity expiry: {d.expiresAt}
        </p>
      )}
      <label className="mt-5 block text-xs">
        Device group
        <select
          aria-label={`Group for ${f.name}`}
          className="exchange-select mt-2 w-full"
          value={d.group}
          onChange={(e) =>
            run({ type: "group", deviceId: d.id, group: e.target.value as "Home" | "Work" | "Lab" })
          }
        >
          {["Home", "Work", "Lab"].map((g) => (
            <option key={g}>{g}</option>
          ))}
        </select>
      </label>
      <p className="mt-3 text-[10px] text-muted-foreground">
        Group membership never grants another host’s scopes.
      </p>
      <fieldset className="mt-5 border-t border-border pt-4">
        <legend className="text-xs text-gold-light">Per-device rehearsal scopes</legend>
        <label className="mb-4 flex items-start gap-2 text-xs leading-relaxed">
          <input
            type="checkbox"
            aria-label={`Scope consent for ${f.name}`}
            disabled={!valid}
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
          />
          I consent to changing only this device’s demo scope choices.
        </label>
        {guardianDeviceScopes.map((s) => (
          <label key={s} className="mb-3 flex items-center gap-2 font-mono text-[11px]">
            <input
              type="checkbox"
              aria-label={`${s} for ${f.name}`}
              checked={d.scopes.includes(s)}
              disabled={!valid || !consent}
              onChange={(e) => {
                const scopes: DeviceScope[] = e.target.checked
                  ? [...d.scopes, s]
                  : d.scopes.filter((v) => v !== s);
                run({ type: "scopes", deviceId: d.id, scopes, consent });
              }}
            />
            {s}
          </label>
        ))}
      </fieldset>
      <p className="mt-4 text-xs leading-loose text-muted-foreground">{f.limitation}</p>
      <Button
        variant="outline"
        className="mt-5 h-auto min-h-11 whitespace-normal"
        disabled={d.state === "Unpaired" || d.state === "Revoked"}
        onClick={() => {
          run({ type: "revoke", deviceId: d.id });
          setConsent(false);
        }}
      >
        <ShieldX size={15} />
        Revoke demo identity
      </Button>
      <GuardianNotice message={message} />
    </article>
  );
}
export function DevicesPage() {
  return (
    <GuardianShell title="My Devices">
      <DeviceDirectory />
      <GuardianHistory />
    </GuardianShell>
  );
}
