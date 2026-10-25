//go:build linux

package companion

import (
	"os/exec"
	"syscall"
)

// Only the new task's process group is signalled. Children that deliberately
// detach with setsid/setpgid escape this boundary; this is not a container.
func containProcess(cmd *exec.Cmd) func() {
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	cmd.Cancel = func() error {
		if cmd.Process == nil { return nil }
		return syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL)
	}
	return func() {
		if cmd.Process != nil { _ = syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL) }
	}
}

const processBoundary = "LINUX PROCESS GROUP; detached descendants may escape; no filesystem/network isolation"