package companion

import (
	"fmt"
	"io"
)

// Legal commands read only the existing project binding. No case-file reads,
// writes, arbitrary arguments, models, network, credentials or transmission.
type LegalChecklistItem struct {
	Rule          string `json:"rule"`
	Requirement   string `json:"requirement"`
	Source        string `json:"source_url"`
	Jurisdiction  string `json:"jurisdiction"`
	Retrieved     string `json:"retrieved_at"`
	EffectiveNote string `json:"effective_date_note"`
	State         string `json:"state"`
}

type LegalReport struct {
	Mode         string               `json:"mode"`
	Jurisdiction string               `json:"jurisdiction"`
	State        string               `json:"preparation_state"`
	Transmission string               `json:"transmission"`
	Deadlines    string               `json:"deadlines"`
	CaseAccess   string               `json:"case_access"`
	UI           string               `json:"ui_path"`
	Checklist    []LegalChecklistItem `json:"checklist"`
	Limits       string               `json:"limits"`
}

func legalReport(jurisdiction string) LegalReport {
	items := []LegalChecklistItem{}
	if jurisdiction == "federal" {
		for _, item := range []struct{ rule, requirement string }{
			{"FRCP 5.2", "Human privacy/redaction review; identifiers, minors, exceptions and court orders"},
			{"FRCP 10", "Exact court, caption/file number/designation and numbered paragraphs"},
			{"FRCP 11", "Responsible human signature and reasonable factual/legal inquiry; no signing by Omni"},
		} {
			items = append(items, LegalChecklistItem{item.rule, item.requirement,
				"https://www.uscourts.gov/sites/default/files/document/federal-rules-of-civil-procedure.pdf",
				"US federal district court civil", "2026-10-25",
				"Official compilation effective December 1, 2025; rule-specific effective date UNVERIFIED",
				"UNRESOLVED - synthetic preparation only"})
		}
		items = append(items, LegalChecklistItem{"Local rules", "Verify exact court local rules, standing orders, format and filing procedure",
			"https://www.uscourts.gov/forms-rules/current-rules-practice-procedure", "US federal courts", "2026-10-25",
			"Chosen court rules and their effective dates UNVERIFIED", "UNRESOLVED"})
	}
	return LegalReport{"OFFLINE READ-ONLY SYNTHETIC REFERENCE", jurisdiction, "draft",
		"BLOCKED - authenticated court integration, explicit confirmation and authentic provider/court evidence required",
		"UNVERIFIED - no deadline calculated or service performed",
		"REAL CASE FILES BLOCKED - no private case vault, contents read, upload, credentials or case logs",
		"/omni-legal", items,
		"Not legal advice or automatic compliance. Dated sources, not live research. State/local adapters unavailable; federal rules not applied to them. Local project binding is not authenticated owner/case access. Browser state is separate; no Desktop folder created. No signature, payment, submission or acceptance."}
}

func runLegal(args []string, out, errOut io.Writer) int {
	f, pos, ok := flags(args, map[string]bool{"--project": true, "--jurisdiction": true})
	if !ok || len(pos) != 1 || (pos[0] != "status" && pos[0] != "checklist") || f["--project"] == "" {
		return invalid(errOut)
	}
	for key := range f {
		if key != "--project" && key != "--jurisdiction" && key != "--json" {
			return invalid(errOut)
		}
	}
	jurisdiction := f["--jurisdiction"]
	if jurisdiction == "" {
		jurisdiction = "federal"
	}
	if jurisdiction != "federal" && jurisdiction != "state" && jurisdiction != "local" {
		return invalid(errOut)
	}
	if _, err := LoadProject(f["--project"]); err != nil {
		fmt.Fprintln(errOut, "Legal reference blocked: select a valid existing local project. No case content read or operation performed.")
		return 1
	}
	r := legalReport(jurisdiction)
	text := fmt.Sprintf("%s\nJurisdiction: %s; preparation: %s\nCourt transmission: %s\nDeadlines: %s\nCase access: %s\nUI: %s\n%s", r.Mode, r.Jurisdiction, r.State, r.Transmission, r.Deadlines, r.CaseAccess, r.UI, r.Limits)
	for _, item := range r.Checklist {
		text += fmt.Sprintf("\n%s - %s\n%s\nRetrieved: %s; %s; %s", item.Rule, item.Requirement, item.Source, item.Retrieved, item.EffectiveNote, item.State)
	}
	return emit(out, f["--json"] == "1", r, text)
}
