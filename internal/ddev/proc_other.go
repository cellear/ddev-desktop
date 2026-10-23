//go:build !unix

package ddev

import "os/exec"

func setProcessGroup(*exec.Cmd) {}
