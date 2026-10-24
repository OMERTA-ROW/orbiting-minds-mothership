import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { speechRecognitionCtor, useSpeechInput } from "@/hooks/use-speech-input";

class FakeRecognition {
  static instances: FakeRecognition[] = [];
  lang = "";
  interimResults = true;
  continuous = true;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null = null;
  onerror: ((e: { error?: string }) => void) | null = null;
  onend: (() => void) | null = null;
  started = false;
  stopped = false;
  aborted = false;
  constructor() {
    FakeRecognition.instances.push(this);
  }
  start() {
    this.started = true;
  }
  stop() {
    this.stopped = true;
    this.onend?.();
  }
  abort() {
    this.aborted = true;
  }
  emitFinal(text: string) {
    this.onresult?.({ results: [{ 0: { transcript: text }, isFinal: true, length: 1 } as never] });
  }
}

describe("useSpeechInput", () => {
  afterEach(() => {
    FakeRecognition.instances = [];
    delete (window as Record<string, unknown>).SpeechRecognition;
    delete (window as Record<string, unknown>).webkitSpeechRecognition;
    vi.unstubAllGlobals();
  });

  it("reports unsupported when no browser recognition exists", () => {
    const h = renderHook(() => useSpeechInput(vi.fn()));
    expect(h.result.current.supported).toBe(false);
    expect(h.result.current.state).toBe("unsupported");
    h.unmount();
  });

  it("dictates final transcripts into the callback without sending anything", () => {
    (window as Record<string, unknown>).SpeechRecognition = FakeRecognition;
    const onTranscript = vi.fn();
    const h = renderHook(() => useSpeechInput(onTranscript));
    expect(h.result.current.supported).toBe(true);
    act(() => h.result.current.start());
    expect(h.result.current.listening).toBe(true);
    const rec = FakeRecognition.instances[0];
    expect(rec.started).toBe(true);
    act(() => rec.emitFinal("  review the sandbox plan  "));
    expect(onTranscript).toHaveBeenCalledWith("review the sandbox plan");
    act(() => h.result.current.stop());
    expect(rec.stopped).toBe(true);
    expect(h.result.current.state).toBe("idle");
    h.unmount();
  });

  it("surfaces declined microphone permission honestly", () => {
    (window as Record<string, unknown>).SpeechRecognition = FakeRecognition;
    const h = renderHook(() => useSpeechInput(vi.fn()));
    act(() => h.result.current.start());
    act(() => FakeRecognition.instances[0].onerror?.({ error: "not-allowed" }));
    expect(h.result.current.state).toBe("error");
    expect(h.result.current.error).toContain("permission");
    h.unmount();
  });

  it("aborts recognition on unmount", () => {
    (window as Record<string, unknown>).SpeechRecognition = FakeRecognition;
    const h = renderHook(() => useSpeechInput(vi.fn()));
    act(() => h.result.current.start());
    h.unmount();
    expect(FakeRecognition.instances[0].aborted).toBe(true);
  });

  it("detects the webkit-prefixed constructor", () => {
    (window as Record<string, unknown>).webkitSpeechRecognition = FakeRecognition;
    expect(speechRecognitionCtor()).toBe(FakeRecognition);
  });
});
