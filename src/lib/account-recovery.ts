// This user-bound marker restores recovery presentation only. It cannot authorize
// password changes: Cloud validates the actual session on updateUser.
export const RECOVERY_HINT_KEY = "evolution-password-recovery";
export type RecoveryStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function readRecoveryHint(
  storage: RecoveryStorage,
  validatedUserId: string | null,
): string | null {
  if (!validatedUserId) return null;
  try {
    return storage.getItem(RECOVERY_HINT_KEY) === validatedUserId ? validatedUserId : null;
  } catch {
    return null;
  }
}
export function rememberRecoveryHint(storage: RecoveryStorage, userId: string | null): void {
  try {
    if (userId) storage.setItem(RECOVERY_HINT_KEY, userId);
    else storage.removeItem(RECOVERY_HINT_KEY);
  } catch {
    /* The current validated recovery event still works without storage. */
  }
}
