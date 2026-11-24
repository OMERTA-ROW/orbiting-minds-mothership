#!/usr/bin/env bash
set -euo pipefail

APPLY=false
case "${1:-}" in
  "") ;;
  --apply) APPLY=true ;;
  *) printf 'Usage: %s [--apply]\n' "$0" >&2; exit 2 ;;
esac

if [[ "$#" -gt 1 ]]; then
  printf 'Usage: %s [--apply]\n' "$0" >&2
  exit 2
fi

SCRIPT_DIR="$(cd -- "${BASH_SOURCE[0]%/*}" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
HOST_NAME="$(hostname)"
SUMMARY=()
UNITS_CHANGED=false

print_summary() {
  printf '\nSummary (%s mode, host %s):\n' "$([[ "$APPLY" == true ]] && printf apply || printf dry-run)" "$HOST_NAME"
  if [[ "${#SUMMARY[@]}" -eq 0 ]]; then
    printf '  No actions recorded.\n'
    return
  fi
  local item
  for item in "${SUMMARY[@]}"; do
    printf '  - %s\n' "$item"
  done
}
trap print_summary EXIT

if [[ "$APPLY" == true ]]; then
  if [[ "$HOST_NAME" != "Omni-Staging" ]]; then
    printf 'Refusing --apply on host %s; the only permitted host is Omni-Staging.\n' "$HOST_NAME" >&2
    exit 1
  fi
  if [[ "$EUID" -ne 0 ]]; then
    printf 'Refusing --apply: root privileges are required.\n' >&2
    exit 1
  fi
  printf 'Apply mode on approved staging host %s.\n' "$HOST_NAME"
else
  printf 'Dry-run on host %s; no changes will be made.\n' "$HOST_NAME"
fi

record_already_present() {
  local description="$1"
  printf 'already present: %s\n' "$description"
  SUMMARY+=("already present: $description")
}

perform() {
  local description="$1"
  shift
  if [[ "$APPLY" == true ]]; then
    printf 'ACTION: %s\n' "$description"
    "$@"
  else
    printf 'PLAN: %s\n  ' "$description"
    printf '%q ' "$@"
    printf '\n'
  fi
  SUMMARY+=("$description")
}

ensure_worker() {
  local username="$1"
  local entry uid home shell

  if entry="$(getent passwd "$username")"; then
    IFS=: read -r _ _ uid _ _ home shell <<< "$entry"
    if [[ "$home" != "/nonexistent" || "$shell" != "/usr/sbin/nologin" ]]; then
      if [[ "$home" != "/nonexistent" && -e "$home" ]]; then
        printf 'Refusing to change %s: its current home directory exists at %s.\n' "$username" "$home" >&2
        return 1
      fi
      perform "set $username to no-home, no-login account settings" \
        usermod --home /nonexistent --shell /usr/sbin/nologin "$username"
    else
      record_already_present "system user $username (uid $uid, no home, no login shell)"
    fi
  else
    perform "create system user $username with a distinct UID, no home and no login shell" \
      useradd --system --user-group --no-create-home --home-dir /nonexistent \
        --shell /usr/sbin/nologin "$username"
  fi
}

worker_one="$(getent passwd omni-worker-1 || true)"
worker_two="$(getent passwd omni-worker-2 || true)"
if [[ -n "$worker_one" && -n "$worker_two" ]]; then
  IFS=: read -r _ _ worker_one_uid _ _ _ _ <<< "$worker_one"
  IFS=: read -r _ _ worker_two_uid _ _ _ _ <<< "$worker_two"
  if [[ "$worker_one_uid" == "$worker_two_uid" ]]; then
    printf 'Refusing: omni-worker-1 and omni-worker-2 share UID %s.\n' "$worker_one_uid" >&2
    exit 1
  fi
fi

ensure_worker omni-worker-1
ensure_worker omni-worker-2

worker_one="$(getent passwd omni-worker-1 || true)"
worker_two="$(getent passwd omni-worker-2 || true)"
if [[ -n "$worker_one" && -n "$worker_two" ]]; then
  IFS=: read -r _ _ worker_one_uid _ _ _ _ <<< "$worker_one"
  IFS=: read -r _ _ worker_two_uid _ _ _ _ <<< "$worker_two"
  record_already_present "worker UIDs are distinct ($worker_one_uid and $worker_two_uid)"
elif [[ "$APPLY" == false ]]; then
  printf 'PLAN: useradd will allocate distinct system UIDs for the two worker accounts.\n'
  SUMMARY+=("allocate distinct system UIDs for both worker accounts")
fi

workspace_path=/opt/omni-workspace
if [[ -L "$workspace_path" ]]; then
  printf 'Refusing: %s is a symlink.\n' "$workspace_path" >&2
  exit 1
fi
if [[ -d "$workspace_path" ]] \
  && [[ "$(stat -c '%u:%g:%a' -- "$workspace_path")" == "0:0:755" ]]; then
  record_already_present "$workspace_path directory"
else
  perform "ensure root-owned $workspace_path with permissions 0755, not writable by workers" \
    install -d -o root -g root -m 0755 "$workspace_path"
fi

unit_destination=/etc/systemd/system
for unit_source in "$REPO_ROOT"/services/omni-sandbox/systemd/*; do
  [[ -f "$unit_source" ]] || continue
  unit_name="${unit_source##*/}"
  unit_target="$unit_destination/$unit_name"
  if [[ -L "$unit_target" ]]; then
    printf 'Refusing to replace symlinked unit target %s.\n' "$unit_target" >&2
    exit 1
  fi
  if [[ -f "$unit_target" ]] \
    && cmp -s "$unit_source" "$unit_target" \
    && [[ "$(stat -c '%u:%g:%a' -- "$unit_target")" == "0:0:644" ]]; then
    record_already_present "systemd unit $unit_target"
    continue
  fi
  perform "install $unit_name as root-owned systemd unit without enabling or starting it" \
    install -o root -g root -m 0644 "$unit_source" "$unit_target"
  UNITS_CHANGED=true
done

if [[ "$UNITS_CHANGED" == true ]]; then
  perform 'reload systemd unit definitions' systemctl daemon-reload
else
  record_already_present 'installed systemd unit definitions'
fi

profile_path=/etc/apparmor.d/omni-bubblewrap
if [[ -L "$profile_path" ]]; then
  printf 'Refusing to replace symlinked AppArmor profile target %s.\n' "$profile_path" >&2
  exit 1
fi
profile_content=$(cat <<'PROFILE'
#include <tunables/global>

profile omni-workspace-bubblewrap /usr/bin/bwrap flags=(attach_disconnected,mediate_deleted) {
  #include <abstractions/base>

  / r,
  /usr/bin/bwrap mr,
  capability net_admin,
  capability setpcap,
  capability sys_ptrace,

  deny /proc/sys/** w,
  deny /proc/kcore r,
  deny /proc/kallsyms r,
  deny /dev/mem r,
  deny /dev/kmem r,
  deny /sys/** w,
}
PROFILE
)

if [[ "$APPLY" == true ]]; then
  profile_temp="$(mktemp)"
  trap 'rm -f "$profile_temp"; print_summary' EXIT
  printf '%s\n' "$profile_content" > "$profile_temp"
  chmod 0644 "$profile_temp"
  if [[ -f "$profile_path" ]] \
    && cmp -s "$profile_temp" "$profile_path" \
    && [[ "$(stat -c '%u:%g:%a' -- "$profile_path")" == "0:0:644" ]]; then
    record_already_present "AppArmor profile $profile_path"
    rm -f "$profile_temp"
    profile_temp=''
  else
    printf 'ACTION: install root-owned AppArmor profile %s\n' "$profile_path"
    install -o root -g root -m 0644 "$profile_temp" "$profile_path"
    SUMMARY+=("install AppArmor profile $profile_path")
    rm -f "$profile_temp"
    profile_temp=''
  fi
else
  printf 'PLAN: install root-owned AppArmor profile %s (mode 0644)\n' "$profile_path"
  SUMMARY+=("install AppArmor profile $profile_path")
fi

perform "load the per-service bubblewrap AppArmor profile from $profile_path" \
  apparmor_parser -r "$profile_path"
