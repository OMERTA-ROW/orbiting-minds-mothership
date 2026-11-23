/**
 * Voice hook for later server-side voices (ElevenLabs first, for Jax). Not built: always
 * `not_connected`, makes no network call and reads no secret.
 */
export type VoiceRequest = { agentId: string; voiceId: string; text: string };
export type VoiceResult = { ok: false; reason: "not_connected" };

export async function synthesizeSpeech(_req: VoiceRequest): Promise<VoiceResult> {
  return { ok: false, reason: "not_connected" };
}
