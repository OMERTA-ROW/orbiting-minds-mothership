package companion

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"sync"
	"time"
)

// ProjectProfile is the explicit, owner-approved target for OMNI routing and local sandbox tasks.
// It is stored only inside the chosen project directory, never in global config or shell files.
type ProjectProfile struct {
	Name      string `json:"name"`
	Root      string `json:"root"`
	Sandbox   string `json:"sandbox"` // "local" only; "cloud" is BLOCKED until a sandbox service exists
	CreatedAt string `json:"created_at"`
}

const profileDir = ".evolution"

var projectName = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{0,62}$`)

// Fixed argv only; no shell, no user-supplied commands.
type sandboxTask struct {
	argv   []string
	marker string
}

var sandboxTasks = map[string]sandboxTask{
	"go-test":  {[]string{"go", "test", "-count=1", "./..."}, "go.mod"},
	"go-vet":   {[]string{"go", "vet", "./..."}, "go.mod"},
	"go-build": {[]string{"go", "build", "-trimpath", "./..."}, "go.mod"},
	"npm-test": {[]string{"npm", "test", "--silent"}, "package.json"},
}

func profilePath(root string) string { return filepath.Join(root, profileDir, "project.json") }

func UseProject(name, dir string, approve bool) (ProjectProfile, error) {
	var p ProjectProfile
	if !approve {
		return p, errors.New("add --approve to write .evolution/project.json in that directory")
	}
	if !projectName.MatchString(name) {
		return p, errors.New("project name must be lowercase letters, numbers or hyphens")
	}
	if !filepath.IsAbs(dir) {
		return p, errors.New("--dir must be an absolute path")
	}
	root := filepath.Clean(dir)
	info, err := os.Stat(root)
	if err != nil || !info.IsDir() {
		return p, errors.New("--dir must be an existing directory")
	}
	if err := os.MkdirAll(filepath.Join(root, profileDir, "runs"), 0o700); err != nil {
		return p, err
	}
	p = ProjectProfile{name, root, "local", time.Now().UTC().Format(time.RFC3339)}
	data, _ := json.MarshalIndent(p, "", "  ")
	return p, os.WriteFile(profilePath(root), append(data, '\n'), 0o600)
}

func LoadProject(dir string) (ProjectProfile, error) {
	var p ProjectProfile
	if !filepath.IsAbs(dir) {
		return p, errors.New("--project must be an absolute path")
	}
	data, err := os.ReadFile(profilePath(filepath.Clean(dir)))
	if err != nil {
		return p, errors.New("no project profile; run evolution project use first")
	}
	if json.Unmarshal(data, &p) != nil || p.Root != filepath.Clean(dir) || !projectName.MatchString(p.Name) {
		return p, errors.New("project profile is invalid or was moved; re-run evolution project use")
	}
	return p, nil
}

// RouteRequest describes how OMNI would route a goal. It never calls a model.
type RouteRequest struct {
	Project  string   `json:"project"`
	Goal     string   `json:"goal"`
	Roles    []string `json:"roles"`
	Sandbox  string   `json:"sandbox"`
	Tasks    []string `json:"suggested_tasks"`
	Model    string   `json:"model"`
	Approval string   `json:"approval"`
}

func RouteGoal(p ProjectProfile, goal string) (RouteRequest, error) {
	goal = strings.TrimSpace(goal)
	if len(goal) < 5 || len(goal) > 500 {
		return RouteRequest{}, errors.New("goal must be 5-500 characters")
	}
	tasks := []string{}
	for _, id := range []string{"go-test", "go-vet", "npm-test"} {
		if _, err := os.Stat(filepath.Join(p.Root, sandboxTasks[id].marker)); err == nil {
			tasks = append(tasks, id)
		}
	}
	return RouteRequest{p.Name, goal, []string{"OmniForge coder (planned)", "independent reviewer/tester", "Guardian checks"}, "local (cloud sandbox BLOCKED: no service)", tasks,
		"NOT CONNECTED: no model call made", "Run each task yourself with evolution sandbox run --approve"}, nil
}

type RunRecord struct {
	ID        string   `json:"id"`
	Project   string   `json:"project"`
	Task      string   `json:"task"`
	Argv      []string `json:"argv"`
	Started   string   `json:"started"`
	Seconds   float64  `json:"seconds"`
	ExitCode  int      `json:"exit_code"`
	Result    string   `json:"result"`
	LogFile   string   `json:"log_file"`
	Truncated bool     `json:"truncated"`
}

const maxLog = 1 << 20

type cappedBuffer struct {
	mu sync.Mutex
	bytes.Buffer
	truncated bool
}

func (c *cappedBuffer) Write(b []byte) (int, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	room := maxLog - c.Len()
	if room <= 0 {
		c.truncated = true
		return len(b), nil
	}
	if len(b) > room {
		c.truncated = true
		c.Buffer.Write(b[:room])
		return len(b), nil
	}
	return c.Buffer.Write(b)
}

// minimalEnv passes only what toolchains need, so tokens in the parent shell are not inherited.
func minimalEnv() []string {
	keep := []string{"PATH", "HOME", "USERPROFILE", "TMPDIR", "TEMP", "TMP", "SYSTEMROOT", "GOPATH", "GOCACHE", "GOMODCACHE", "LANG"}
	env := []string{"CI=1", "EVOLUTION_SANDBOX=local"}
	for _, k := range keep {
		if v, ok := os.LookupEnv(k); ok {
			env = append(env, k+"="+v)
		}
	}
	return env
}

func RunSandbox(p ProjectProfile, task string, approve bool, timeout time.Duration, live io.Writer) (RunRecord, error) {
	var rec RunRecord
	t, ok := sandboxTasks[task]
	if !ok {
		return rec, errors.New("unknown task; allowed: go-test, go-vet, go-build, npm-test")
	}
	if !approve {
		return rec, errors.New("add --approve to run this task in the project directory")
	}
	if _, err := os.Stat(filepath.Join(p.Root, t.marker)); err != nil {
		return rec, fmt.Errorf("task %s needs %s in the project root", task, t.marker)
	}
	bin, err := exec.LookPath(t.argv[0])
	if err != nil {
		return rec, fmt.Errorf("%s is not installed on this machine", t.argv[0])
	}
	idBytes := make([]byte, 6)
	_, _ = rand.Read(idBytes)
	rec = RunRecord{ID: time.Now().UTC().Format("20060102T150405Z") + "-" + hex.EncodeToString(idBytes), Project: p.Name, Task: task, Argv: t.argv, Started: time.Now().UTC().Format(time.RFC3339)}
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, bin, t.argv[1:]...)
	// Bound waiting on inherited stdout/stderr pipes; not process-tree isolation.
	cmd.WaitDelay = 500 * time.Millisecond
	cmd.Dir, cmd.Env = p.Root, minimalEnv()
	buf := &cappedBuffer{}
	// One synchronized capped sink avoids stdout/stderr races. Display only
	// after redaction, so terminal capture cannot expose raw child credentials.
	cmd.Stdout, cmd.Stderr = buf, buf
	start := time.Now()
	runErr := cmd.Run()
	rec.Seconds = float64(time.Since(start).Milliseconds()) / 1000
	rec.Truncated = buf.truncated
	switch {
	case ctx.Err() == context.DeadlineExceeded:
		rec.ExitCode, rec.Result = -1, "TIMED OUT"
	case runErr != nil:
		var ee *exec.ExitError
		if errors.As(runErr, &ee) {
			rec.ExitCode, rec.Result = ee.ExitCode(), "FAILED"
		} else {
			rec.ExitCode, rec.Result = -1, "COULD NOT START"
		}
	default:
		rec.Result = "PASSED"
	}
	runs := filepath.Join(p.Root, profileDir, "runs")
	if err := os.MkdirAll(runs, 0o700); err != nil {
		return rec, err
	}
	rec.LogFile = filepath.Join(runs, rec.ID+".log")
	header := fmt.Sprintf("# evolution sandbox run %s\n# project=%s task=%s platform=%s/%s argv=%q\n# isolation: LOCAL PROCESS ONLY (not a container or VM)\n", rec.ID, p.Name, task, runtime.GOOS, runtime.GOARCH, t.argv)
	clean, n := RedactSecrets(buf.Bytes())
	if live != nil { if _, err := live.Write(clean); err != nil { return rec, err } }
	if n > 0 {
		header += fmt.Sprintf("# redacted %d secret-like value(s) before saving\n", n)
	}
	if err := os.WriteFile(rec.LogFile, append([]byte(header), clean...), 0o600); err != nil {
		return rec, err
	}
	meta, _ := json.MarshalIndent(rec, "", "  ")
	return rec, os.WriteFile(filepath.Join(runs, rec.ID+".json"), append(meta, '\n'), 0o600)
}
