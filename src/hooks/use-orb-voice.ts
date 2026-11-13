import { useCallback, useRef, useState } from "react";
import { useSpeechInput } from "@/hooks/use-speech-input";
import { useSpeechOutput } from "@/hooks/use-speech-output";
import { useMicLevel } from "@/hooks/use-mic-level";

/**
 * Browser dictation + browser read-aloud + orb level, bundled for an orb.
 * Voice replies start muted; `say` is silent while muted.
 */
export function useOrbVoice(onTranscript: (text: string) => void) {
  const speech = useSpeechInput(onTranscript);
  const output = useSpeechOutput();
  const level = useRef(0);
  useMicLevel(speech.listening, level);
  const [voiceOn, setVoiceOn] = useState(false);
  const voiceOnRef = useRef(false);
  voiceOnRef.current = voiceOn;
  const { speak, cancel } = output;

  const say = useCallback(
    (line: string) => {
      if (!voiceOnRef.current) return;
      speak(line, {
        onWord: () => {
          level.current = Math.min(1, level.current + 0.4);
        },
      });
    },
    [speak],
  );

  const toggleVoice = useCallback(
    (introWhenTurningOn: string) => {
      if (voiceOnRef.current) {
        cancel();
        voiceOnRef.current = false;
        setVoiceOn(false);
        return;
      }
      voiceOnRef.current = true;
      setVoiceOn(true);
      say(introWhenTurningOn);
    },
    [cancel, say],
  );

  return { speech, output, level, voiceOn, say, toggleVoice };
}
