export type GateStatus = "PASS" | "FAIL" | "NOT IMPLEMENTED" | "UNVERIFIED";
export type LaunchGate = {
  id: string;
  capability: string;
  owner: string;
  status: GateStatus;
  evidence: string;
  next: string;
  gating: boolean;
  demoOnly: boolean;
};
export const launchEvidence: LaunchGate[] = [
  {
    id: "account-foundation-ordered-2026-10-22",
    capability: "Ordered completion · account recovery and session foundation",
    owner: "Lovable implementation / founder acceptance",
    status: "UNVERIFIED",
    evidence:
      "22 Oct 23:48 UTC: canonical fifteen-step item register adopted without another general approval or new release. Full suite: 914 tests / 54 files passed; 25 focused account/permission tests passed. Real temporary-account journey passed twice: login/logout/new-login saved-project readback, explicit session refresh and hard reload, account-switch separation, generated recovery challenge/session, reload, mobile password update and fresh new-password login. Recovery identity is validated before enabling submission; URL/storage flags alone are not authority. QA accounts and records removed. Earlier failed recovery-readback attempt is not counted as a pass.",
    next: "Step 2 is not complete: real signup/reset inbox delivery, Google/Lovable broker OAuth, automatic long-lived renewal and embedded blocked-storage flows remain unverified; generic account settings/persisted signup-consent scope needs definition. Generated test recovery is not email delivery. No profile table, auth-setting change, provider connection, public deploy or Notion update performed.",
    gating: true,
    demoOnly: false,
  },
  {
    id: "reconciliation-2026-10-22",
    capability: "Blueprint reconciliation and private-preview regressions",
    owner: "Engineering + QA",
    status: "PASS",
    evidence:
      "22 Oct: recovered the final blueprint from chat and retained all three parts. Full app suite: 902 tests passed. Repeated hosted checks: 25 project/agent/access-audit, 37 private-media, 38 social/review/stop, 31 Forge and 48 Creator/Distro; 27 new knowledge-reader/lease/guard checks. Real browser brief access, citations, persisted history, mobile and sign-out verified with temporary approved QA; accounts/files removed. No provider posting, purchase, installation or publication.",
    next: "This records bounded preview evidence, not approval for launch, trusted signing, live telemetry or external integrations. Other gates remain open.",
    gating: false,
    demoOnly: false,
  },
  {
    id: "knowledge-2026-10-22",
    capability: "Daily knowledge collection and persisted attempts",
    owner: "Knowledge engineering + founder",
    status: "UNVERIFIED",
    evidence:
      "22 Oct: seven actual persisted runs; 88 unique stored items and one existing 19-citation brief. Fresh authenticated preview attempt: 70 fetched, 16 new, 54 duplicates, then two repeat attempts with zero new and 70 duplicates each. Token-owned lease, reader-only grants, durable pre-provider guard, confirmed singleton writes and failure-path refusal/credit/access stops tested; failed stop/result writes cannot automatically replay across dates. Final preview runs: 70 fetched/2 new/68 duplicates, then 70/0/70. No new AI brief was generated today because the existing brief was correctly reused.",
    next: "The active 06:00 UTC schedule targets the published app, not this preview. Nothing redeployed. After separately authorized release, verify request-bound background execution and scheduled persisted run; 202 is only acceptance. Long AI work may exceed the bounded attempt and needs a supported durable execution path. Owner confirmation is required to clear stored AI pauses.",
    gating: true,
    demoOnly: false,
  },
  {
    id: "social-developer",
    capability: "Social Autopilot preparation + developer readiness",
    owner: "Founder / integration engineering + security QA",
    status: "UNVERIFIED",
    evidence:
      "21 Oct: 854 app tests and 38 retained authenticated planning checks passed; 23 account-isolation regressions repeated. Private owner/project social save, readback, reload, exact human review, edit invalidation, single/all stop, UTC intentions in non-UTC browser, safe JSON and developer proposal exports verified. Cross-owner, anonymous, stale versions, direct state forgery, null approval/action and mistyped consent blocked; null review also checked on a valid draft. Mobile/desktop and zero runtime errors verified; temporary accounts/records removed. No social/developer API calls, jobs, receipts, account permissions or production/domain changes.",
    next: "Per-user GitHub, LinkedIn, GitLab and Notion client lookup found none. Workspace admin must configure and link an offline-enabled client before encrypted per-user connection storage, verified consent/disconnect/expiry and one owner-authorized account/content test. Select exact repository and read-only scope before real developer workflow. No active scheduler/autopilot, quotas, retries, provider media QA, signing, CI or deploy. CyberLink Social is excluded. Human approvals, rights/privacy/security review and core launch limits remain required.",
    gating: true,
    demoOnly: false,
  },
  {
    id: "post-edit-operations",
    capability: "Post-edit choices + review-only OMNI operations",
    owner: "Media / integration engineering + security QA",
    status: "UNVERIFIED",
    evidence:
      "21 Oct: 828 app tests, 48 authenticated Creator/Distro/operations checks and repeated 31 Forge/privacy checks passed. Real downloaded enhanced WAV format/clipping/digest checked before exact-asset draft prefills; date intention persisted, no scheduler. Filmhub ZIP explicitly incomplete/no receipt. Mail/upgrade JSON exports verified without account/send/rules, source fetch, branch/tests/signature/deploy. Mobile and zero runtime errors; QA data removed. No provider or production/domain calls.",
    next: "Per-user Gmail/Outlook client lookup found none: workspace admin must configure offline-enabled OAuth before consent, encrypted keys, readback/disconnect/expiry checks. Adaptive monitoring/branches/tests/signing/staged canary/rollback require authorized repository/infrastructure and owner approval. YouTube needs authorized eligible channel and video, not WAV; Filmhub/VEVO/Vydia handoffs require account/assets/rights review and verified capabilities. No silent posts or self-approved upgrades; core launch/security/limits remain blockers.",
    gating: true,
    demoOnly: false,
  },
  {
    id: "creator-distro",
    capability: "Creator Universe + manual RSS Distro",
    owner: "Creator engineering + security QA",
    status: "UNVERIFIED",
    evidence:
      "21 Oct: 800 app tests and 40 authenticated Creator/Distro checks passed: immutable private canon/release save-readback, exact-version human export consent and owned-site declaration, parsed downloaded RSS/WAV/canon ZIP, exact WAV byte length/hash, identical repeated bundles, game metadata-only ZIP, partial-URL typing, pause/revoke/withdrawn-approval/cross-owner/anonymous refusal, retained media, version audit and desktop/mobile. Repeated 31 Forge, 37 private-media and 23 account-isolation regressions passed. Temporary QA data removed. No model/provider/publishing calls.",
    next: "Choose an owned host/channel and authorize its supported user-scoped connection, formats, host verification and first release; independent privacy/rights/security review and durable request limits first. RSS is a manual bundle with a declared unverified destination, not live hosting. Other channels are metadata/canon exports only. Podcast/Game plans confer no recording/transcription/game-build authority. No schedule, autopublish, receipts, signed CLI or domain/deployment change.",
    gating: true,
    demoOnly: false,
  },
  {
    id: "forge",
    capability: "OMNI FORGE private radio + web drafts",
    owner: "Media engineering + security QA",
    status: "UNVERIFIED",
    evidence:
      "21 Oct: 30 retained Forge unit/handler tests, 31 authenticated Forge/privacy checks passed, plus repeated 37 media and 23 project-isolation checks. Real manual silence/tone/cut/crossfade/mono PCM; exact downloaded silence samples verified. Static one-page website edited, saved, restored, exported and reloaded. Desktop/mobile/long-text previews checked, zero runtime errors. Current export review/access revalidated, cached withdrawn review rejected. Immutable owner-project versions, private shared WAV references, digest-bound self-reviews and metadata audit. Temporary accounts/files removed; no AI calls, publication or domain changes.",
    next: "Independent privacy/rights/security review, durable request/spend limits and named media beta approval before wider access. No FFmpeg, LUFS/true peak, generated stems/video, imported brand images, multi-page builder, GitHub staging/deployment or released Forge CLI. Separate processing/upload/checkpoint operations are not atomic jobs; failed cleanup may leave an owner-recoverable reservation. Owner review is not a security restriction on existing private-library access, rights proof, signature or publication approval.",
    gating: true,
    demoOnly: false,
  },
  {
    id: "quantum",
    capability: "Quantum Studio private WAV beta",
    owner: "Media engineering + security QA",
    status: "UNVERIFIED",
    evidence:
      "21 Oct: real authenticated synthetic-tone upload, -3 dB WAV version, A/B, exact downloaded samples, reload, clipping rejection, original recovery, owner deletion, signed-out protection and mobile passed with zero page errors. 37 hosted privacy checks passed, including metadata-orphan prevention; 25 audio/consent tests retained within 743 passing app tests. Private bucket: WAV MIME, 4 MiB, eight immutable assets/account. Separate media approval defaults off; QA accounts/files removed. No model gets audio.",
    next: "Approve named media beta users only after independent privacy/security review and durable request/spend limits. PCM gain is not FFmpeg, denoise, LUFS/mastering, professional QA or rights verification. Film, cartoons, books, media adapters and studio CLI remain planned. No publication or domain changes.",
    gating: true,
    demoOnly: false,
  },
  {
    id: "schema",
    capability: "Hosted schema audit",
    owner: "Engineering",
    status: "PASS",
    evidence:
      "21 Oct 2026: initial audit found one application table and zero accounts. Four owner-scoped beta tables added. Live tests exposed inherited broad grants; explicit revokes now restrict approval and audit. Latest ACL read confirms narrow grants; existing demos remain separate.",
    next: "Re-run the retained hosted-isolation test after every permission migration.",
    gating: true,
    demoOnly: false,
  },
  {
    id: "auth",
    capability: "Signup / login / logout / renewal",
    owner: "Engineering + QA",
    status: "UNVERIFIED",
    evidence:
      "21 Oct: real browser email login, private project/agent save and readback, hard refresh, pause, signout/Back and second-account isolation passed. Hosted confirmation on and anonymous auth off. Signup delivery, recovery, OAuth and long-lived token renewal still unverified.",
    next: "Owner completes confirmation email, reset-link and Google/Lovable flows; test token renewal and cross-tab identity changes.",
    gating: true,
    demoOnly: false,
  },
  {
    id: "isolation",
    capability: "Project / agent row isolation",
    owner: "Security QA",
    status: "PASS",
    evidence:
      "21 Oct: 23 retained real two-account checks passed: other-owner reads/updates/deletes empty, owner spoof/cross-project attachment denied, verified status and absent consent rejected, self AI approval denied, audit forging denied, anonymous/forged bearer access denied. Browser B also never showed A records. QA accounts removed.",
    next: "Repeat retained adversarial checks with each permission change. Declarations do not verify external agent identity.",
    gating: true,
    demoOnly: false,
  },
  {
    id: "omni",
    capability: "Authorized OMNI inference",
    owner: "AI engineering",
    status: "UNVERIFIED",
    evidence:
      "21 Oct 04:27 UTC: real authenticated browser request completed with 173 input / 107 output / 280 returned tokens. Retained server tests verify early text streaming, exact usage, ownership/revocation gates and persisted terminal denials with synthetic upstream responses. QA approval revoked/accounts removed. No tools.",
    next: "Verify live streamed timing and Stop before full PASS; synthetic tests do not prove upstream delivery or cancellation. Broader access blocked by rate/spend limits.",
    gating: true,
    demoOnly: false,
  },
  {
    id: "github",
    capability: "One selected GitHub workflow",
    owner: "Founder + integration QA",
    status: "NOT IMPLEMENTED",
    evidence:
      "No accessible GitHub app connection in this session. No repository selected. No API reads, branches, PRs, tests or edits claimed.",
    next: "Founder connects GitHub and identifies exact repository and permitted scope. Review read-only discovery first, then approve a test-branch/PR change and rollback.",
    gating: true,
    demoOnly: false,
  },
  {
    id: "privacy",
    capability: "Guardian session / input / secrets",
    owner: "Security QA",
    status: "UNVERIFIED",
    evidence:
      "Verified bearer and default-deny AI approval added; bounded JSON reads, strict inputs and credential/email patterns. Models have no tools. Pattern checks are incomplete privacy detection, not a guarantee.",
    next: "Run forged/expired/anonymous, oversized JSON, missing consent and sensitive-pattern cases. Independently review key isolation and pause limitations.",
    gating: true,
    demoOnly: false,
  },
  {
    id: "rate",
    capability: "Request / concurrency / spend limits",
    owner: "Founder + platform",
    status: "NOT IMPLEMENTED",
    evidence:
      "No standard backend rate limiter. No ad-hoc limit added without approval. Output budgets are not request/spend limits. Account AI approval defaults off.",
    next: "Approve the custom-limiter tradeoff, choose quotas/budgets and verify shared durable enforcement before allowing beta users AI access.",
    gating: true,
    demoOnly: false,
  },
  {
    id: "cost",
    capability: "Actual token / charge evidence",
    owner: "AI engineering + owner",
    status: "UNVERIFIED",
    evidence:
      "Live request returned 280 total tokens in UI. Exact workspace charge remains unknown, not zero/free. Offline estimator separately compares user-entered rates: test assumptions produce USD 12 vs USD 4/month, not measured savings. Failed/stopped requests may cost credits.",
    next: "Reconcile live token evidence with workspace billing and approve quotas/tariff; estimator assumptions do not establish current provider pricing.",
    gating: true,
    demoOnly: false,
  },
  {
    id: "mobile",
    capability: "Mobile / accessibility beta flow",
    owner: "QA",
    status: "UNVERIFIED",
    evidence:
      "21 Oct: desktop 1280px and mobile 390px estimator/export and local-discovery reference checked; authenticated private beta and Launch Control show no horizontal overflow. Real login/save/reload/logout flow passed with zero page errors.",
    next: "Complete keyboard/screen-reader and mobile sign-up/recovery/OMNI Stop checks before full accessibility PASS.",
    gating: true,
    demoOnly: false,
  },
  {
    id: "audit",
    capability: "Private audit / restore / incident response",
    owner: "Security + operations",
    status: "UNVERIFIED",
    evidence:
      "Live project/agent creates generated audit metadata. Cross-owner reads empty; authenticated insert/update forging denied after grant correction. No signed audit, backup restore drill or incident response rehearsal established.",
    next: "Restore a controlled backup and document incident owner/escalation; metadata audit is not independent proof or a complete response plan.",
    gating: true,
    demoOnly: false,
  },
  {
    id: "cli",
    capability: "Signed desktop CLI distribution",
    owner: "Release engineering",
    status: "NOT IMPLEMENTED",
    evidence:
      "Offline source checks exist. No signed released installer, package identity, hosted download or trusted distribution exists.",
    next: "Select repository/license, signing credentials, native QA and release approval. CLI remains outside this web beta.",
    gating: false,
    demoOnly: false,
  },
  {
    id: "later",
    capability: "Existing extended Mothership modules",
    owner: "Roadmap",
    status: "NOT IMPLEMENTED",
    evidence:
      "Entertainment, robotics, device enrollment, release signing, Commons/Pulse shared collaboration and media publishing remain demonstrations or plans, not secure beta workflows.",
    next: "Frozen backlog. Preserve demos; do not claim real integrations or expand before core gates close.",
    gating: false,
    demoOnly: true,
  },
  {
    id: "visibility",
    capability: "Existing public deployment",
    owner: "Founder",
    status: "FAIL",
    evidence:
      "Hosted publication settings read on 21 Oct 2026: already published and public. Private-access request failed because saved audience is not individually named. No new deployment performed.",
    next: "In Publish, change audience to individually named invitees and set private, or unpublish the existing site. Current build must not be released while gates remain open.",
    gating: true,
    demoOnly: false,
  },
  {
    id: "approval",
    capability: "Founder launch approval",
    owner: "Founder",
    status: "NOT IMPLEMENTED",
    evidence:
      "No beta launch approval. This turn does not publish or deploy. Prior statements that the site was unpublished were contradicted by hosted settings.",
    next: "Resolve current public visibility, review complete end-to-end evidence and explicitly approve limited invite-only launch only after blocking gates pass.",
    gating: true,
    demoOnly: false,
  },
];
export const canLaunch = (gates: LaunchGate[]) =>
  gates.filter((g) => g.gating).every((g) => g.status === "PASS");
