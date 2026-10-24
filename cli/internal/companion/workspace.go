package companion

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"time"
)

// WorkspaceConfig records the owner's chosen local workspace root. It lives in
// the per-user config directory (never in a project, never in shell startup
// files) and is written only with explicit --approve.
type WorkspaceConfig struct {
	WorkspaceDir string `json:"workspace_dir"`
	Source       string `json:"source"` // "default-desktop" or "custom"
	CreatedAt    string `json:"created_at"`
}

// ProjectTemplates are fixed, reviewable starter folder shapes. Only these
// names are ever created; nothing is downloaded or generated inside them.
var ProjectTemplates = map[string][]string{
	"game":  {"Code", "Game Assets", "Audio", "Builds", "Exports"},
	"video": {"Footage", "Music", "Edits", "Finished Videos"},
	"blank": {},
}

func workspaceConfigPath() (string, error) {
	base, err := os.UserConfigDir()
	if err != nil || base == "" {
		return "", errors.New("per-user config directory is unavailable on this platform")
	}
	return filepath.Join(base, "evolution", "workspace.json"), nil
}

// DefaultWorkspaceDir resolves the owner's real Desktop, accounting for common
// OneDrive redirection, and returns <Desktop>/Omni Projects. A physically
// localized or otherwise redirected Desktop that matches none of the known
// candidates falls back to ~/Desktop; the owner can always pass --dir instead.
func DefaultWorkspaceDir() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil || home == "" {
		return "", errors.New("home directory is unavailable; pass --dir explicitly")
	}
	candidates := []string{filepath.Join(home, "Desktop")}
	if runtime.GOOS == "windows" {
		if profile := os.Getenv("USERPROFILE"); profile != "" {
			candidates = append(candidates, filepath.Join(profile, "Desktop"))
		}
	}
	if matches, _ := filepath.Glob(filepath.Join(home, "OneDrive*", "Desktop")); len(matches) > 0 {
		candidates = append(candidates, matches...)
	}
	desktop := candidates[0]
	for _, c := range candidates {
		if info, err := os.Stat(c); err == nil && info.IsDir() {
			desktop = c
			break
		}
	}
	return filepath.Join(desktop, "Omni Projects"), nil
}

// validateWorkspacePath requires a clean absolute path whose existing
// ancestors are real non-symlink directories; the leaf itself may not exist
// yet (init creates it) but must not be a symlink or file.
func validateWorkspacePath(root string) error {
	if !filepath.IsAbs(root) || filepath.Clean(root) != root {
		return errors.New("workspace path must be a clean absolute path")
	}
	for path := root; ; path = filepath.Dir(path) {
		info, err := os.Lstat(path)
		if err == nil {
			if !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
				return errors.New("workspace path must contain only real non-symlink directories")
			}
		} else if !os.IsNotExist(err) {
			return errors.New("workspace path could not be checked")
		}
		if filepath.Dir(path) == path {
			break
		}
	}
	return nil
}

func loadWorkspace() (WorkspaceConfig, error) {
	var c WorkspaceConfig
	path, err := workspaceConfigPath()
	if err != nil {
		return c, err
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return c, errors.New("no workspace configured; run evolution workspace init first")
	}
	if json.Unmarshal(data, &c) != nil || (c.Source != "default-desktop" && c.Source != "custom") {
		return c, errors.New("workspace configuration is invalid; re-run evolution workspace init")
	}
	if err := validateWorkspacePath(c.WorkspaceDir); err != nil {
		return c, err
	}
	if info, err := os.Stat(c.WorkspaceDir); err != nil || !info.IsDir() {
		return c, errors.New("configured workspace directory no longer exists")
	}
	return c, nil
}

func saveWorkspace(c WorkspaceConfig) error {
	path, err := workspaceConfigPath()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	data, _ := json.MarshalIndent(c, "", "  ")
	return os.WriteFile(path, append(data, '\n'), 0o600)
}

// InitWorkspace creates (or adopts an existing empty/nonexistent) workspace
// directory and persists the choice. It never overwrites an existing config.
func InitWorkspace(dir string, approve bool) (WorkspaceConfig, error) {
	var c WorkspaceConfig
	if !approve {
		return c, errors.New("add --approve to create the workspace folder and save this choice")
	}
	if dir == "" {
		var err error
		if dir, err = DefaultWorkspaceDir(); err != nil {
			return c, err
		}
		c.Source = "default-desktop"
	} else {
		c.Source = "custom"
	}
	dir = filepath.Clean(dir)
	if err := validateWorkspacePath(dir); err != nil {
		return c, err
	}
	if _, err := loadWorkspace(); err == nil {
		return c, errors.New("a workspace is already configured; use evolution workspace set to change it")
	}
	if info, err := os.Lstat(dir); err == nil {
		if !info.IsDir() {
			return c, errors.New("workspace path exists and is not a directory; nothing was changed")
		}
	} else if os.IsNotExist(err) {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return c, err
		}
	} else {
		return c, errors.New("workspace path could not be checked")
	}
	c.WorkspaceDir = dir
	c.CreatedAt = time.Now().UTC().Format(time.RFC3339)
	return c, saveWorkspace(c)
}

// SetWorkspace changes the saved workspace root. mode "move" relocates each
// existing project (same-filesystem rename only); mode "keep" leaves projects
// where they are. Both refuse collisions and never overwrite files.
func SetWorkspace(dir, mode string, approve bool) (WorkspaceConfig, []string, error) {
	var c WorkspaceConfig
	var moved []string
	if !approve {
		return c, nil, errors.New("add --approve to change the saved workspace location")
	}
	if mode != "move" && mode != "keep" {
		return c, nil, errors.New("choose --move (relocate existing projects) or --keep (leave them in place)")
	}
	old, err := loadWorkspace()
	if err != nil {
		return c, nil, err
	}
	dir = filepath.Clean(dir)
	if err := validateWorkspacePath(dir); err != nil {
		return c, nil, err
	}
	if dir == old.WorkspaceDir {
		return c, nil, errors.New("that is already the configured workspace")
	}
	if info, err := os.Lstat(dir); err == nil {
		if !info.IsDir() {
			return c, nil, errors.New("new workspace path exists and is not a directory")
		}
	} else if os.IsNotExist(err) {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return c, nil, err
		}
	} else {
		return c, nil, errors.New("new workspace path could not be checked")
	}
	if mode == "move" {
		projects, err := ListWorkspaceProjects(old)
		if err != nil {
			return c, nil, err
		}
		// Pre-flight every destination before touching anything.
		for _, p := range projects {
			dest := filepath.Join(dir, filepath.Base(p.Root))
			if _, err := os.Lstat(dest); err == nil {
				return c, nil, fmt.Errorf("destination already contains %q; move nothing, resolve the collision first", filepath.Base(p.Root))
			} else if !os.IsNotExist(err) {
				return c, nil, errors.New("destination could not be checked")
			}
		}
		for _, p := range projects {
			dest := filepath.Join(dir, filepath.Base(p.Root))
			if err := os.Rename(p.Root, dest); err != nil {
				return c, moved, fmt.Errorf("move stopped at %q (%v); projects already moved are listed, the rest stayed in place", p.Root, err)
			}
			p.Root = dest
			data, _ := json.MarshalIndent(p, "", "  ")
			if err := os.WriteFile(profilePath(dest), append(data, '\n'), 0o600); err != nil {
				return c, moved, fmt.Errorf("moved %q but its profile could not be updated; fix .evolution/project.json manually", dest)
			}
			moved = append(moved, dest)
		}
	}
	c = WorkspaceConfig{WorkspaceDir: dir, Source: "custom", CreatedAt: time.Now().UTC().Format(time.RFC3339)}
	return c, moved, saveWorkspace(c)
}

// ListWorkspaceProjects returns validated project profiles directly inside the
// workspace root. Anything else (plain folders, files, symlinks) is ignored.
func ListWorkspaceProjects(c WorkspaceConfig) ([]ProjectProfile, error) {
	entries, err := os.ReadDir(c.WorkspaceDir)
	if err != nil {
		return nil, errors.New("workspace directory could not be read")
	}
	projects := []ProjectProfile{}
	for _, e := range entries {
		if !e.IsDir() || e.Type()&os.ModeSymlink != 0 {
			continue
		}
		if p, err := LoadProject(filepath.Join(c.WorkspaceDir, e.Name())); err == nil {
			projects = append(projects, p)
		}
	}
	sort.Slice(projects, func(i, j int) bool { return projects[i].Name < projects[j].Name })
	return projects, nil
}

// NewWorkspaceProject creates a project directory with a fixed template inside
// the configured workspace, then reuses the existing project-location tracking
// (.evolution/project.json). Existing names are refused; nothing is overwritten.
func NewWorkspaceProject(c WorkspaceConfig, name, template string, approve bool) (ProjectProfile, []string, error) {
	var p ProjectProfile
	folders, ok := ProjectTemplates[template]
	if !ok {
		return p, nil, errors.New("unknown template; allowed: game, video, blank")
	}
	if !approve {
		return p, nil, errors.New("add --approve to create this project folder")
	}
	if !projectName.MatchString(name) {
		return p, nil, errors.New("project name must be lowercase letters, numbers or hyphens")
	}
	root := filepath.Join(c.WorkspaceDir, name)
	if !strings.HasPrefix(root, c.WorkspaceDir+string(os.PathSeparator)) {
		return p, nil, errors.New("project path escapes the workspace")
	}
	if err := os.Mkdir(root, 0o755); err != nil {
		if os.IsExist(err) {
			return p, nil, fmt.Errorf("%q already exists in the workspace; nothing was changed", name)
		}
		return p, nil, err
	}
	created := []string{root}
	cleanup := func() {
		for i := len(created) - 1; i >= 0; i-- {
			_ = os.Remove(created[i]) // only removes empty dirs we just made
		}
	}
	for _, folder := range folders {
		sub := filepath.Join(root, folder)
		if err := os.Mkdir(sub, 0o755); err != nil {
			cleanup()
			return p, nil, err
		}
		created = append(created, sub)
	}
	p, err := UseProject(name, root, true)
	if err != nil {
		cleanup()
		return ProjectProfile{}, nil, err
	}
	p.Template = template
	data, _ := json.MarshalIndent(p, "", "  ")
	if err := os.WriteFile(profilePath(root), append(data, '\n'), 0o600); err != nil {
		cleanup()
		return ProjectProfile{}, nil, err
	}
	return p, created, nil
}

// OpenProjectFolder opens the project directory in the platform's file
// manager using a fixed argv (no shell). It requires --approve and reports
// honestly when no supported opener exists.
func OpenProjectFolder(p ProjectProfile, approve bool) (string, error) {
	if !approve {
		return "", errors.New("add --approve to open this folder in your file manager")
	}
	if err := validateProjectRoot(p.Root); err != nil {
		return "", err
	}
	var bin string
	var argv []string
	switch runtime.GOOS {
	case "darwin":
		bin, argv = "open", []string{p.Root}
	case "windows":
		bin, argv = "explorer", []string{p.Root}
	default:
		bin, argv = "xdg-open", []string{p.Root}
	}
	path, err := exec.LookPath(bin)
	if err != nil {
		return "", fmt.Errorf("no supported folder opener (%s) found on this machine; open %s manually", bin, p.Root)
	}
	cmd := exec.Command(path, argv...)
	cmd.Env = minimalEnv()
	if err := cmd.Start(); err != nil {
		return "", fmt.Errorf("folder opener could not start: %v", err)
	}
	go func() { _ = cmd.Wait() }()
	return p.Root, nil
}
