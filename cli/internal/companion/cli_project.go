package companion

import (
	"encoding/json"
	"fmt"
	"io"
	"strconv"
	"time"
)

// flags parses --key value / --flag pairs; returns positional args.
func flags(args []string, valued map[string]bool) (map[string]string, []string, bool) {
	f, pos := map[string]string{}, []string{}
	for i := 0; i < len(args); i++ {
		a := args[i]
		if len(a) > 2 && a[:2] == "--" {
			if _, dup := f[a]; dup {
				return nil, nil, false
			}
			if valued[a] {
				if i+1 >= len(args) {
					return nil, nil, false
				}
				i++
				f[a] = args[i]
			} else if a == "--approve" || a == "--json" {
				f[a] = "1"
			} else {
				return nil, nil, false
			}
		} else {
			pos = append(pos, a)
		}
	}
	return f, pos, true
}

func emit(out io.Writer, asJSON bool, v any, text string) int {
	if asJSON {
		if json.NewEncoder(out).Encode(v) != nil {
			return 1
		}
		return 0
	}
	fmt.Fprintln(out, text)
	return 0
}

func runProject(args []string, out, errOut io.Writer) int {
	f, pos, ok := flags(args, map[string]bool{"--dir": true, "--project": true})
	if !ok || len(pos) < 1 {
		return invalid(errOut)
	}
	switch pos[0] {
	case "use":
		if len(pos) != 2 {
			return invalid(errOut)
		}
		p, err := UseProject(pos[1], f["--dir"], f["--approve"] == "1")
		if err != nil {
			fmt.Fprintln(errOut, "Project not set:", err)
			return 1
		}
		fmt.Fprintf(out, "Project %q targeted at %s (sandbox: local). Profile written to .evolution/project.json only.\n", p.Name, p.Root)
		return 0
	case "show":
		p, err := LoadProject(f["--project"])
		if err != nil {
			fmt.Fprintln(errOut, err)
			return 1
		}
		return emit(out, f["--json"] == "1", p, fmt.Sprintf("Project %s · root %s · sandbox %s", p.Name, p.Root, p.Sandbox))
	}
	return invalid(errOut)
}

func runSandboxCmd(args []string, out, errOut io.Writer) int {
	f, pos, ok := flags(args, map[string]bool{"--project": true, "--timeout": true})
	if !ok || len(pos) != 2 || pos[0] != "run" {
		return invalid(errOut)
	}
	timeout := 300
	if v, has := f["--timeout"]; has {
		n, err := strconv.Atoi(v)
		if err != nil || n < 5 || n > 1800 {
			return invalid(errOut)
		}
		timeout = n
	}
	p, err := LoadProject(f["--project"])
	if err != nil {
		fmt.Fprintln(errOut, err)
		return 1
	}
	rec, err := RunSandbox(p, pos[1], f["--approve"] == "1", time.Duration(timeout)*time.Second, out)
	if err != nil {
		fmt.Fprintln(errOut, "Sandbox run blocked:", err)
		return 1
	}
	fmt.Fprintf(out, "\n[EVOLUTION] %s %s in %.1fs (exit %d) · log %s\n", rec.Task, rec.Result, rec.Seconds, rec.ExitCode, rec.LogFile)
	if rec.Result != "PASSED" {
		return 3
	}
	return 0
}

func runRoute(args []string, out, errOut io.Writer) int {
	f, pos, ok := flags(args, map[string]bool{"--project": true})
	if !ok || len(pos) != 1 {
		return invalid(errOut)
	}
	p, err := LoadProject(f["--project"])
	if err != nil {
		fmt.Fprintln(errOut, err)
		return 1
	}
	r, err := RouteGoal(p, pos[0])
	if err != nil {
		fmt.Fprintln(errOut, err)
		return 1
	}
	return emit(out, f["--json"] == "1", r, fmt.Sprintf("OMNI ROUTE · project %s\nGoal: %s\nRoles: %v\nSandbox: %s\nSuggested tasks: %v\nModel: %s\nNext: %s", r.Project, r.Goal, r.Roles, r.Sandbox, r.Tasks, r.Model, r.Approval))
}

func runRelease(args []string, out, errOut io.Writer) int {
	f, pos, ok := flags(args, map[string]bool{"--dir": true})
	if !ok || len(pos) != 1 || pos[0] != "verify" {
		return invalid(errOut)
	}
	r, err := VerifyRelease(f["--dir"])
	if err != nil {
		fmt.Fprintln(errOut, "Verify blocked:", err)
		return 1
	}
	code := emit(out, f["--json"] == "1", r, fmt.Sprintf("Files: %d · hash errors: %v\nSignatures: %s\nVerdict: %s", r.Files, r.HashErrors, r.Signed, r.Verdict))
	if r.Verdict[:6] == "REJECT" {
		return 3
	}
	return code
}
