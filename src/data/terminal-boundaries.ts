export const terminalBoundaries = [
  {
    name: "EVOLUTION local companion",
    location: "Offline cli/ source",
    status: "PARTIAL LOCAL ENFORCEMENT",
    access:
      "Fixed tasks and project binding; selected-project read-only reports/dry-run. No account/device enrollment, server capabilities or request limiter.",
  },
  {
    name: "Private beta OMNI",
    location: "/beta-omni · /api/omni",
    status: "AUTHENTICATED INFERENCE ONLY",
    access:
      "Session, account approval and owned-project checks; no shell, device access or maintenance tools.",
  },
  {
    name: "AI Pathway",
    location: "/pathway · /api/evolution-pathway",
    status: "AUTHENTICATED DRAFTING ONLY",
    access: "Approved bounded requests; generated text has no execution or cleanup authority.",
  },
  {
    name: "Sandbox Lab / dashboard terminal",
    location: "/sandbox · /dashboard",
    status: "DEMO",
    access: "Scripted local browser samples, no process or device execution.",
  },
  {
    name: "Public OMNI / OmniBridge / Nexus",
    location: "/omni · /omnibridge · /command-nexus",
    status: "DEMO / REFERENCE",
    access: "Local conversations, plans and drafts; no connected terminal or system access.",
  },
  {
    name: "CARE / Pilot / Updates / Voice",
    location: "/care · /care-agent · /pilot · /updates · /voice",
    status: "DEMO / UNSHIPPED NATIVE REFERENCE",
    access: "No OS storage, scanner, updater or enrolled companion connection.",
  },
  {
    name: "Guardian / Devices / Fleet",
    location: "/guardian · /devices · /fleet · /security-report",
    status: "DEMO + OFFLINE EVIDENCE VIEW",
    access:
      "Browser pauses affect local demo records only. Imported CLI evidence never grants permissions or remote stop.",
  },
] as const;

export const maintenanceCommands = [
  {
    command: "evolution device identity",
    state: "READ-ONLY",
    detail: "Local invocation label only, no hardware identifier or enrolled identity.",
  },
  {
    command: "evolution device permissions",
    state: "READ-ONLY",
    detail: "Reports no enrolled scopes; no self-granted cleanup or remote access.",
  },
  {
    command: "evolution storage report --project <dir> --json",
    state: "LOCAL LINUX SOURCE",
    detail:
      "Metadata only, 5,000 entries / 10 seconds. Exclusions and partial status; free filesystem bytes, not predicted savings.",
  },
  {
    command: "evolution storage plan --project <dir> --categories cache,temp --json",
    state: "DRY-RUN ONLY",
    detail:
      "Exact project .evolution/cache and .evolution/tmp targets, 256 MiB maximum, excludes recent files; 10-minute plan fingerprint. Nothing moved or deleted.",
  },
  {
    command:
      "evolution storage apply --project <dir> --device local --plan <json> --confirm <sha256> --approve",
    state: "BLOCKED AFTER REVALIDATION",
    detail:
      "Exact confirmation, path and stale-plan checks; authenticated enrollment/capabilities and safe trash/recovery still absent.",
  },
  {
    command: "evolution malware availability",
    state: "READ-ONLY",
    detail:
      "Supported installed scanner filename/permission lookup only. No scan or version process started.",
  },
  {
    command: "evolution malware scan --project <dir> --device local",
    state: "BLOCKED",
    detail:
      "No enrolled scan capability or verified real scanner here. Fixed-argument adapter tested with disposable process fixtures only.",
  },
  {
    command: "evolution malware status",
    state: "NOT SCANNED",
    detail: "No invented health score, clean label or last-scan success.",
  },
  {
    command: "evolution operation status / cancel",
    state: "UNSUPPORTED SERVICE",
    detail: "No background/remote operation receipt; foreground Ctrl-C is local only.",
  },
  {
    command: "evolution terminal security",
    state: "PARTIAL ENFORCEMENT",
    detail:
      "Names actual local controls and missing server auth, device capabilities, revocation and rate limits.",
  },
] as const;
