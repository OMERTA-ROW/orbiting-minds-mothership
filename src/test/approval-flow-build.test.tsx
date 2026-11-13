import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  APPROVAL_FLOW_SCHEMA,
  APPROVAL_FLOW_VERSION,
  buildNotice,
  compareLive,
  markerBody,
  parseMarker,
  siteKind,
} from "@/lib/approval-flow-build";

const marker = (version: number) => JSON.stringify({ schema: APPROVAL_FLOW_SCHEMA, version });

describe("site labels", () => {
  it("labels the published addresses as live", () => {
    expect(siteKind("evoomni.tech")).toBe("live");
    expect(siteKind("www.evoomni.tech")).toBe("live");
    expect(siteKind("orbiting-minds-mothership.lovable.app")).toBe("live");
  });
  it("labels the preview address as preview, and others honestly", () => {
    expect(siteKind("id-preview--f02f1b04-6f4d-4d33-bd52-d2d44971db21.lovable.app")).toBe("preview");
    expect(siteKind("localhost")).toBe("local");
    expect(siteKind("evoomni.tech.example.com")).toBe("other");
  });
});

describe("live flow comparison", () => {
  it("treats the current live 404 page (no marker) as an outdated flow", () => {
    expect(compareLive({ status: 404, body: "<!DOCTYPE html>" })).toEqual({ state: "outdated", version: null });
  });
  it("treats an older marker as outdated and the same marker as current", () => {
    expect(compareLive({ status: 200, body: marker(1) }, 2)).toEqual({ state: "outdated", version: 1 });
    expect(compareLive({ status: 200, body: marker(2) }, 2)).toEqual({ state: "current", version: 2 });
    expect(compareLive({ status: 200, body: marker(3) }, 2)).toEqual({ state: "newer", version: 3 });
  });
  it("never guesses when the live site cannot be reached or redirects", () => {
    expect(compareLive(null).state).toBe("unreachable");
    expect(compareLive({ status: 503, body: "" }).state).toBe("unreachable");
    expect(compareLive({ status: 302, body: "" }).state).toBe("unreachable");
  });
  it("accepts only the exact marker shape", () => {
    expect(parseMarker(JSON.stringify(markerBody()))).toBe(APPROVAL_FLOW_VERSION);
    expect(parseMarker(JSON.stringify({ schema: "other", version: 2 }))).toBeNull();
    expect(parseMarker(JSON.stringify({ schema: APPROVAL_FLOW_SCHEMA, version: "2" }))).toBeNull();
    expect(parseMarker("x".repeat(5000))).toBeNull();
  });
});

describe("build notice", () => {
  it("warns on the preview when the live page uses an outdated flow", () => {
    const n = buildNotice({ site: "preview", serverVersion: 2, live: { state: "outdated", version: null }, clientVersion: 2 });
    expect(n.tone).toBe("warn");
    expect(n.title).toBe("The live page uses an outdated approval flow");
  });
  it("tells a stale open page to reload when its server is newer", () => {
    const n = buildNotice({ site: "live", serverVersion: 3, live: { state: "current", version: 3 }, clientVersion: 2 });
    expect(n.reload).toBe(true);
  });
  it("does not warn when the live site matches", () => {
    expect(buildNotice({ site: "preview", serverVersion: 2, live: { state: "current", version: 2 }, clientVersion: 2 }).tone).toBe("ok");
    expect(buildNotice({ site: "live", serverVersion: 2, live: { state: "current", version: 2 }, clientVersion: 2 }).tone).toBe("ok");
  });
  it("does not claim a match when the live site could not be checked", () => {
    expect(buildNotice({ site: "preview", serverVersion: 2, live: { state: "unreachable", version: null }, clientVersion: 2 }).tone).toBe("info");
  });
});

const read = vi.hoisted(() => vi.fn());
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => read }));
vi.mock("@/lib/approval-flow-build.functions", () => ({ getApprovalFlowBuild: "read" }));

import { ApprovalBuildBanner } from "@/components/omnibridge/ApprovalBuildBanner";

describe("ApprovalBuildBanner", () => {
  beforeEach(() => read.mockReset());
  it("shows a build label and the outdated-live warning", async () => {
    read.mockResolvedValue({ serverVersion: APPROVAL_FLOW_VERSION, live: { state: "outdated", version: null } });
    render(<ApprovalBuildBanner />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/earlier screen/);
    expect(screen.getByText(`Approval flow v${APPROVAL_FLOW_VERSION}`)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /outdated approval flow/ })).toBeInTheDocument();
  });
  it("offers a reload when this open page is older than its server", async () => {
    read.mockResolvedValue({ serverVersion: APPROVAL_FLOW_VERSION + 1, live: { state: "current", version: APPROVAL_FLOW_VERSION + 1 } });
    render(<ApprovalBuildBanner />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Reload page" })).toBeInTheDocument());
  });
});
