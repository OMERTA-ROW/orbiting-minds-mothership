/** A successful transport with zero affected rows is not evidence of a saved action. */
export function confirmedWrite(
  action: string,
  result: { data: { id?: string; owner_id?: string } | null; error: unknown },
) {
  if (result.error || !result.data)
    throw new Error(`${action} was not confirmed as saved. Refresh records before retrying.`);
}

/** Require the documented read-only account response, never HTTP 200 alone. */
export function cloudAccountEvidence(provider: "railway" | "vultr", body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  if ("errors" in body && Array.isArray(body.errors) && body.errors.length > 0) return false;
  if (provider === "railway") {
    if (!("data" in body) || !body.data || typeof body.data !== "object") return false;
    if (!("me" in body.data) || !body.data.me || typeof body.data.me !== "object") return false;
    return (
      "id" in body.data.me && typeof body.data.me.id === "string" && body.data.me.id.length > 0
    );
  }
  return (
    "account" in body &&
    body.account !== null &&
    typeof body.account === "object" &&
    "balance" in body.account &&
    typeof body.account.balance === "number" &&
    Number.isFinite(body.account.balance)
  );
}
