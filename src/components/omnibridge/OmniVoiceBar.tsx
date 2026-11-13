import { Mic, MicOff, Volume2, VolumeX, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { VOICE_AGENTS, voiceAgent, type VoiceAgentId } from "@/lib/omni-voice";

interface OmniVoiceBarProps {
  agentId: VoiceAgentId;
  onAgentChange: (id: VoiceAgentId) => void;
  busy: boolean;
  dictationSupported: boolean;
  listening: boolean;
  onToggleMic: () => void;
  voiceSupported: boolean;
  voiceOn: boolean;
  onToggleVoice: () => void;
  speaking: boolean;
  onStopSpeaking: () => void;
}

/** Agent switcher plus microphone / voice-reply controls under the orb. */
export function OmniVoiceBar(p: OmniVoiceBarProps) {
  const agent = voiceAgent(p.agentId);
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <div role="radiogroup" aria-label="Speaking agent" className="flex flex-wrap justify-center gap-1">
        {VOICE_AGENTS.map((a) => (
          <Button
            key={a.id}
            type="button"
            role="radio"
            aria-checked={a.id === p.agentId}
            variant={a.id === p.agentId ? "secondary" : "ghost"}
            size="sm"
            disabled={p.busy}
            onClick={() => a.id !== p.agentId && p.onAgentChange(a.id)}
          >
            {a.name}
            <span className="text-[10px] text-muted-foreground">
              {a.chatPath ? "· this page" : "· not connected"}
            </span>
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button
          type="button"
          variant={p.listening ? "secondary" : "outline"}
          size="sm"
          aria-pressed={p.listening}
          disabled={!p.dictationSupported || p.busy || !agent.chatPath}
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
      {agent.unavailableReason ? (
        <p role="status" className="max-w-xl text-center text-xs leading-6 text-warning">
          {agent.unavailableReason}
        </p>
      ) : (
        <p className="max-w-xl text-center text-[11px] leading-5 text-muted-foreground">
          Speaking with {agent.name} on {agent.site}. Spoken words appear in the message box for
          your review and are never sent automatically. Voice replies use your browser's built-in
          voice; your browser may process audio with its own service.
        </p>
      )}
    </div>
  );
}
