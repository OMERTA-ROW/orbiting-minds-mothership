/**
 * RAZUL Sentinel report endpoint. Public-route prefix so enrolled projects can
 * reach it; authentication is the sentinel's own expiring scoped credential
 * (hash-verified in the database), never a blanket key. Rate-limited per
 * sentinel, append-only storage, actionable reports fan out as agent alerts.
 */
import { createFileRoute } from "@tanstack/react-router";
import {
  SENTINEL_LIMITS,
  sentinelAlertTargets,
  validateSentinelReport,
  type SentinelKind,
} from "@/lib/razul-sentinel";

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const Route = createFileRoute("/api/public/razul-sentinel/report")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.json().catch(() => null);
        const invalid = validateSentinelReport(body);
        if (invalid) return Response.json({ error: invalid }, { status: 400 });
        const { sentinelId, token, kind, payload } = body as {
          sentinelId: string;
          token: string;
          kind: SentinelKind;
          payload: Record<string, unknown>;
        };

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const tokenHash = await sha256(token);
        const verify = await supabaseAdmin.rpc("razul_sentinel_verify", {
          _id: sentinelId,
          _token_hash: tokenHash,
          _kind: kind,
        });
        if (verify.error || verify.data !== true)
          return Response.json({ error: "Sentinel credential rejected" }, { status: 401 });

        // Rate limit: bounded reports per sentinel per hour.
        const since = new Date(Date.now() - 3600_000).toISOString();
        const recent = await supabaseAdmin
          .from("razul_sentinel_events")
          .select("id", { count: "exact", head: true })
          .eq("sentinel_id", sentinelId)
          .gte("created_at", since);
        if ((recent.count ?? 0) >= SENTINEL_LIMITS.maxEventsPerHour)
          return Response.json({ error: "Sentinel rate limit exceeded" }, { status: 429 });

        const inserted = await supabaseAdmin
          .from("razul_sentinel_events")
          .insert({ sentinel_id: sentinelId, kind, payload })
          .select("id")
          .single();
        if (inserted.error)
          return Response.json({ error: "Report could not be stored" }, { status: 500 });

        // Actionable reports become a provenance-tagged finding plus alert
        // events for the enabled Jackboy/OMNI feeds.
        const targets = sentinelAlertTargets(kind);
        if (targets.length) {
          const sentinel = await supabaseAdmin
            .from("razul_sentinels")
            .select("name")
            .eq("id", sentinelId)
            .single();
          const sourceName = `Sentinel: ${sentinel.data?.name ?? sentinelId}`;
          // Sentinels enrolled before source registration existed still need a
          // provenance source row for the findings foreign key.
          await supabaseAdmin.from("razul_sources").upsert(
            {
              id: `sentinel:${sentinelId}`,
              name: sourceName,
              url: `sentinel://${sentinelId}`,
              kind: "sentinel",
              category: "project-operations",
              terms_note: "Owner-enrolled project sentinel; scoped credential reports only.",
              active: true,
            } as never,
            { onConflict: "id" },
          );
          const title =
            typeof payload.title === "string" && payload.title.trim()
              ? payload.title.slice(0, 300)
              : `Sentinel ${kind} report`;
          const finding = await supabaseAdmin
            .from("razul_findings")
            .insert({
              source_id: `sentinel:${sentinelId}`,
              source_name: `Sentinel: ${sentinel.data?.name ?? sentinelId}`,
              title,
              url: typeof payload.url === "string" && payload.url.trim() ? payload.url : `sentinel://${sentinelId}`,
              summary: typeof payload.summary === "string" ? payload.summary.slice(0, 2000) : null,
              category: "sentinel",
              relevance: 50,
              routed_to: targets,
              topic: "project-operations",
              evidence_class: "sentinel-report",
              evidence_strength: 40,
            })
            .select("id")
            .single();
          if (!finding.error) {
            const feeds = await supabaseAdmin
              .from("razul_agent_feeds")
              .select("agent")
              .in("agent", targets)
              .eq("alerts_enabled", true);
            if (!feeds.error && feeds.data.length) {
              await supabaseAdmin.from("razul_alert_events").insert(
                feeds.data.map((f) => ({ finding_id: finding.data.id, agent: f.agent, relevance: 50 })) as never,
              );
            }
          }
        }
        return Response.json({ accepted: true, id: inserted.data.id, routedTo: targets });
      },
    },
  },
});
