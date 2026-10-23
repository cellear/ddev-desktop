package api

import (
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
)

// OpenWindow shows url to the user. mode "app" opens a Chromium app
// window (a real OS window with no tabs or address bar) when a Chromium
// browser is installed, falling back to the default browser; mode "tab"
// always uses the default browser.
func OpenWindow(url, mode string, logger *log.Logger) {
	if mode == "app" {
		if cmd := appWindowCommand(url); cmd != nil {
			if err := cmd.Start(); err == nil {
				logger.Printf("opened app window: %s", cmd.Args[len(cmd.Args)-1])
				return
			} else {
				logger.Printf("app window: %v; using the default browser", err)
			}
		} else {
			logger.Print("no Chromium browser found for an app window; using the default browser")
		}
	}
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("open", url)
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	default:
		cmd = exec.Command("xdg-open", url)
	}
	if err := cmd.Start(); err != nil {
		logger.Printf("open browser: %v (open %s yourself)", err, url)
	}
}

const appWindowSize = "--window-size=1100,720"

// appWindowCommand returns the command for a Chromium --app window, or nil
// when no supported browser is installed.
func appWindowCommand(url string) *exec.Cmd {
	switch runtime.GOOS {
	case "darwin":
		for _, app := range []string{"Google Chrome", "Brave Browser", "Microsoft Edge", "Chromium", "Google Chrome Canary"} {
			if _, err := os.Stat(filepath.Join("/Applications", app+".app")); err == nil {
				// -n: a new instance even if the browser runs; it hands the
				// arguments to the running one and exits.
				return exec.Command("open", "-na", app, "--args", appWindowSize, "--app="+url)
			}
		}
	case "linux":
		for _, bin := range []string{"google-chrome", "google-chrome-stable", "brave-browser", "microsoft-edge", "chromium", "chromium-browser"} {
			if path, err := exec.LookPath(bin); err == nil {
				return exec.Command(path, appWindowSize, "--app="+url)
			}
		}
	}
	return nil
}
