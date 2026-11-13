import { useCallback, useEffect, useRef, useState } from "react";

// Optional read-aloud using the browser's built-in speech voice. Nothing is
// recorded or uploaded by this app; the browser may use its own voice service.
// The browser voice does not expose its audio, so the orb pulses on word
// timing events rather than true audio levels.

export interface SpeakOptions {
  onWord?: () => void;
}

function synth(): SpeechSynthesis | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  return typeof SpeechSynthesisUtterance === "undefined" ? null : window.speechSynthesis;
}

export function useSpeechOutput() {
  const [supported, setSupported] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const active = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    setSupported(synth() !== null);
    return () => {
      active.current = null;
      synth()?.cancel();
    };
  }, []);

  const cancel = useCallback(() => {
    active.current = null;
    synth()?.cancel();
    setSpeaking(false);
  }, []);

  const speak = useCallback((text: string, options: SpeakOptions = {}) => {
    const s = synth();
    if (!s || !text.trim()) return false;
    s.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = typeof navigator !== "undefined" ? navigator.language : "en";
    utterance.rate = 1;
    utterance.onstart = () => {
      if (active.current === utterance) setSpeaking(true);
    };
    utterance.onboundary = () => {
      if (active.current === utterance) options.onWord?.();
    };
    const finish = () => {
      if (active.current !== utterance) return;
      active.current = null;
      setSpeaking(false);
    };
    utterance.onend = finish;
    utterance.onerror = finish;
    active.current = utterance;
    setSpeaking(true);
    s.speak(utterance);
    return true;
  }, []);

  return { supported, speaking, speak, cancel };
}
