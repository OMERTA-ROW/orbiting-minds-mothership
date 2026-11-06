export interface GatewayFailure {
  status: number;
  message: string;
}

export function safeGatewayFailure(status: number, body: unknown): GatewayFailure {
  const data = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const nested =
    data["error"] && typeof data["error"] === "object"
      ? (data["error"] as Record<string, unknown>)
      : {};
  const message =
    typeof data["message"] === "string"
      ? data["message"]
      : typeof nested["message"] === "string"
        ? nested["message"]
        : "";
  const defaults: Record<number, string> = {
    400: "The AI request was rejected. Your concept is unchanged.",
    401: "Lovable AI is not configured correctly. The owner needs to check the AI connection.",
    402: "AI credits are insufficient. Add credits in Settings → Plans & credits.",
    403: "AI access is blocked. The workspace owner needs to restore access.",
    404: "The selected AI model or endpoint is unavailable. Generation is paused.",
    429: "AI is busy. Please wait before starting a new generation.",
  };
  return {
    status,
    message:
      message.slice(0, 1500) ||
      defaults[status] ||
      "AI generation is unavailable right now. Your concept is unchanged.",
  };
}

export function requiresPersistentPause(status: number) {
  return status === 402 || status === 403 || status === 404;
}
