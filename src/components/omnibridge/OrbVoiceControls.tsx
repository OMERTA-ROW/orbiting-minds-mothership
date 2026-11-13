import { Mic, MicOff, Square, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface OrbVoiceControlsProps {
  dictationSupported: boolean;
  listening: boolean;
  micDisabled: boolean;
  onToggleMic: () => void;
  voiceSupported: boolean;
  voiceOn: boolean;
  onToggleVoice: () => void;
  speaking: boolean;
  onStopSpeaking: () => void;
}

/** Microphone, mute and stop-speaking buttons shared by every orb. */
export function OrbVoiceControls(p: OrbVoiceControlsProps) {
  return (
    <div className="flex flex-wrap justify-center gap-2">
      <Button
        type="button"
        variant={p.listening ? "secondary" : "outline"}
        size="sm"
        aria-pressed={p.listening}
        disabled={!p.dictationSupported || p.micDisabled}
        onClick={p.onToggleMic}
      >
        {p.listening ? <MicOff size={14} /> : <Mic size={14} />}
        {!p.dictationSupported
          ? "Microphone not supported in this browser"
          : p.listening
            ? "Stop listening"
            : "Speak"}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-pressed={p.voiceOn}
        disabled={!p.voiceSupported}
        onClick={p.onToggleVoice}
      >
        {p.voiceOn ? <Volume2 size={14} /> : <VolumeX size={14} />}
        {!p.voiceSupported
          ? "Voice replies not supported"
          : p.voiceOn
            ? "Voice replies on"
            : "Voice replies muted"}
      </Button>
      {p.speaking && (
        <Button type="button" variant="signal" size="sm" onClick={p.onStopSpeaking}>
          <Square size={14} /> Stop speaking
        </Button>
      )}
    </div>
  );
}
