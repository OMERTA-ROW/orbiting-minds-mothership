import { describe, expect, it } from "vitest";
import { base64UrlEncode, keyFingerprint } from "./omni-dock";
import { generateDockKey } from "./omni-dock-client";
import { buildManifest } from "./omni-contract";
import {
  NATIVE_CLIENT,
  encodeNativePublicKey,
  nativeAuthorizeSigningString,
  nativeCallbackUrl,
  nativeCodeChallenge,
  parseNativeAuthorizationRequest,
  type NativeAuthorizeSearch,
} from "./omni-native";
import { buildNativeCatalog } from "./omni-native-catalog";

const NOW = 1_800_000_000_000;

async function signedRequest() {
  const { privateKey, publicJwk } = await generateDockKey();
  const request: NativeAuthorizeSearch = {
    response_type: "code",
    client_id: NATIVE_CLIENT.id,
    redirect_uri: "http://127.0.0.1:49152/callback",
    state: "state-123456789012345678901234",
    code_challenge: "A".repeat(43),
    code_challenge_method: "S256",
    label: "OMNI Terminal",
    platform: "macos",
    public_key: encodeNativePublicKey(publicJwk),
    timestamp: String(NOW),
    nonce: "nonce-1234567890123456",
  };
  const proof = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privateKey,
    new TextEncoder().encode(
      nativeAuthorizeSigningString({
        clientId: NATIVE_CLIENT.id,
        redirectUri: request.redirect_uri!,
        state: request.state!,
        codeChallenge: request.code_challenge!,
        timestamp: request.timestamp!,
        nonce: request.nonce!,
        publicKey: publicJwk,
        label: request.label!,
        platform: request.platform!,
      }),
    ),
  );
  return {
    request: { ...request, proof: base64UrlEncode(new Uint8Array(proof)) },
    publicJwk,
  };
}

describe("native authorization request", () => {
  it("verifies the key-bound loopback request and returns its stable fingerprint", async () => {
    const { request, publicJwk } = await signedRequest();
    const parsed = await parseNativeAuthorizationRequest(request, NOW);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.request).toMatchObject({
      clientId: NATIVE_CLIENT.id,
      port: 49152,
      redirectUri: "http://127.0.0.1:49152/callback",
      platform: "macos",
      fingerprint: await keyFingerprint(publicJwk),
    });
  });

  it("rejects alternate hosts, stale proofs, and state changes", async () => {
    const { request } = await signedRequest();
    await expect(
      parseNativeAuthorizationRequest(
        { ...request, redirect_uri: "http://localhost:49152/callback" },
        NOW,
      ),
    ).resolves.toMatchObject({ ok: false, error: "invalid_callback" });
    await expect(parseNativeAuthorizationRequest(request, NOW + 300_001)).resolves.toMatchObject({
      ok: false,
      error: "proof_expired",
    });
    await expect(
      parseNativeAuthorizationRequest({ ...request, state: `${request.state}-changed` }, NOW),
    ).resolves.toMatchObject({ ok: false, error: "bad_proof" });
  });

  it("uses one-use callback state and S256 verifier challenges", async () => {
    const { request } = await signedRequest();
    const callback = new URL(
      nativeCallbackUrl(request.redirect_uri!, request.state!, {
        code: `omnicli_${"a".repeat(64)}`,
      }),
    );
    expect(callback.origin).toBe("http://127.0.0.1:49152");
    expect(callback.pathname).toBe("/callback");
    expect(callback.searchParams.get("state")).toBe(request.state);
    expect(callback.searchParams.get("code")).toBe(`omnicli_${"a".repeat(64)}`);
    expect(await nativeCodeChallenge("v".repeat(43))).toMatch(/^[A-Za-z0-9_-]{43}$/);
    await expect(nativeCodeChallenge("short")).resolves.toBeNull();
  });
});

describe("native catalog", () => {
  it("separates server configuration and web enrollment from unavailable native execution", () => {
    const manifest = buildManifest(null, {
      aiConfigured: true,
      chatInstalled: true,
      fusionPlanInstalled: true,
      fusionPlannerInstalled: true,
      now: NOW,
    });
    const catalog = buildNativeCatalog(manifest, ["cloud.read", "jobs.propose"]);
    expect(catalog.models[0]).toMatchObject({
      configured: true,
      nativeChatAvailable: false,
      reason: "native_chat_not_available",
    });
    expect(catalog.agents.length).toBeGreaterThan(0);
    expect(catalog.agents.every((agent) => agent.nativeChatAvailable === false)).toBe(true);
    expect(catalog.tasks).toMatchObject({
      proposal: { available: true, result: "held" },
      status: { available: false },
      approval: { available: false },
      execution: { available: false, executor: "none" },
    });
    expect(catalog.fusion).toMatchObject({
      state: "rules_only",
      orchestratorAvailable: false,
      nativePlanningAvailable: false,
    });
  });
});
