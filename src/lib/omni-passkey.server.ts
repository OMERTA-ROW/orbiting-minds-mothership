import type { SupabaseClient } from "@supabase/supabase-js";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import { getRequestHeader } from "@tanstack/react-start/server";
import type { Database } from "@/integrations/supabase/types";
import { PASSKEY_FRESH_SECONDS } from "./omni-workspace";

type Admin = SupabaseClient<Database>;
type Purpose = Database["public"]["Tables"]["omni_passkey_checks"]["Row"]["purpose"];

/** Passkeys are bound to the site address they were made on. */
const ALLOWED_ORIGINS = [
  "https://evoomni.tech",
  "https://www.evoomni.tech",
  "https://orbiting-minds-mothership.lovable.app",
  "https://id-preview--f02f1b04-6f4d-4d33-bd52-d2d44971db21.lovable.app",
  "http://localhost:8080",
];

export function relyingParty() {
  const origin = getRequestHeader("origin") || "";
  if (!ALLOWED_ORIGINS.includes(origin)) throw new Error("Passkeys are not allowed from this address.");
  return { origin, rpID: new URL(origin).hostname };
}

async function newCheck(admin: Admin, ownerId: string, kind: "register" | "assert", purpose: Purpose, challenge: string, rpID: string) {
  const { data, error } = await admin
    .from("omni_passkey_checks")
    .insert({
      owner_id: ownerId,
      kind,
      purpose,
      challenge,
      rp_id: rpID,
      expires_at: new Date(Date.now() + 120_000).toISOString(),
    })
    .select("id")
    .single();
  if (error || !data) throw new Error("Passkey check could not start.");
  return data.id;
}

async function pendingCheck(admin: Admin, ownerId: string, checkId: string, kind: "register" | "assert") {
  const { data } = await admin
    .from("omni_passkey_checks")
    .select("*")
    .eq("id", checkId)
    .eq("owner_id", ownerId)
    .eq("kind", kind)
    .is("confirmed_at", null)
    .maybeSingle();
  if (!data || Date.parse(data.expires_at) < Date.now()) throw new Error("Passkey check expired. Try again.");
  return data;
}

export async function registrationOptions(admin: Admin, ownerId: string, email: string) {
  const { rpID } = relyingParty();
  const { data: existing } = await admin
    .from("omni_passkeys")
    .select("credential_id,transports")
    .eq("owner_id", ownerId)
    .eq("rp_id", rpID);
  const options = await generateRegistrationOptions({
    rpName: "Evolution Mothership",
    rpID,
    userName: email,
    userID: new TextEncoder().encode(ownerId),
    attestationType: "none",
    excludeCredentials: (existing ?? []).map((c) => ({
      id: c.credential_id,
      transports: c.transports as AuthenticatorTransportFuture[],
    })),
    authenticatorSelection: { residentKey: "preferred", userVerification: "required" },
  });
  const checkId = await newCheck(admin, ownerId, "register", "register", options.challenge, rpID);
  return { checkId, options };
}

export async function verifyRegistration(admin: Admin, ownerId: string, checkId: string, response: RegistrationResponseJSON, name: string) {
  const { origin, rpID } = relyingParty();
  const check = await pendingCheck(admin, ownerId, checkId, "register");
  if (check.rp_id !== rpID) throw new Error("Passkey check came from a different address.");
  const result = await verifyRegistrationResponse({
    response,
    expectedChallenge: check.challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: true,
  }).catch(() => null);
  await admin.from("omni_passkey_checks").update({ confirmed_at: new Date().toISOString(), used_at: new Date().toISOString() }).eq("id", checkId);
  if (!result?.verified) throw new Error("Passkey was not verified.");
  const cred = result.registrationInfo.credential;
  const { error } = await admin.from("omni_passkeys").insert({
    owner_id: ownerId,
    credential_id: cred.id,
    public_key: isoBase64URL.fromBuffer(cred.publicKey),
    counter: cred.counter,
    transports: cred.transports ?? [],
    name,
    rp_id: rpID,
  });
  if (error) throw new Error("Passkey could not be saved.");
}

export async function assertionOptions(admin: Admin, ownerId: string, purpose: Purpose) {
  const { rpID } = relyingParty();
  const { data: keys } = await admin
    .from("omni_passkeys")
    .select("credential_id,transports")
    .eq("owner_id", ownerId)
    .eq("rp_id", rpID);
  if (!keys?.length) throw new Error("Add a passkey for this address first.");
  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: "required",
    allowCredentials: keys.map((k) => ({ id: k.credential_id, transports: k.transports as AuthenticatorTransportFuture[] })),
  });
  const checkId = await newCheck(admin, ownerId, "assert", purpose, options.challenge, rpID);
  return { checkId, options };
}

export async function verifyAssertion(admin: Admin, ownerId: string, checkId: string, response: AuthenticationResponseJSON) {
  const { origin, rpID } = relyingParty();
  const check = await pendingCheck(admin, ownerId, checkId, "assert");
  const { data: key } = await admin
    .from("omni_passkeys")
    .select("*")
    .eq("owner_id", ownerId)
    .eq("credential_id", response.id)
    .eq("rp_id", rpID)
    .maybeSingle();
  if (!key || check.rp_id !== rpID) throw new Error("Passkey was not recognised.");
  const result = await verifyAuthenticationResponse({
    response,
    expectedChallenge: check.challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: true,
    credential: {
      id: key.credential_id,
      publicKey: isoBase64URL.toBuffer(key.public_key),
      counter: Number(key.counter),
      transports: key.transports as AuthenticatorTransportFuture[],
    },
  }).catch(() => null);
  if (!result?.verified) {
    await admin.from("omni_passkey_checks").update({ used_at: new Date().toISOString() }).eq("id", checkId);
    throw new Error("Passkey was not verified.");
  }
  const now = new Date().toISOString();
  await admin.from("omni_passkeys").update({ counter: result.authenticationInfo.newCounter, last_used_at: now }).eq("id", key.id);
  await admin.from("omni_passkey_checks").update({ confirmed_at: now }).eq("id", checkId);
}

/** Single use: a confirmed, unexpired check for one of the given purposes is marked used. */
export async function consumePasskeyCheck(admin: Admin, ownerId: string, checkId: string | undefined, purposes: Purpose[]) {
  if (!checkId) throw new Error("Fresh passkey check needed.");
  const since = new Date(Date.now() - PASSKEY_FRESH_SECONDS * 1000).toISOString();
  const { data } = await admin
    .from("omni_passkey_checks")
    .update({ used_at: new Date().toISOString() })
    .eq("id", checkId)
    .eq("owner_id", ownerId)
    .eq("kind", "assert")
    .in("purpose", purposes)
    .is("used_at", null)
    .gte("confirmed_at", since)
    .select("id");
  if (!data?.length) throw new Error("Fresh passkey check needed.");
}

/** Opening the workspace: any confirmed check in the last five minutes. */
export async function passkeyFreshAt(admin: Admin, ownerId: string): Promise<number | null> {
  const since = new Date(Date.now() - PASSKEY_FRESH_SECONDS * 1000).toISOString();
  const { data } = await admin
    .from("omni_passkey_checks")
    .select("confirmed_at")
    .eq("owner_id", ownerId)
    .eq("kind", "assert")
    .gte("confirmed_at", since)
    .order("confirmed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.confirmed_at ? Date.parse(data.confirmed_at) : null;
}
