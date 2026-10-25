//go:build linux

package companion

import (
	"os"
	"os/exec"
	"sync"
	"syscall"
)

// Only the new task's process group is signalled. Children that deliberately
// detach with setsid/setpgid escape this boundary; this is not a container.
func containProcess(cmd *exec.Cmd) func() {
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	var once sync.Once
	var killErr error
	kill := func() error {
		if cmd.Process == nil {
			return nil
		}
		once.Do(func() {
			killErr = syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL)
			if killErr == syscall.ESRCH {
				killErr = os.ErrProcessDone
			}
		})
		return killErr
	}
	cmd.Cancel = kill
	return func() { _ = kill() }
}

const processBoundary = "LINUX PROCESS GROUP; detached descendants may escape; no filesystem/network isolation"
