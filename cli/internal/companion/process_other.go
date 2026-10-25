//go:build !linux

package companion

import "os/exec"

func containProcess(cmd *exec.Cmd) func() { return func() {} }

const processBoundary = "DIRECT PROCESS ONLY; descendant cancellation unsupported on this host"