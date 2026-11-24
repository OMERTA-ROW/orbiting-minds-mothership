/**
 * Types for database functions defined in staged migrations (0057–0059) that are not installed in
 * the live database yet, so the generated types do not list them. Calling one before its migration
 * is installed returns an error, and every caller treats that error as a refusal (fails closed).
 * Remove an entry once the generated types include it.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";

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
    Returns: Json;
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
  // Migration 0075 (pending): Claude for the terminal agent and Fusion. Service-only; callers fail closed.
  claude_reserve_agent_run: {
    Args: { _run_id: string; _model: string; _input_chars: number; _max_output_tokens: number };
    Returns: Json;
  };
  claude_reserve_fusion_turn: {
    Args: { _turn_id: string; _input_chars: number; _max_output_tokens: number };
    Returns: Json;
  };
  claude_settle_source: {
    Args: {
      _source: string;
      _run_id: string;
      _status: string;
      _input_tokens: number | null;
      _output_tokens: number | null;
    };
    Returns: Json;
  };
  omni_noop_enqueue: { Args: { _duration_ms: number }; Returns: string };
  omni_native_authorization_ready: { Args: never; Returns: boolean };
  omni_native_chat_ready: { Args: never; Returns: boolean };
  omni_native_device_status: {
    Args: { _device: string; _fingerprint: string; _nonce: string; _timestamp_ms: number };
    Returns: Json;
  };
  omni_native_authorize: {
    Args: {
      _client_id: string;
      _audience: string;
      _port: number;
      _code_hash: string;
      _code_challenge: string;
      _proof_nonce_hash: string;
      _proof_timestamp_ms: number;
      _public_key: Json;
      _fingerprint: string;
      _label: string;
      _platform: string;
      _permissions: string[];
      _rotation_device: string | null;
    };
    Returns: Json;
  };
  omni_native_exchange: {
    Args: {
      _code_hash: string;
      _code_challenge: string;
      _client_id: string;
      _audience: string;
      _port: number;
    };
    Returns: Json;
  };
};

type Pub = Database["public"];
export type StagedDatabase = Omit<Database, "public"> & {
  public: Omit<Pub, "Functions"> & { Functions: Pub["Functions"] & StagedFunctions };
};

/** Same client, typed to also accept the staged functions above. */
export function staged(
  client: Pick<SupabaseClient<Database>, "rpc">,
): SupabaseClient<StagedDatabase> {
  return client as unknown as SupabaseClient<StagedDatabase>;
}
