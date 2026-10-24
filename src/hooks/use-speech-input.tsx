import { useCallback, useEffect, useRef, useState } from "react";

// Opt-in browser speech recognition for dictating text the user reviews
// before sending. No audio is stored by this app; recognition is performed
// by the browser (and may use the browser vendor's service). Typed input
// always remains available and nothing is ever sent automatically.

export type SpeechState = "unsupported" | "idle" | "listening" | "error";

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

export function speechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function useSpeechInput(onTranscript: (text: string) => void) {
  const [supported] = useState(() => speechRecognitionCtor() !== null);
  const [state, setState] = useState<SpeechState>(supported ? "idle" : "unsupported");
  const [error, setError] = useState("");
  const recognition = useRef<SpeechRecognitionLike | null>(null);
  const callback = useRef(onTranscript);
  callback.current = onTranscript;

  const stop = useCallback(() => {
    recognition.current?.stop();
  }, []);

  const start = useCallback(() => {
    const Ctor = speechRecognitionCtor();
    if (!Ctor || recognition.current) return;
    const rec = new Ctor();
    rec.lang = typeof navigator !== "undefined" ? navigator.language : "en";
    rec.interimResults = false;
    rec.continuous = false;
    rec.onresult = (event) => {
      let finalText = "";
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (result?.isFinal && result[0]) finalText += result[0].transcript;
      }
      if (finalText.trim()) callback.current(finalText.trim());
    };
    rec.onerror = (event) => {
      setState("error");
      setError(event.error === "not-allowed" ? "Microphone permission was declined. Typed input still works." : "Dictation stopped. Typed input still works.");
      recognition.current = null;
    };
    rec.onend = () => {
      recognition.current = null;
      setState((s) => (s === "listening" ? "idle" : s));
    };
    try {
      rec.start();
      recognition.current = rec;
      setError("");
      setState("listening");
    } catch {
      setState("error");
      setError("Dictation could not start. Typed input still works.");
    }
  }, []);

  useEffect(() => () => recognition.current?.abort(), []);

  return { supported, state, error, listening: state === "listening", start, stop };
}
