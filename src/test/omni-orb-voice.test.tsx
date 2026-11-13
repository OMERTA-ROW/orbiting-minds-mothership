import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OmniOrb } from "@/components/omnibridge/OmniOrb";
import { OmniVoiceBar } from "@/components/omnibridge/OmniVoiceBar";
import { useSpeechOutput } from "@/hooks/use-speech-output";

const barProps = {
  agentId: "omni" as const,
  onAgentChange: vi.fn(),
  busy: false,
  dictationSupported: true,
  listening: false,
  onToggleMic: vi.fn(),
  voiceSupported: true,
  voiceOn: false,
  onToggleVoice: vi.fn(),
  speaking: false,
  onStopSpeaking: vi.fn(),
};

describe("OmniOrb", () => {
  it("shows the active agent's verified name and truthful state", () => {
    const level = { current: 0 };
    const { rerender } = render(<OmniOrb state="idle" agentName="OMNI" muted level={level} />);
    expect(screen.getByTestId("orb-agent-name").textContent).toBe("OMNI");
    expect(screen.getByTestId("orb-status").textContent).toBe("Ready · voice replies muted");
    rerender(<OmniOrb state="unavailable" agentName="Jackboy" muted={false} level={level} />);
    expect(screen.getByTestId("orb-agent-name").textContent).toBe("Jackboy");
    expect(screen.getByRole("img").getAttribute("data-state")).toBe("unavailable");
    expect(screen.getByTestId("orb-status").textContent).toBe("Not connected here");
  });
});

describe("OmniVoiceBar", () => {
  it("marks Jackboy as not connected and disables the microphone for it", () => {
    render(<OmniVoiceBar {...barProps} agentId="jackboy" />);
    expect(screen.getByRole("radio", { name: /Jackboy/ }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("radio", { name: /Jackboy/ }).textContent).toContain("not connected");
    expect(screen.getByRole("button", { name: /Speak/ })).toBeDisabled();
    expect(screen.getByRole("status").textContent).toContain("OMNI will not answer as Jackboy");
  });
  it("switches agent and toggles mute through callbacks", () => {
    const onAgentChange = vi.fn();
    const onToggleVoice = vi.fn();
    render(<OmniVoiceBar {...barProps} onAgentChange={onAgentChange} onToggleVoice={onToggleVoice} />);
    fireEvent.click(screen.getByRole("radio", { name: /Jackboy/ }));
    expect(onAgentChange).toHaveBeenCalledWith("jackboy");
    fireEvent.click(screen.getByRole("button", { name: /Voice replies muted/ }));
    expect(onToggleVoice).toHaveBeenCalled();
  });
  it("says so plainly when the browser has no microphone or voice support", () => {
    render(<OmniVoiceBar {...barProps} dictationSupported={false} voiceSupported={false} />);
    expect(screen.getByRole("button", { name: /Microphone not supported/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Voice replies not supported/ })).toBeDisabled();
  });
});

describe("useSpeechOutput", () => {
  const win = window as unknown as Record<string, unknown>;
  afterEach(() => {
    delete win["speechSynthesis"];
    delete win["SpeechSynthesisUtterance"];
  });

  it("reports unsupported instead of pretending to speak", () => {
    const { result } = renderHook(() => useSpeechOutput());
    expect(result.current.supported).toBe(false);
    expect(result.current.speak("hello")).toBe(false);
  });

  it("speaks through the browser voice and stops on cancel", () => {
    const spoken: { text: string; onend?: () => void }[] = [];
    win["SpeechSynthesisUtterance"] = class {
      text: string;
      lang = "";
      rate = 1;
      onend?: () => void;
      constructor(t: string) {
        this.text = t;
      }
    };
    const cancel = vi.fn();
    win["speechSynthesis"] = { speak: (u: { text: string }) => spoken.push(u), cancel };
    const { result } = renderHook(() => useSpeechOutput());
    expect(result.current.supported).toBe(true);
    act(() => {
      result.current.speak("You are now speaking with OMNI");
    });
    expect(spoken[0]?.text).toBe("You are now speaking with OMNI");
    expect(result.current.speaking).toBe(true);
    act(() => result.current.cancel());
    expect(result.current.speaking).toBe(false);
    expect(cancel).toHaveBeenCalled();
  });
});
