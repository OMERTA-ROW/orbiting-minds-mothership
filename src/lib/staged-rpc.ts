/**
 * Types for database functions defined in staged migrations (0057–0059) that are not installed in
 * the live database yet, so the generated types do not list them. Calling one before its migration
 * is installed returns an error, and every caller treats that error as a refusal (fails closed).
 * Remove an entry once the generated types include it.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type StagedFunctions = {
  activation_attempt_outcome: {
    Args: { _kind: string; _attempt: string };
    Returns: string;
  };
  activation_rollback_confirmed: {
    Args: { _kind: string; _attempt: string };
    Returns: undefined;
  };
  omni_stop_pending: { Args: never; Returns: number | null };
  omni_stop_delivered: { Args: { _revision: number }; Returns: undefined };
  omni_execution_permit_live: { Args: { _job: string }; Returns: boolean };
  omni_noop_sweep: { Args: never; Returns: number };
  omni_noop_worker_action: {
    Args: { _hash: string; _op: string; _job?: string };
    Returns: Database["public"]["Tables"] extends never ? never : import("./types-json").Json;
  };
  omni_noop_workers_list: {
    Args: never;
    Returns: {
      id: string;
      name: string;
      created_at: string;
      expires_at: string;
      revoked_at: string | null;
    }[];
  };
  omni_noop_jobs_list: {
    Args: never;
    Returns: {
      id: string;
      worker_id: string | null;
      status: string;
      created_at: string;
      started_at: string | null;
      ended_at: string | null;
      reason: string | null;
    }[];
  };
  omni_noop_worker_create: {
    Args: { _name: string; _hash: string; _hours: number };
    Returns: string;
  };
  omni_noop_worker_revoke: { Args: { _id: string }; Returns: undefined };
  omni_noop_enqueue: { Args: { _duration_ms: number }; Returns: string };
};

type Pub = Database["public"];
export type StagedDatabase = Omit<Database, "public"> & {
  public: Omit<Pub, "Functions"> & { Functions: Pub["Functions"] & StagedFunctions };
};

/** Same client, typed to also accept the staged functions above. */
export function staged(client: Pick<SupabaseClient<Database>, "rpc">): SupabaseClient<StagedDatabase> {
  return client as unknown as SupabaseClient<StagedDatabase>;
}
