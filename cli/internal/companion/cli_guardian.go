package companion

import (
	"fmt"
	"io"
	"strings"
)

func runGuardian(args []string, out, errOut io.Writer) int {
	f, pos, ok := flags(args, map[string]bool{"--project": true})
	if !ok || len(pos) != 1 || pos[0] != "audit" || f["--approve"] != "" {
		return invalid(errOut)
	}
	p, err := LoadProject(f["--project"])
	if err != nil {
		fmt.Fprintln(errOut, "Local evidence unavailable; verify the selected project.")
		return 1
	}
	events, err := SecurityAudit(p)
	if err != nil {
		fmt.Fprintln(errOut, "Local evidence unavailable:", err)
		return 1
	}
	text := "LOCAL SECURITY EVIDENCE — hash chain, not signed or immutable\n"
	for _, e := range events {
		text += fmt.Sprintf("%s · %s · %s · %s\n  %s\n", e.At, e.Severity, e.Rule, e.Action, e.Evidence)
	}
	text += "Owner review: preserve the original chain/head before any repair. No automatic restoration or session revocation."
	return emit(out, f["--json"] == "1", events, strings.TrimSpace(text))
}
