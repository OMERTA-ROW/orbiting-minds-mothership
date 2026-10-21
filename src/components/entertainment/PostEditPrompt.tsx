import { Download, CalendarClock, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PostEditChoice, PostEditOutput } from "@/lib/forge-post-edit";

export function PostEditPrompt({
  output,
  disabled,
  onChoose,
}: {
  output: PostEditOutput;
  disabled: boolean;
  onChoose: (choice: PostEditChoice) => void;
}) {
  return (
    <section
      aria-label="Post-edit release decision"
      className="mt-6 scroll-mt-24 border-y border-gold/40 py-5"
    >
      <p className="eyebrow">Editing complete / bounded WAV QA</p>
      <h3 className="mt-3 text-lg">What comes next for this version?</h3>
      <p className="mt-3 font-mono text-xs leading-6 text-success">
        {output.bytes.toLocaleString()} bytes · {output.seconds.toFixed(2)} s ·{" "}
        {output.channels === 1 ? "mono" : "stereo"} · {output.rate.toLocaleString()} Hz · downloaded
        digest matched
      </p>
      <p className="mt-2 text-xs leading-6 text-muted-foreground">
        Format and sample clipping checked, not LUFS, true peak, rights clearance or channel
        acceptance. No account connected for delivery.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="signal" disabled={disabled} onClick={() => onChoose("now")}>
          <Download size={16} />
          Distribute now
        </Button>
        <Button variant="ghost" disabled={disabled} onClick={() => onChoose("schedule")}>
          <CalendarClock size={16} />
          Schedule
        </Button>
        <Button variant="ghost" disabled={disabled} onClick={() => onChoose("draft")}>
          <Save size={16} />
          Save draft
        </Button>
      </div>
      <p className="mt-3 text-xs leading-6 text-warning">
        Manual release preparation only. Schedule opens a draft for a date intention; saving needs
        confirmation and creates no delivery job. Every release needs fresh rights, metadata, privacy
        and human review.
      </p>
    </section>
  );
}
