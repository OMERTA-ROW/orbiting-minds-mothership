/**
 * Grouped site navigation. Pure data so the header, the home page, the
 * command palette and tests share one list. Only working pages are listed;
 * former demo/sample areas live in `src/lib/retired-areas.ts` and show an
 * honest "not connected" page.
 */

export type NavStatus = "account" | "owner" | "browser" | "ai" | "off" | "guide";

/** Plain-language badge text and tooltip for each status. */
export const NAV_STATUS: Record<NavStatus, { label: string; help: string; tone: string }> = {
  account: {
    label: "Your account",
    help: "Works now. Saved to your signed-in account.",
    tone: "border-success/50 text-success",
  },
  owner: {
    label: "Owner only",
    help: "Only the owner can open this, after entering an authenticator code.",
    tone: "border-gold/60 text-gold-light",
  },
  browser: {
    label: "This browser",
    help: "Works, but is saved only in this browser. Not shared or backed up.",
    tone: "border-primary/50 text-primary",
  },
  ai: {
    label: "AI draft",
    help: "Real AI writes a suggestion. Nothing is run, sent or published.",
    tone: "border-primary/50 text-primary",
  },
  off: {
    label: "Not connected",
    help: "Planned or blocked. It does not work yet.",
    tone: "border-warning/50 text-warning",
  },
  guide: {
    label: "Guide",
    help: "Information and instructions.",
    tone: "border-muted-foreground/40 text-muted-foreground",
  },
};

export const navGroups = [
  {
    id: "projects",
    label: "Projects",
    blurb: "Your private work and drafts.",
    items: [
      {
        to: "/beta",
        label: "My projects",
        status: "account",
        note: "Private projects saved to your account.",
      },
      {
        to: "/quantum-studio",
        label: "Quantum Studio",
        status: "account",
        note: "Private media for approved members.",
      },
      {
        to: "/knowledge-brief",
        label: "Daily Knowledge Brief",
        status: "account",
        note: "For approved readers.",
      },
      {
        to: "/pathway",
        label: "AI Pathway",
        status: "ai",
        note: "Describe an idea; get a written draft plan.",
      },
    ],
  },
  {
    id: "agents",
    label: "Agents",
    blurb: "OMNI and the agents it coordinates.",
    items: [
      {
        to: "/beta-omni",
        label: "OMNI chat",
        status: "account",
        note: "Text chat, after owner approval of AI access.",
      },
      {
        to: "/omni-terminal",
        label: "OMNI Terminal",
        status: "owner",
        note: "Status, held tasks and Emergency Stop. Nothing runs by itself.",
      },
      {
        to: "/omni-razul",
        label: "Observatory & history",
        status: "owner",
        note: "Public-source findings and owner research controls.",
      },
    ],
  },
  {
    id: "mothership",
    label: "Mothership",
    blurb: "Owner-only financial status. No funding or transfers are connected.",
    items: [
      {
        to: "/treasury",
        label: "Treasury",
        status: "owner",
        note: "Read-only OMNI workspace metering; no balances or money movement.",
      },
    ],
  },
  {
    id: "approvals",
    label: "Approvals",
    blurb: "Nothing important happens without you.",
    items: [
      {
        to: "/activation-approvals",
        label: "Activation approvals",
        status: "owner",
        note: "Records your decisions. Never switches anything on.",
      },
    ],
  },
  {
    id: "connections",
    label: "Connections",
    blurb: "Devices, keys and outside services.",
    items: [
      {
        to: "/omni-dock",
        label: "Docking Bay (devices)",
        status: "owner",
        note: "Pair a desktop or phone app. No device paired yet.",
      },
      {
        to: "/omni-api-keys",
        label: "Owner dashboard & API keys",
        status: "owner",
        note: "Connection status, shortcuts and API keys (shown once).",
      },
      {
        to: "/omni-gateway",
        label: "Coding gateway",
        status: "off",
        note: "Blocked until approved and verified.",
      },
      {
        to: "/platform",
        label: "Evolution CLI",
        status: "off",
        note: "Planned terminal companion.",
      },
    ],
  },
  {
    id: "settings",
    label: "Settings",
    blurb: "Sign-in, security and members.",
    items: [
      {
        to: "/sign-in-help",
        label: "How to sign in",
        status: "guide",
        note: "Step-by-step sign-in, two-factor and recovery.",
      },
      {
        to: "/account-security",
        label: "Account security",
        status: "account",
        note: "Optional two-step sign-in with an authenticator app, plus recovery codes.",
      },
      {
        to: "/members",
        label: "Members & invitations",
        status: "owner",
        note: "Invite people with single-use links.",
      },
      {
        to: "/launch-control",
        label: "Launch readiness",
        status: "guide",
        note: "Dated checks. Not a launch approval.",
      },
    ],
  },
] as const satisfies readonly {
  id: string;
  label: string;
  blurb: string;
  items: readonly { to: string; label: string; status: NavStatus; note: string }[];
}[];

/** Flat list (Home and groups) for the command palette and tests. */
export const navItems = [
  { to: "/", label: "Home" },
  ...navGroups.flatMap((g) => g.items.map(({ to, label }) => ({ to, label }))),
] as const;
