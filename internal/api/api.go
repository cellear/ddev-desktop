// Package api is the HTTP side of the daemon: JSON endpoints for the page,
// Server-Sent Events for long-running ddev commands, and the static page
// itself. Every request must come from this machine and carry the token.
package api

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"fmt"
	"io/fs"
	"log"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/cellear/ddev-desktop/internal/ddev"
)

const cookieName = "ddev_desktop_token"

// Server holds what the handlers need.
type Server struct {
	DDEV   *ddev.Runner
	Token  string // per-launch secret; every request must present it
	Limit  int    // projects the page shows without a filter
	Static fs.FS  // the built page (ui/dist)
	Log    *log.Logger
	// StateDir holds settings.json and state.json (~/.ddev-desktop).
	StateDir string

	jobs    *jobs
	started map[string]bool // projects this daemon started; see settings.go

	listMu    sync.Mutex
	listCache []ddev.Project
	listAt    time.Time
}

// Handler returns the routed, guarded handler.
func (s *Server) Handler() http.Handler {
	if s.jobs == nil {
		s.jobs = newJobs()
	}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", s.health)
	mux.HandleFunc("GET /api/features", s.features)
	mux.HandleFunc("GET /api/check", s.check)
	mux.HandleFunc("POST /api/choose", s.choose)
	mux.HandleFunc("GET /api/projects", s.listProjects)
	mux.HandleFunc("POST /api/projects", s.createProject)
	mux.HandleFunc("GET /api/projects/{name}", s.describe)
	mux.HandleFunc("POST /api/projects/{name}/php", s.setPHP)
	mux.HandleFunc("POST /api/projects/{name}/delete", s.deleteProject)
	mux.HandleFunc("POST /api/projects/{name}/reveal", s.reveal)
	mux.HandleFunc("POST /api/projects/{name}/terminal", s.terminal)
	mux.HandleFunc("GET /api/projects/{name}/export-db", s.exportDB)
	mux.HandleFunc("POST /api/projects/{name}/{action}", s.action)
	mux.HandleFunc("GET /api/jobs", s.listJobs)
	mux.HandleFunc("GET /api/jobs/{id}/events", s.jobEvents)
	mux.HandleFunc("GET /api/settings", s.getSettings)
	mux.HandleFunc("PUT /api/settings", s.putSettings)
	mux.HandleFunc("POST /api/edit", s.edit)
	mux.HandleFunc("GET /api/projects/{name}/logs", s.logs)
	mux.Handle("/", http.FileServer(http.FS(s.Static)))
	return s.guard(mux)
}

// guard rejects requests that are not from a local browser carrying the
// token. The token arrives as ?token= on the first page load (the daemon
// opens the browser with it) and is then kept in a cookie.
func (s *Server) guard(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		host := r.Host
		if h, _, err := net.SplitHostPort(host); err == nil {
			host = h
		}
		if host != "127.0.0.1" && host != "localhost" && host != "::1" {
			http.Error(w, "forbidden host", http.StatusForbidden)
			return
		}
		if q := r.URL.Query().Get("token"); q != "" {
			if !s.tokenOK(q) {
				http.Error(w, "forbidden", http.StatusForbidden)
				return
			}
			http.SetCookie(w, &http.Cookie{
				Name: cookieName, Value: q, Path: "/",
				HttpOnly: true, SameSite: http.SameSiteStrictMode,
			})
			if r.URL.Path == "/" {
				// Drop the token from the address bar.
				http.Redirect(w, r, "/", http.StatusFound)
				return
			}
			next.ServeHTTP(w, r)
			return
		}
		c, err := r.Cookie(cookieName)
		if err != nil || !s.tokenOK(c.Value) {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) tokenOK(t string) bool {
	return subtle.ConstantTimeCompare([]byte(t), []byte(s.Token)) == 1
}

func (s *Server) health(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, map[string]any{"ok": true})
}

func (s *Server) listProjects(w http.ResponseWriter, r *http.Request) {
	projects, err := s.DDEV.List(r.Context())
	if err != nil {
		httpError(w, err)
		return
	}
	// Every project goes to the page (most recently started first); limit
	// is how many it shows when nothing is being searched for.
	writeJSON(w, map[string]any{"projects": projects, "limit": s.Limit})
}

func (s *Server) describe(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	if !ddev.ValidName(name) {
		http.Error(w, "invalid project name", http.StatusBadRequest)
		return
	}
	d, err := s.DDEV.Describe(r.Context(), name)
	if err != nil {
		httpError(w, err)
		return
	}
	writeJSON(w, d)
}

// actions maps an API action to the ddev arguments run before the project
// name. Only these may be started from the page.
var actions = map[string][]string{
	"start":   {"start"},
	"stop":    {"stop"},
	"restart": {"restart"},
}

// action starts a ddev command for a project as a background job and
// returns its id. The page then follows /api/jobs/{id}/events.
func (s *Server) action(w http.ResponseWriter, r *http.Request) {
	name, act := r.PathValue("name"), r.PathValue("action")
	if !ddev.ValidName(name) {
		http.Error(w, "invalid project name", http.StatusBadRequest)
		return
	}
	args, ok := actions[act]
	if !ok {
		http.Error(w, "unknown action", http.StatusBadRequest)
		return
	}
	args = append(append([]string{}, args...), name)
	if act == "start" || act == "restart" {
		s.markStarted(name)
	}
	j := s.jobs.start(name, act, fmt.Sprintf("ddev %s", strings.Join(args, " ")), func(line func(string)) error {
		// Not the request context: the command keeps running if the page
		// disconnects, which is what a user who closed the tab expects.
		return s.DDEV.Stream(context.Background(), line, args...)
	})
	if s.Log != nil {
		s.Log.Printf("job %s: %s", j.id, j.title)
	}
	writeJSON(w, map[string]any{"job": j.id, "title": j.title})
}

func (s *Server) listJobs(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, map[string]any{"jobs": s.jobs.active()})
}

// jobEvents streams a job's output as Server-Sent Events: one "line" event
// per output line, then one "exit" event. A late subscriber gets the
// whole log first, so a reload mid-start loses nothing.
func (s *Server) jobEvents(w http.ResponseWriter, r *http.Request) {
	j := s.jobs.get(r.PathValue("id"))
	if j == nil {
		http.Error(w, "no such job", http.StatusNotFound)
		return
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
	fmt.Fprintf(w, "event: title\ndata: %s\n\n", j.title)
	fl.Flush()

	from := 0
	for {
		lines, done, errText, changed := j.snapshot(from)
		for _, l := range lines {
			fmt.Fprintf(w, "event: line\ndata: %s\n\n", l)
		}
		from += len(lines)
		if done {
			exit, _ := json.Marshal(map[string]any{"ok": errText == "", "error": errText})
			fmt.Fprintf(w, "event: exit\ndata: %s\n\n", exit)
			fl.Flush()
			return
		}
		fl.Flush()
		select {
		case <-changed:
		case <-r.Context().Done():
			return
		case <-time.After(15 * time.Second):
			fmt.Fprint(w, ": keepalive\n\n")
			fl.Flush()
		}
	}
}

func joinArgs(args []string) string { return strings.Join(args, " ") }

func jsonExit(errText string) []byte {
	b, _ := json.Marshal(map[string]any{"ok": errText == "", "error": errText})
	return b
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	enc := json.NewEncoder(w)
	enc.SetIndent("", " ")
	if err := enc.Encode(v); err != nil {
		log.Printf("write json: %v", err)
	}
}

func httpError(w http.ResponseWriter, err error) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusBadGateway)
	json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
}
