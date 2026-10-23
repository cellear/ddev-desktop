package api

import (
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strconv"

	"github.com/cellear/ddev-desktop/internal/ddev"
)

var validService = regexp.MustCompile(`^[a-z][a-z0-9_-]{0,31}$`)

// logs: GET /api/projects/{name}/logs?service=web&tail=200 streams
// `ddev logs -f` as Server-Sent Events until the page goes away, which
// ends the ddev process (see setProcessGroup).
func (s *Server) logs(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	if !ddev.ValidName(name) {
		http.Error(w, "invalid project name", http.StatusBadRequest)
		return
	}
	service := r.URL.Query().Get("service")
	if service == "" {
		service = "web"
	}
	if !validService.MatchString(service) {
		http.Error(w, "invalid service", http.StatusBadRequest)
		return
	}
	tail := 200
	if t := r.URL.Query().Get("tail"); t != "" {
		n, err := strconv.Atoi(t)
		if err != nil || n < 1 || n > 5000 {
			http.Error(w, "tail must be between 1 and 5000", http.StatusBadRequest)
			return
		}
		tail = n
	}
	fl, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming unsupported", http.StatusInternalServerError)
		return
	}
	h := w.Header()
	h.Set("Content-Type", "text/event-stream")
	h.Set("Cache-Control", "no-cache")
	h.Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)
	args := []string{"logs", "-f", "-s", service, "--tail", strconv.Itoa(tail), name}
	fmt.Fprintf(w, "event: title\ndata: ddev %s\n\n", joinArgs(args))
	fl.Flush()
	err := s.DDEV.Stream(r.Context(), func(l string) {
		fmt.Fprintf(w, "event: line\ndata: %s\n\n", l)
		fl.Flush()
	}, args...)
	if r.Context().Err() != nil {
		return // the page stopped listening; ddev was terminated
	}
	msg := ""
	if err != nil {
		msg = err.Error()
	}
	fmt.Fprintf(w, "event: exit\ndata: %s\n\n", jsonExit(msg))
	fl.Flush()
}

// edit: POST /api/edit {"project":"name","what":"config"|"php"|"mysql"}
// or {"what":"global"} opens a configuration file in the default text
// editor, or a configuration folder in the file manager (created when
// missing, since DDEV reads *.ini / *.cnf from it).
func (s *Server) edit(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Project string `json:"project"`
		What    string `json:"what"`
	}
	if err := readJSON(r, &body); err != nil {
		http.Error(w, "bad JSON", http.StatusBadRequest)
		return
	}
	var path string
	isDir := false
	switch body.What {
	case "global":
		home, err := os.UserHomeDir()
		if err != nil {
			httpError(w, err)
			return
		}
		path = filepath.Join(home, ".ddev", "global_config.yaml")
	case "config", "php", "mysql":
		if !ddev.ValidName(body.Project) {
			http.Error(w, "invalid project name", http.StatusBadRequest)
			return
		}
		d, err := s.DDEV.Describe(r.Context(), body.Project)
		if err != nil {
			httpError(w, err)
			return
		}
		switch body.What {
		case "config":
			path = filepath.Join(d.AppRoot, ".ddev", "config.yaml")
		default:
			path, isDir = filepath.Join(d.AppRoot, ".ddev", body.What), true
		}
	default:
		http.Error(w, "unknown target", http.StatusBadRequest)
		return
	}
	if isDir {
		if err := os.MkdirAll(path, 0o755); err != nil {
			httpError(w, err)
			return
		}
	} else if _, err := os.Stat(path); err != nil {
		httpError(w, fmt.Errorf("no such file: %s", path))
		return
	}
	var cmd *exec.Cmd
	switch {
	case runtime.GOOS == "darwin" && !isDir:
		cmd = exec.Command("open", "-t", path) // default text editor
	case runtime.GOOS == "darwin":
		cmd = exec.Command("open", path)
	case runtime.GOOS == "windows":
		cmd = exec.Command("explorer", path)
	default:
		cmd = exec.Command("xdg-open", path)
	}
	if err := cmd.Start(); err != nil {
		httpError(w, err)
		return
	}
	s.logf("edit: %s", path)
	writeJSON(w, map[string]string{"path": path})
}
