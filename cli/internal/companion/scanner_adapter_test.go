package companion

import (
	"context"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

// TEST-ONLY fixed-argv adapter prototype. No scanner subprocess implementation
// is compiled into the source binary. A production adapter needs a safely pinned
// target/isolated filesystem; pathname rechecks cannot prevent all symlink races.
func scanSelectedFile(ctx context.Context, p ProjectProfile, device, relative, executable string, approve bool, timeout time.Duration) (ScanEvidence, error) {
	e := ScanEvidence{Engine: "ClamAV clamscan", ExitCode: -1, Result: "NOT STARTED", Containment: processBoundary}
	if !approve {
		return e, errors.New("per-operation scan approval required")
	}
	if err := maintenanceTarget(p, device); err != nil {
		return e, err
	}
	if timeout <= 0 || timeout > time.Minute || ctx.Err() != nil {
		return e, errors.New("scan cancelled or timeout invalid")
	}
	if runtime.GOOS != "linux" {
		return e, errors.New("native scanner adapter unsupported")
	}
	if !filepath.IsLocal(relative) || filepath.ToSlash(filepath.Clean(relative)) != relative || strings.Contains(relative, "\\") || excludedStoragePath(relative, false) {
		return e, errors.New("scan target unsafe/excluded")
	}
	if err := safeScannerExecutable(executable); err != nil {
		return e, err
	}
	root, err := os.OpenRoot(p.Root)
	if err != nil {
		return e, errors.New("project unavailable")
	}
	defer root.Close()
	for parent := filepath.Dir(relative); parent != "."; parent = filepath.Dir(parent) {
		stat, err := root.Lstat(parent)
		if err != nil || !stat.IsDir() || stat.Mode()&os.ModeSymlink != 0 || !safeStorageOwner(stat) {
			return e, errors.New("scan parent unsafe")
		}
	}
	stat, err := root.Lstat(relative)
	if err != nil || !stat.Mode().IsRegular() || !safeStorageOwner(stat) || stat.Size() > 16<<20 {
		return e, errors.New("scan target unavailable/unsafe or over 16 MiB")
	}
	runCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	version := exec.CommandContext(runCtx, executable, "--version")
	version.Env = minimalEnv()
	version.WaitDelay = 500 * time.Millisecond
	versionBuf := &cappedBuffer{}
	version.Stdout = versionBuf
	version.Stderr = versionBuf
	cleanup := containProcess(version)
	err = version.Run()
	cleanup()
	if err != nil {
		if runCtx.Err() == context.Canceled {
			e.Result = "VERSION CANCELLED: no file scan started"
			return e, nil
		}
		if runCtx.Err() == context.DeadlineExceeded {
			e.Result = "VERSION TIMED OUT: no file scan started"
			return e, nil
		}
		e.Result = "VERSION ERROR: no file scan started"
		return e, errors.New("scanner version unavailable; no file scan started")
	}
	clean, _ := RedactSecrets(versionBuf.Bytes())
	e.Version = strings.TrimSpace(string(clean))
	if len(e.Version) > 300 {
		e.Version = e.Version[:300]
	}
	if !strings.HasPrefix(e.Version, "ClamAV ") {
		return e, errors.New("unsupported scanner version output")
	}
	if err := validateCurrentProject(p); err != nil {
		return e, err
	}
	current, err := root.Lstat(relative)
	if err != nil || !os.SameFile(stat, current) || stat.Size() != current.Size() || !stat.ModTime().Equal(current.ModTime()) {
		return e, errors.New("scan target changed before startup")
	}
	args := []string{"--no-summary", "--follow-file-symlinks=0", "--follow-dir-symlinks=0", "--max-filesize=16M", "--max-scansize=32M", "--max-recursion=8", "--max-files=100", "--", filepath.Join(p.Root, relative)}
	cmd := exec.CommandContext(runCtx, executable, args...)
	cmd.Env = minimalEnv()
	cmd.Dir = p.Root
	cmd.WaitDelay = 500 * time.Millisecond
	buf := &cappedBuffer{}
	cmd.Stdout = buf
	cmd.Stderr = buf
	cleanup = containProcess(cmd)
	e.Started = time.Now().UTC().Format(time.RFC3339Nano)
	start := time.Now()
	err = cmd.Run()
	cleanup()
	e.Seconds = time.Since(start).Seconds()
	e.Truncated = buf.truncated
	clean, _ = RedactSecrets(buf.Bytes())
	e.Output = string(clean)
	if cmd.ProcessState != nil {
		e.ExitCode = cmd.ProcessState.ExitCode()
	}
	switch {
	case runCtx.Err() == context.Canceled:
		e.Result = "CANCELLED: completion unverified"
	case runCtx.Err() == context.DeadlineExceeded:
		e.Result = "TIMED OUT: completion unverified"
	case err == nil:
		e.Result = "ENGINE EXIT 0: no detections reported for selected input; not malware-free certification"
	case e.ExitCode == 1:
		e.Result = "ENGINE EXIT 1: detections reported; no remediation requested"
	default:
		e.Result = "ENGINE ERROR: scan incomplete/unverified"
	}
	return e, nil
}
