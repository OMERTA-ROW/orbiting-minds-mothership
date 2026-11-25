import { describe, expect, it } from "vitest";
import { sha256Hex } from "./omni-api-keys";
import { nativeCodeChallenge } from "./omni-native";
import {
  exchangeNativeAuthorizationCode,
  nativeAuthorizationReadiness,
  type NativeRpc,
} from "./omni-native.server";

const CODE = `omnicli_${"a".repeat(64)}`;
const VERIFIER = "v".repeat(43);
const REDIRECT = "http://127.0.0.1:49152/callback";

function request(body: Record<string, unknown>, headers: Record<string, string> = {}) {
  return new Request("https://mothership.test/api/public/omni/native/token", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

const body = {
  grant_type: "authorization_code",
  client_id: "omni-native-cli",
  redirect_uri: REDIRECT,
  code: CODE,
  code_verifier: VERIFIER,
};

describe("native authorization code exchange", () => {
  it("refuses browser-originated and malformed requests before database exchange", async () => {
    const calls: string[] = [];
    const rpc: NativeRpc = async (fn) => (calls.push(fn), { data: true, error: null });
    const browser = await exchangeNativeAuthorizationCode(
      request(body, { origin: "https://attacker.test" }),
      rpc,
    );
    expect(browser.status).toBe(403);
    const malformed = await exchangeNativeAuthorizationCode(
      request({ ...body, redirect_uri: "http://localhost:49152/callback" }),
      rpc,
    );
    expect(malformed.status).toBe(400);
    expect(calls).toEqual([]);
  });

  it("exchanges only the hashed code and PKCE challenge without issuing a bearer token", async () => {
    const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
    const rpc: NativeRpc = async (fn, args) => {
      calls.push({ fn, args });
      return fn === "omni_native_authorization_ready"
        ? { data: true, error: null }
        : {
            data: {
              ok: true,
              device_id: "0f0e0d0c-0b0a-4908-8706-050403020100",
              status: "paired",
              permissions: ["status.read", "jobs.propose"],
              key_fingerprint: "a".repeat(64),
              revision: 1,
            },
            error: null,
          };
    };
    const response = await exchangeNativeAuthorizationCode(request(body), rpc);
    const result = await response.json();
    expect(response.status).toBe(200);
    expect(result).toMatchObject({
      ok: true,
      protocol: "omni.native-auth/v1",
      credentialType: "device-signature",
      bearerTokenIssued: false,
      status: "paired",
    });
    expect(result).not.toHaveProperty("access_token");
    const exchange = calls.find((call) => call.fn === "omni_native_exchange");
    expect(exchange?.args).toMatchObject({
      _code_hash: await sha256Hex(CODE),
      _code_challenge: await nativeCodeChallenge(VERIFIER),
      _port: 49152,
    });
  });

  it("reports an unapplied native migration without attempting the exchange", async () => {
    const calls: string[] = [];
    const rpc: NativeRpc = async (fn) => (calls.push(fn), { data: false, error: null });
    const response = await exchangeNativeAuthorizationCode(request(body), rpc);
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: "not_installed" });
    expect(calls).toEqual(["omni_native_authorization_ready"]);
  });

  it("distinguishes a missing migration from an unreadable readiness check", async () => {
    await expect(
      nativeAuthorizationReadiness(async () => ({
        data: null,
        error: { code: "PGRST202" },
      })),
    ).resolves.toBe("not_installed");
    await expect(
      nativeAuthorizationReadiness(async () => ({
        data: null,
        error: { code: "PGRST500" },
      })),
    ).resolves.toBe("unavailable");
  });
});
