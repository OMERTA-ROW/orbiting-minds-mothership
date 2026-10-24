package companion

import (
	"fmt"
	"io"
	"strings"
)

func runWorkspace(args []string, out, errOut io.Writer) int {
	f, pos, ok := flags(args, map[string]bool{"--dir": true})
	if !ok || len(pos) != 1 {
		return invalid(errOut)
	}
	switch pos[0] {
	case "init":
		c, err := InitWorkspace(f["--dir"], f["--approve"] == "1")
		if err != nil {
			fmt.Fprintln(errOut, "Workspace not configured:", err)
			return 1
		}
		text := fmt.Sprintf("Workspace ready at %s (%s).\nThis folder is on THIS machine only; the browser app cannot create or see it.\nNext: evolution project new <name> --template game|video|blank --approve", c.WorkspaceDir, c.Source)
		return emit(out, f["--json"] == "1", c, text)
	case "status":
		c, err := loadWorkspace()
		if err != nil {
			fmt.Fprintln(errOut, err)
			return 1
		}
		projects, err := ListWorkspaceProjects(c)
		if err != nil {
			fmt.Fprintln(errOut, err)
			return 1
		}
		type status struct {
			Workspace WorkspaceConfig   `json:"workspace"`
			Projects  []ProjectProfile  `json:"projects"`
		}
		text := fmt.Sprintf("Workspace: %s (%s)\nProjects: %d", c.WorkspaceDir, c.Source, len(projects))
		for _, p := range projects {
			text += fmt.Sprintf("\n  %s · %s · template %s · outputs saved under %s", p.Name, p.Root, templateLabel(p.Template), p.Root)
		}
		if len(projects) == 0 {
			text += "\n  none yet — evolution project new <name> --template game|video|blank --approve"
		}
		return emit(out, f["--json"] == "1", status{c, projects}, text)
	case "set":
		mode := ""
		if f["--move"] == "1" {
			mode = "move"
		}
		if f["--keep"] == "1" {
			if mode != "" {
				return invalid(errOut)
			}
			mode = "keep"
		}
		c, moved, err := SetWorkspace(f["--dir"], mode, f["--approve"] == "1")
		if err != nil {
			fmt.Fprintln(errOut, "Workspace not changed:", err)
			if len(moved) > 0 {
				fmt.Fprintf(errOut, "Already moved before the stop: %s\n", strings.Join(moved, ", "))
			}
			return 1
		}
		text := fmt.Sprintf("Workspace now %s.", c.WorkspaceDir)
		if mode == "move" {
			text += fmt.Sprintf(" Moved %d project(s): %s", len(moved), strings.Join(moved, ", "))
		} else {
			text += " Existing projects kept at their original locations."
		}
		return emit(out, f["--json"] == "1", c, text)
	}
	return invalid(errOut)
}

func templateLabel(t string) string {
	if t == "" {
		return "none (pre-existing folder)"
	}
	return t
}
