import { createServerFn } from "@tanstack/react-start";
import { officialBlankForms } from "@/lib/omni-legal-forms";

/** Intentionally public: fixed official public blank form IDs, never case data. */
export const retrieveOfficialBlankForm = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    if (!input || typeof input !== "object" || !("id" in input) || typeof input.id !== "string" || Object.keys(input).length !== 1 || !officialBlankForms.some((f) => f.id === input.id)) throw new Error("Unknown official blank form.");
    return { id: input.id };
  })
  .handler(async ({ data }) => {
    const form = officialBlankForms.find((f) => f.id === data.id);
    if (!form) throw new Error("Unknown official blank form.");
    try {
      const { fetchOfficialBlankPdf } = await import("@/lib/omni-legal-form-fetch.server");
      const result = await fetchOfficialBlankPdf(form.pdfUrl, officialBlankForms.map((f) => f.pdfUrl));
      if (result.sha256 !== form.sha256) return { status: "unavailable" as const, id: form.id, error: "Official source version changed; catalog re-verification pending. Use official-site handoff.", pdf: null };
      return { status: "retrieved" as const, id: form.id, error: null, pdf: result };
    } catch (error) {
      return { status: "unavailable" as const, id: form.id, error: error instanceof Error && error.message.startsWith("Official source unavailable") ? error.message : "Official PDF unavailable or failed bounded verification. Use official-site handoff.", pdf: null };
    }
  });