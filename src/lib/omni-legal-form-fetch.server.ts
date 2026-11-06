/** Public blank PDFs only. No client URL, credentials, private records or uploads. */
export const FORM_MAX_BYTES = 4 * 1024 * 1024;

export async function fetchOfficialBlankPdf(
  url: string,
  allowedUrls: readonly string[],
  fetcher: typeof fetch = fetch,
) {
  if (!allowedUrls.includes(url) || new URL(url).protocol !== "https:")
    throw new Error("Official blank form is not allowlisted.");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetcher(url, {
      redirect: "manual",
      signal: controller.signal,
      headers: { Accept: "application/pdf" },
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`Official source unavailable (HTTP ${response.status}).`);
    }
    if (!/^application\/pdf(?:;|$)/i.test(response.headers.get("content-type") ?? "")) {
      await response.body?.cancel();
      throw new Error("Official source did not return a PDF.");
    }
    const declared = Number(response.headers.get("content-length"));
    if (declared > FORM_MAX_BYTES) {
      await response.body?.cancel();
      throw new Error("Official PDF exceeds intake limit.");
    }
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Official PDF body unavailable.");
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > FORM_MAX_BYTES) throw new Error("Official PDF exceeds intake limit.");
        chunks.push(value);
      }
    } catch (error) {
      await reader.cancel().catch(() => {});
      throw error;
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-")
      throw new Error("Invalid official PDF signature.");
    const sha256 = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    let binary = "";
    for (let i = 0; i < bytes.length; i += 8192)
      binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return { base64: btoa(binary), bytes: length, sha256, retrievedAt: new Date().toISOString() };
  } finally {
    clearTimeout(timer);
  }
}
