//go:build unix

package ddev

import (
	"os/exec"
	"syscall"
)

// setProcessGroup puts the command in its own process group and makes
// context cancellation kill the whole group (ddev and the docker it runs).
func setProcessGroup(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	cmd.Cancel = func() error {
		if cmd.Process == nil {
			return nil
		}
		return syscall.Kill(-cmd.Process.Pid, syscall.SIGTERM)
	}
}
