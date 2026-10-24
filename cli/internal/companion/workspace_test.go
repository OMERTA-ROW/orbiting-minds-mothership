package companion

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// isolateConfig points the per-user config directory at a temp dir so tests
// never touch the real saved workspace choice.
func isolateConfig(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	t.Setenv("XDG_CONFIG_HOME", dir)
	t.Setenv("APPDATA", dir)
	t.Setenv("HOME", dir)
	return dir
}

func TestWorkspaceInitPersistsDefaultAndCustom(t *testing.T) {
	home := isolateConfig(t)
	if _, err := InitWorkspace("", false); err == nil {
		t.Fatal("approval required")
	}
	c, err := InitWorkspace("", true)
	if err != nil {
		t.Fatal(err)
	}
	want := filepath.Join(home, "Desktop", "Omni Projects")
	if c.WorkspaceDir != want || c.Source != "default-desktop" {
		t.Fatalf("unexpected default workspace %+v", c)
	}
	if info, err := os.Stat(want); err != nil || !info.IsDir() {
		t.Fatal("default workspace folder was not created")
	}
	got, err := loadWorkspace()
	if err != nil || got.WorkspaceDir != want {
		t.Fatalf("workspace choice did not persist: %+v %v", got, err)
	}
	if _, err := InitWorkspace("", true); err == nil {
		t.Fatal("second init must not overwrite the saved choice")
	}
}

func TestWorkspacePrefersExistingRedirectedDesktop(t *testing.T) {
	home := isolateConfig(t)
	redirected := filepath.Join(home, "OneDrive", "Desktop")
	if err := os.MkdirAll(redirected, 0o755); err != nil {
		t.Fatal(err)
	}
	got, err := DefaultWorkspaceDir()
	if err != nil {
		t.Fatal(err)
	}
	if got != filepath.Join(redirected, "Omni Projects") {
		t.Fatalf("redirected Desktop not honored: %s", got)
	}
}

func TestWorkspaceRejectsRelativeAndSymlinkPaths(t *testing.T) {
	home := isolateConfig(t)
	if _, err := InitWorkspace("relative/path", true); err == nil {
		t.Fatal("relative workspace path accepted")
	}
	outside := t.TempDir()
	link := filepath.Join(home, "linked")
	if err := os.Symlink(outside, link); err != nil {
		t.Skip("symlinks unavailable")
	}
	if _, err := InitWorkspace(link, true); err == nil {
		t.Fatal("symlink workspace accepted")
	}
}

func TestProjectTemplatesAndConflictHandling(t *testing.T) {
	isolateConfig(t)
	ws, err := InitWorkspace("", true)
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err := NewWorkspaceProject(ws, "anomaly", "game", false); err == nil {
		t.Fatal("approval required")
	}
	p, created, err := NewWorkspaceProject(ws, "anomaly", "game", true)
	if err != nil {
		t.Fatal(err)
	}
	if p.Template != "game" || p.Root != filepath.Join(ws.WorkspaceDir, "anomaly") {
		t.Fatalf("unexpected profile %+v", p)
	}
	for _, folder := range []string{"Code", "Game Assets", "Audio", "Builds", "Exports"} {
		if info, err := os.Stat(filepath.Join(p.Root, folder)); err != nil || !info.IsDir() {
			t.Fatalf("template folder %q missing", folder)
		}
	}
	if len(created) != 6 {
		t.Fatalf("expected root + 5 template folders, got %d", len(created))
	}
	// Reused project-location tracking: the standard loader reads the profile.
	if got, err := LoadProject(p.Root); err != nil || got.Name != "anomaly" || got.Template != "game" {
		t.Fatalf("profile not reloadable: %+v %v", got, err)
	}
	if _, _, err := NewWorkspaceProject(ws, "anomaly", "video", true); err == nil {
		t.Fatal("name collision must be refused without overwriting")
	}
	if _, _, err := NewWorkspaceProject(ws, "../escape", "blank", true); err == nil {
		t.Fatal("path traversal name accepted")
	}
	if _, _, err := NewWorkspaceProject(ws, "doc", "presentation", true); err == nil {
		t.Fatal("unknown template accepted")
	}
	v, _, err := NewWorkspaceProject(ws, "doc", "video", true)
	if err != nil {
		t.Fatal(err)
	}
	for _, folder := range []string{"Footage", "Music", "Edits", "Finished Videos"} {
		if info, err := os.Stat(filepath.Join(v.Root, folder)); err != nil || !info.IsDir() {
			t.Fatalf("video template folder %q missing", folder)
		}
	}
}

func TestWorkspaceSetMoveAndKeep(t *testing.T) {
	isolateConfig(t)
	ws, _ := InitWorkspace("", true)
	p, _, err := NewWorkspaceProject(ws, "anomaly", "game", true)
	if err != nil {
		t.Fatal(err)
	}
	keeper := filepath.Join(p.Root, "Code", "keep.txt")
	if err := os.WriteFile(keeper, []byte("do not lose me"), 0o600); err != nil {
		t.Fatal(err)
	}
	// --keep: projects stay put, config changes.
	newRoot := filepath.Join(t.TempDir(), "New Omni Projects")
	c, moved, err := SetWorkspace(newRoot, "keep", true)
	if err != nil || len(moved) != 0 {
		t.Fatalf("keep mode failed: %+v %v", c, err)
	}
	if _, err := os.Stat(keeper); err != nil {
		t.Fatal("keep mode must not touch existing projects")
	}
	// --move: project relocates with contents, profile root updated.
	p2, _, err := NewWorkspaceProject(c, "doc", "video", true)
	if err != nil {
		t.Fatal(err)
	}
	third := filepath.Join(t.TempDir(), "Third")
	c3, moved, err := SetWorkspace(third, "move", true)
	if err != nil {
		t.Fatal(err)
	}
	if len(moved) != 1 || moved[0] != filepath.Join(third, "doc") {
		t.Fatalf("unexpected move result %v", moved)
	}
	if _, err := os.Stat(p2.Root); !os.IsNotExist(err) {
		t.Fatal("old project location should be gone after move")
	}
	got, err := LoadProject(filepath.Join(c3.WorkspaceDir, "doc"))
	if err != nil || got.Root != filepath.Join(c3.WorkspaceDir, "doc") {
		t.Fatalf("moved profile root not updated: %+v %v", got, err)
	}
	// Collision at destination refuses the whole move before touching anything.
	blocker := filepath.Join(t.TempDir(), "Blocked")
	if err := os.MkdirAll(filepath.Join(blocker, "doc"), 0o755); err != nil {
		t.Fatal(err)
	}
	if _, _, err := SetWorkspace(blocker, "move", true); err == nil {
		t.Fatal("destination collision must refuse the move")
	}
	if _, err := LoadProject(filepath.Join(c3.WorkspaceDir, "doc")); err != nil {
		t.Fatal("refused move must leave projects in place")
	}
}

func TestOpenProjectFolderRequiresApproval(t *testing.T) {
	isolateConfig(t)
	ws, _ := InitWorkspace("", true)
	p, _, err := NewWorkspaceProject(ws, "anomaly", "blank", true)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := OpenProjectFolder(p, false); err == nil {
		t.Fatal("approval required to open a folder")
	}
	if _, err := OpenProjectFolder(p, true); err != nil && !strings.Contains(err.Error(), "no supported folder opener") {
		t.Fatalf("unexpected opener error: %v", err)
	}
}
