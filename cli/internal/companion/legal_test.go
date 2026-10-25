package companion

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestLegalProjectBoundReadOnlyAliases(t *testing.T) {
	dir := t.TempDir()
	if _, err := UseProject("synthetic-legal", dir, true); err != nil { t.Fatal(err) }
	before, err := os.ReadFile(profilePath(dir)); if err != nil { t.Fatal(err) }
	for _, invoked := range []string{"evolution", "omni"} {
		args := []string{"legal", "checklist", "--project", dir, "--jurisdiction", "federal", "--json"}
		if invoked == "evolution" { args = append([]string{"omni"}, args...) }
		var out, errOut bytes.Buffer
		if Run(args, invoked, &out, &errOut) != 0 { t.Fatal(errOut.String()) }
		var r LegalReport
		if json.Unmarshal(out.Bytes(), &r) != nil || r.State != "draft" || len(r.Checklist) != 4 || !strings.HasPrefix(r.Transmission, "BLOCKED") || !strings.HasPrefix(r.Deadlines, "UNVERIFIED") { t.Fatal(out.String()) }
		if strings.Contains(out.String(), dir) || strings.Contains(out.String(), "synthetic-legal") { t.Fatal("project paths/names leaked to legal output") }
	}
	after, err := os.ReadFile(profilePath(dir)); if err != nil || !bytes.Equal(before, after) { t.Fatal("profile changed") }
	entries, err := os.ReadDir(filepath.Join(dir, ".evolution")); if err != nil || len(entries) != 2 { t.Fatal("legal command mutated project") }
}

func TestLegalNoFederalChecklistForStateLocal(t *testing.T) {
	dir := t.TempDir(); if _, err := UseProject("synthetic", dir, true); err != nil { t.Fatal(err) }
	for _, jurisdiction := range []string{"state", "local"} {
		var out, errOut bytes.Buffer
		if Run([]string{"omni", "legal", "status", "--project", dir, "--jurisdiction", jurisdiction, "--json"}, "evolution", &out, &errOut) != 0 { t.Fatal(errOut.String()) }
		var r LegalReport; if json.Unmarshal(out.Bytes(), &r) != nil || len(r.Checklist) != 0 || r.Jurisdiction != jurisdiction { t.Fatal(out.String()) }
	}
}

func TestLegalDeniesMissingForgedAndSymlinkProject(t *testing.T) {
	dir := t.TempDir(); if _, err := UseProject("synthetic", dir, true); err != nil { t.Fatal(err) }
	if err := os.WriteFile(profilePath(dir), []byte(`{"name":"synthetic","root":"/different","sandbox":"local"}`), 0600); err != nil { t.Fatal(err) }
	for _, root := range []string{t.TempDir(), dir} {
		var out, errOut bytes.Buffer
		if Run([]string{"omni", "legal", "status", "--project", root}, "evolution", &out, &errOut) != 1 || out.Len() != 0 { t.Fatal("invalid binding accepted") }
	}
	link := filepath.Join(t.TempDir(), "link"); if err := os.Symlink(dir, link); err != nil { t.Skip("symlink unavailable") }
	var out, errOut bytes.Buffer
	if Run([]string{"omni", "legal", "status", "--project", link}, "evolution", &out, &errOut) != 1 { t.Fatal("symlink accepted") }
}

func TestLegalTransmissionAndSensitiveArgumentsDenied(t *testing.T) {
	for _, args := range [][]string{
		{"submit", "--token", "sensitive-fixture"}, {"status", "--project", "sensitive-fixture", "--approve"},
		{"status", "--project", "sensitive-fixture", "--file", "sensitive-fixture"},
		{"status", "--project", "sensitive-fixture", "--jurisdiction", "sensitive-fixture"},
		{"accepted", "sensitive-fixture"}, {"checklist", "--project", "sensitive-fixture", "--json", "--json"},
	} {
		var out, errOut bytes.Buffer
		if Run(append([]string{"omni", "legal"}, args...), "evolution", &out, &errOut) != 2 { t.Fatal("unsafe command accepted") }
		if strings.Contains(out.String()+errOut.String(), "sensitive-fixture") { t.Fatal("input echoed") }
	}
}