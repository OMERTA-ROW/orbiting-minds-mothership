import { useRef, useState } from "react";
import { Download, Check, Braces } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { sdkContracts, downloadJson } from "@/lib/genesis-sdk";
import { GenesisShell, FormNotice } from "./GenesisShell";
export function SdkPage() {
  const validationRequest = useRef(0);
  const [validating, setValidating] = useState(false);
  function clearValidation() {
    validationRequest.current += 1;
    setValidating(false);
    setResult(null);
  }
  async function validateContract() {
    if (!contract) return;
    const request = ++validationRequest.current;
    const key = contract.key;
    const json = raw;
    setValidating(true);
    setResult(null);
    try {
      const { validateSdkJson } = await import("@/lib/genesis-sdk-validation");
      if (request === validationRequest.current) setResult(validateSdkJson(key, json));
    } catch {
      if (request === validationRequest.current)
        setResult({
          valid: false,
          errors: ["Local validator could not load. No data was sent; try again."],
        });
    } finally {
      if (request === validationRequest.current) setValidating(false);
    }
  }
  const first = sdkContracts[0];
  const [selected, setSelected] = useState(first?.key ?? "");
  const [raw, setRaw] = useState(JSON.stringify(first?.example ?? {}, null, 2));
  const [result, setResult] = useState<{ valid: boolean; errors: string[] } | null>(null);
  const [message, setMessage] = useState("");
  const contract = sdkContracts.find((item) => item.key === selected);
  return (
    <GenesisShell title="Universal SDK / API" eyebrow="Contracts before connections">
      <div className="mb-12 border-y border-border py-8">
        <Braces size={28} className="mb-5 text-gold" />
        <h2 className="text-2xl">JSON Schema · draft 2020-12</h2>
        <p className="mt-5 max-w-3xl text-sm leading-loose text-muted-foreground">
          Downloadable, locally validated design contracts for a future owner-scoped API. No SDK
          client, API endpoint, API key or integration is live. Example UUIDs are fictional. Local
          browser records use a different rehearsal format.
        </p>
        <p className="mt-4 text-xs leading-loose text-muted-foreground">
          Future handlers must derive the caller from validated authentication, verify project
          membership and consent, enforce scope/expiry/spend limits server-side, and apply
          owner-scoped policies. Supplied ownerId fields cannot authorize access. No anonymous
          private-data reads.
        </p>
      </div>
      <div className="grid gap-12 lg:grid-cols-[240px_minmax(0,1fr)]">
        <nav aria-label="SDK contracts" className="flex flex-wrap gap-2 lg:flex-col">
          {sdkContracts.map((item) => (
            <Button
              key={item.key}
              variant={selected === item.key ? "signal" : "ghost"}
              className="h-auto min-h-11 justify-start whitespace-normal text-left text-xs"
              aria-pressed={selected === item.key}
              onClick={() => {
                setSelected(item.key);
                setRaw(JSON.stringify(item.example, null, 2));
                clearValidation();
                setMessage("");
              }}
            >
              {item.title}
            </Button>
          ))}
        </nav>
        {contract && (
          <section className="min-w-0">
            <h2 className="text-2xl">{contract.title}</h2>
            <p className="mt-4 text-sm leading-loose text-muted-foreground">
              {contract.description}
            </p>
            <div className="my-6 flex flex-wrap gap-3">
              <Button
                variant="signal"
                className="h-auto min-h-11 whitespace-normal"
                onClick={() => {
                  try {
                    downloadJson(`evolution-${contract.key}.schema.json`, contract.schema);
                    setMessage("JSON Schema downloaded; no API call made.");
                  } catch {
                    setMessage("Download unavailable.");
                  }
                }}
              >
                <Download size={16} />
                Download schema
              </Button>
              <Button
                variant="ghost"
                className="h-auto min-h-11 whitespace-normal"
                onClick={() => {
                  try {
                    downloadJson(`DEMO-${contract.key}.json`, contract.example);
                    setMessage("Fictional DEMO example downloaded.");
                  } catch {
                    setMessage("Download unavailable.");
                  }
                }}
              >
                <Download size={16} />
                Download example
              </Button>
            </div>
            <FormNotice message={message} />
            <details className="my-7 border-y border-border py-5">
              <summary className="cursor-pointer text-sm text-gold-light">
                Inspect contract schema
              </summary>
              <pre className="exchange-code mt-5" tabIndex={0}>
                <code>{JSON.stringify(contract.schema, null, 2)}</code>
              </pre>
            </details>
            <label className="block text-xs text-muted-foreground">
              Example JSON · edit and validate locally
              <Textarea
                aria-label="Contract JSON"
                value={raw}
                onChange={(event) => {
                  setRaw(event.target.value);
                  clearValidation();
                }}
                className="mt-3 min-h-80 font-mono text-xs leading-loose"
                spellCheck={false}
                maxLength={50000}
              />
            </label>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button variant="signal" disabled={validating} onClick={validateContract}>
                <Check size={16} />
                {validating ? "Validating…" : "Validate JSON locally"}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setRaw(JSON.stringify(contract.example, null, 2));
                  clearValidation();
                }}
              >
                Reset example
              </Button>
            </div>
            {result && (
              <div role="status" className="mt-5 border-l border-gold/40 pl-4">
                <p className={result.valid ? "text-sm text-success" : "text-sm text-warning"}>
                  {result.valid
                    ? "Valid contract shape. This does not grant permissions or verify evidence."
                    : "Contract validation failed."}
                </p>
                <ul className="mt-3 space-y-2 break-words font-mono text-xs text-muted-foreground">
                  {result.errors.map((error, index) => (
                    <li key={index}>{error}</li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}
      </div>
    </GenesisShell>
  );
}
