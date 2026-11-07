/**
 * Reference client for omni.dock/v1. Honeycomb Terminal (and other OMNI
 * branches) can copy this file. It only signs requests; it never runs
 * commands. Keep the private key non-extractable in IndexedDB/Keychain, and
 * use a key separate from any file-transfer identity.
 */
import {
  DOCK_HEADERS,
  DOCK_PROTOCOL,
  base64UrlEncode,
  publicJwkSchema,
  sha256Hex,
  signingString,
  type DockPublicJwk,
} from "./omni-dock";

export async function generateDockKey(): Promise<{
  privateKey: CryptoKey;
  publicJwk: DockPublicJwk;
}> {
  const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;
  const jwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  return { privateKey: pair.privateKey, publicJwk: publicJwkSchema.parse(jwk) };
}

export function newNonce(): string {
  return base64UrlEncode(crypto.getRandomValues(new Uint8Array(18)));
}

/** Returns the headers for a signed dock request. `device` is "pair" for the pairing request. */
export async function signDockRequest(p: {
  privateKey: CryptoKey;
  method?: string;
  path: string;
  device: string;
  body: string;
  now?: number;
  nonce?: string;
}): Promise<Record<string, string>> {
  const timestamp = String(p.now ?? Date.now());
  const nonce = p.nonce ?? newNonce();
  const message = signingString({
    method: p.method ?? "POST",
    path: p.path,
    device: p.device,
    timestamp,
    nonce,
    bodySha256: await sha256Hex(p.body),
  });
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    p.privateKey,
    new TextEncoder().encode(message),
  );
  return {
    "content-type": "application/json",
    [DOCK_HEADERS.device]: p.device,
    [DOCK_HEADERS.timestamp]: timestamp,
    [DOCK_HEADERS.nonce]: nonce,
    [DOCK_HEADERS.signature]: base64UrlEncode(new Uint8Array(sig)),
  };
}

export function pairBody(p: {
  code: string;
  label: string;
  platform: string;
  publicJwk: DockPublicJwk;
  appVersion?: string;
  capabilities?: string[];
}): string {
  return JSON.stringify({
    protocol: DOCK_PROTOCOL,
    code: p.code,
    label: p.label,
    platform: p.platform,
    publicKey: p.publicJwk,
    appVersion: p.appVersion,
    capabilities: p.capabilities,
  });
}
