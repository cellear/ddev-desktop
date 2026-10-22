package api

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os/exec"
	"regexp"
	"runtime"
	"strings"
	"time"

	"github.com/cellear/ddev-desktop/internal/ddev"
)

// Sprint 2: the controls on the site panel. Each handler looks the project
// up with `ddev describe` first, which gives the approot (needed because
// `ddev config` acts on the current directory) and the running state.

var validPHP = regexp.MustCompile(`^[5-9]\.[0-9]$`)

func readJSON(r *http.Request, v any) error {
	defer r.Body.Close()
	return json.NewDecoder(io.LimitReader(r.Body, 1<<16)).Decode(v)
}

// project validates the name and describes it, writing the HTTP error
// itself. ok is false when the caller should return.
func (s *Server) project(w http.ResponseWriter, r *http.Request) (*ddev.Details, bool) {
	name := r.PathValue("name")
	if !ddev.ValidName(name) {
		http.Error(w, "invalid project name", http.StatusBadRequest)
		return nil, false
	}
	d, err := s.DDEV.Describe(r.Context(), name)
	if err != nil {
		httpError(w, err)
		return nil, false
	}
	return d, true
}

// setPHP: POST /api/projects/{name}/php {"version":"8.3"}.
// Runs `ddev config --php-version` in the project root, then restarts the
// project if it is running so the change takes effect.
func (s *Server) setPHP(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Version string `json:"version"`
	}
	if err := readJSON(r, &body); err != nil || !validPHP.MatchString(body.Version) {
		http.Error(w, "version must look like 8.3", http.StatusBadRequest)
		return
	}
	d, ok := s.project(w, r)
	if !ok {
		return
	}
	running := d.Status == "running"
	title := fmt.Sprintf("ddev config --php-version %s", body.Version)
	if running {
		title += " && ddev restart " + d.Name
	}
	j := s.jobs.start(title, func(line func(string)) error {
		ctx := context.Background()
		if err := s.DDEV.StreamIn(ctx, d.AppRoot, line, "config", "--php-version", body.Version); err != nil {
			return err
		}
		if !running {
			line("Project is stopped; PHP " + body.Version + " applies at the next start.")
			return nil
		}
		return s.DDEV.Stream(ctx, line, "restart", d.Name)
	})
	s.logf("job %s: %s", j.id, j.title)
	writeJSON(w, map[string]any{"job": j.id, "title": j.title})
}

// deleteProject: POST /api/projects/{name}/delete {"snapshot":true}.
// `ddev delete` removes the project from DDEV and its database; the code
// folder is never touched. With snapshot (the default) DDEV first saves the
// database under .ddev/db_snapshots/.
func (s *Server) deleteProject(w http.ResponseWriter, r *http.Request) {
	body := struct {
		Snapshot *bool `json:"snapshot"`
	}{}
	if r.ContentLength != 0 { // an empty body means the defaults
		if err := readJSON(r, &body); err != nil {
			http.Error(w, "bad JSON", http.StatusBadRequest)
			return
		}
	}
	snapshot := body.Snapshot == nil || *body.Snapshot
	name := r.PathValue("name")
	if !ddev.ValidName(name) {
		http.Error(w, "invalid project name", http.StatusBadRequest)
		return
	}
	args := []string{"delete", name, "-y"}
	if !snapshot {
		args = append(args, "-O")
	}
	j := s.jobs.start("ddev "+strings.Join(args[:], " "), func(line func(string)) error {
		return s.DDEV.Stream(context.Background(), line, args...)
	})
	s.logf("job %s: %s", j.id, j.title)
	writeJSON(w, map[string]any{"job": j.id, "title": j.title})
}

// reveal: POST /api/projects/{name}/reveal opens the code folder in the
// file manager.
func (s *Server) reveal(w http.ResponseWriter, r *http.Request) {
	d, ok := s.project(w, r)
	if !ok {
		return
	}
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("open", d.AppRoot)
	case "windows":
		cmd = exec.Command("explorer", d.AppRoot)
	default:
		cmd = exec.Command("xdg-open", d.AppRoot)
	}
	if err := cmd.Start(); err != nil {
		httpError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// terminal: POST /api/projects/{name}/terminal {"app":"Terminal"} opens a
// terminal window that runs `ddev ssh` in the project.
func (s *Server) terminal(w http.ResponseWriter, r *http.Request) {
	var body struct {
		App string `json:"app"`
	}
	_ = readJSON(r, &body)
	d, ok := s.project(w, r)
	if !ok {
		return
	}
	if err := openTerminal(body.App, d.AppRoot); err != nil {
		httpError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// openTerminal opens app (Terminal, iTerm2, Warp, or anything for the
// system default) in dir, running `ddev ssh` where the app can be told to.
func openTerminal(app, dir string) error {
	shell := "cd " + shellQuote(dir) + " && ddev ssh"
	switch runtime.GOOS {
	case "darwin":
		switch app {
		case "iTerm2", "iTerm":
			return osascript(fmt.Sprintf(`tell application "iTerm"
	activate
	set w to (create window with default profile)
	tell current session of w to write text %s
end tell`, appleQuote(shell)))
		case "Warp":
			// Warp cannot be scripted to run a command; open a tab in the
			// folder and the user types `ddev ssh`.
			return exec.Command("open", "-a", "Warp", dir).Run()
		default:
			return osascript(fmt.Sprintf(`tell application "Terminal"
	activate
	do script %s
end tell`, appleQuote(shell)))
		}
	case "windows":
		return exec.Command("cmd", "/c", "start", "cmd", "/k", "cd /d "+dir+" && ddev ssh").Start()
	default:
		return exec.Command("x-terminal-emulator", "-e", "bash", "-lc", shell+"; exec bash").Start()
	}
}

func osascript(script string) error {
	var stderr bytes.Buffer
	cmd := exec.Command("osascript", "-e", script)
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("osascript: %s", strings.TrimSpace(stderr.String()))
	}
	return nil
}

// shellQuote single-quotes s for a POSIX shell.
func shellQuote(s string) string {
	return "'" + strings.ReplaceAll(s, "'", `'\''`) + "'"
}

// appleQuote double-quotes s as an AppleScript string literal.
func appleQuote(s string) string {
	s = strings.ReplaceAll(s, `\`, `\\`)
	s = strings.ReplaceAll(s, `"`, `\"`)
	return `"` + s + `"`
}

// exportDB: GET /api/projects/{name}/export-db streams a plain SQL dump as
// a download. The project must be running.
func (s *Server) exportDB(w http.ResponseWriter, r *http.Request) {
	d, ok := s.project(w, r)
	if !ok {
		return
	}
	if d.Status != "running" {
		http.Error(w, "project is not running", http.StatusConflict)
		return
	}
	if d.Database.Type == "" {
		http.Error(w, "project has no database container", http.StatusConflict)
		return
	}
	filename := fmt.Sprintf("%s-%s.sql", d.Name, time.Now().Format("20060102-1504"))
	w.Header().Set("Content-Type", "application/sql")
	w.Header().Set("Content-Disposition", `attachment; filename="`+filename+`"`)
	s.logf("export-db %s -> %s", d.Name, filename)
	if err := s.DDEV.Output(r.Context(), w, "export-db", d.Name, "--gzip=false"); err != nil {
		// Headers may already be out; the best we can do is log and cut
		// the body short, which makes the browser report a failed download.
		s.logf("export-db %s: %v", d.Name, err)
		if f, ok := w.(http.Flusher); ok {
			f.Flush()
		}
		if hj, ok := w.(http.Hijacker); ok {
			if conn, _, err := hj.Hijack(); err == nil {
				conn.Close()
			}
		}
	}
}

func (s *Server) logf(format string, args ...any) {
	if s.Log != nil {
		s.Log.Printf(format, args...)
	}
}
