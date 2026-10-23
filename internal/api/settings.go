package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/cellear/ddev-desktop/internal/ddev"
)

// Sprint 4: settings and the daemon's lifecycle.

// PanelSettings are the panel's own preferences, kept in
// ~/.ddev-desktop/settings.json. Everything about DDEV itself lives in
// DDEV's config and is read from there instead.
type PanelSettings struct {
	DefaultPHP    string `json:"default_php"` // preselected for new sites; "" = DDEV's default
	Terminal      string `json:"terminal"`    // Terminal, iTerm2, Warp
	Window        string `json:"window"`      // "app" (Chromium app window) or "tab" (default browser)
	StartOnLaunch bool   `json:"start_on_launch"`
	StopOnQuit    bool   `json:"stop_on_quit"`
	Verbose       bool   `json:"verbose"`
}

var defaultPanel = PanelSettings{Terminal: "Terminal", Window: "app", StartOnLaunch: true, StopOnQuit: true}

// GlobalSettings is the slice of `ddev config global` the page shows, plus
// the ports the router really listens on: DDEV 1.25 substitutes others
// when the configured ones are busy.
type GlobalSettings struct {
	RouterHTTPPort  string `json:"router_http_port"`
	RouterHTTPSPort string `json:"router_https_port"`
	ProjectTLD      string `json:"project_tld"`
	ActiveHTTPPort  string `json:"active_http_port"`  // "" when no project is running
	ActiveHTTPSPort string `json:"active_https_port"` // "" when no project is running
}

type settingsPayload struct {
	Panel  PanelSettings  `json:"panel"`
	Global GlobalSettings `json:"global"`
	Files  struct {
		GlobalConfig string `json:"global_config"`
	} `json:"files"`
}

var (
	validPort = regexp.MustCompile(`^[0-9]{1,5}$`)
	validTLD  = regexp.MustCompile(`^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$`)
)

func (s *Server) settingsPath() string { return filepath.Join(s.StateDir, "settings.json") }
func (s *Server) statePath() string    { return filepath.Join(s.StateDir, "state.json") }

// Panel returns the saved panel settings, or the defaults.
func (s *Server) Panel() PanelSettings {
	p := defaultPanel
	data, err := os.ReadFile(s.settingsPath())
	if err == nil {
		_ = json.Unmarshal(data, &p)
	}
	if p.Window == "" {
		p.Window = defaultPanel.Window
	}
	return p
}

func (s *Server) savePanel(p PanelSettings) error {
	if s.StateDir == "" {
		return errors.New("no state directory")
	}
	data, err := json.MarshalIndent(p, "", " ")
	if err != nil {
		return err
	}
	s.DDEV.Verbose.Store(p.Verbose)
	return os.WriteFile(s.settingsPath(), data, 0o600)
}

// global reads DDEV's global config and the active router ports.
func (s *Server) global(ctx context.Context) (GlobalSettings, error) {
	var g GlobalSettings
	cfg, err := s.DDEV.GlobalConfig(ctx)
	if err != nil {
		return g, err
	}
	g.RouterHTTPPort, g.RouterHTTPSPort, g.ProjectTLD = cfg["router-http-port"], cfg["router-https-port"], cfg["project-tld"]
	if projects, err := s.recentList(ctx); err == nil {
		for _, p := range projects {
			if p.Status != "running" {
				continue
			}
			g.ActiveHTTPPort = portOf(p.HTTPURL, "80")
			g.ActiveHTTPSPort = portOf(p.HTTPSURL, "443")
			break
		}
	}
	return g, nil
}

// portOf returns the explicit port in a URL, or def when it has none.
func portOf(raw, def string) string {
	u, err := url.Parse(raw)
	if err != nil || u.Host == "" {
		return ""
	}
	if p := u.Port(); p != "" {
		return p
	}
	return def
}

func (s *Server) settingsPayload(ctx context.Context) (settingsPayload, error) {
	var out settingsPayload
	out.Panel = s.Panel()
	g, err := s.global(ctx)
	if err != nil {
		return out, err
	}
	out.Global = g
	if home, err := os.UserHomeDir(); err == nil {
		out.Files.GlobalConfig = filepath.Join(home, ".ddev", "global_config.yaml")
	}
	return out, nil
}

// getSettings: GET /api/settings
func (s *Server) getSettings(w http.ResponseWriter, r *http.Request) {
	out, err := s.settingsPayload(r.Context())
	if err != nil {
		httpError(w, err)
		return
	}
	writeJSON(w, out)
}

// putSettings: PUT /api/settings {panel, global}. Saves the panel file and
// runs `ddev config global` for the global values that changed. The
// response carries the fresh settings, which flags were applied and what
// ddev printed.
func (s *Server) putSettings(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Panel  PanelSettings  `json:"panel"`
		Global GlobalSettings `json:"global"`
	}
	if err := readJSON(r, &in); err != nil {
		http.Error(w, "bad JSON", http.StatusBadRequest)
		return
	}
	switch in.Panel.Terminal {
	case "Terminal", "iTerm2", "Warp":
	default:
		http.Error(w, "unknown terminal app", http.StatusBadRequest)
		return
	}
	switch in.Panel.Window {
	case "app", "tab":
	default:
		http.Error(w, "window must be app or tab", http.StatusBadRequest)
		return
	}
	if in.Panel.DefaultPHP != "" && !validPHP.MatchString(in.Panel.DefaultPHP) {
		http.Error(w, "PHP version must look like 8.3", http.StatusBadRequest)
		return
	}
	for _, p := range []string{in.Global.RouterHTTPPort, in.Global.RouterHTTPSPort} {
		if n, err := strconv.Atoi(p); !validPort.MatchString(p) || err != nil || n < 1 || n > 65535 {
			http.Error(w, "ports must be between 1 and 65535", http.StatusBadRequest)
			return
		}
	}
	if !validTLD.MatchString(in.Global.ProjectTLD) {
		http.Error(w, "the TLD may contain lowercase letters, digits, dots and dashes", http.StatusBadRequest)
		return
	}
	if err := s.savePanel(in.Panel); err != nil {
		httpError(w, err)
		return
	}

	current, err := s.global(r.Context())
	if err != nil {
		httpError(w, err)
		return
	}
	var args []string
	if in.Global.RouterHTTPPort != current.RouterHTTPPort {
		args = append(args, "--router-http-port="+in.Global.RouterHTTPPort)
	}
	if in.Global.RouterHTTPSPort != current.RouterHTTPSPort {
		args = append(args, "--router-https-port="+in.Global.RouterHTTPSPort)
	}
	if in.Global.ProjectTLD != current.ProjectTLD {
		args = append(args, "--project-tld="+in.Global.ProjectTLD)
	}
	var output []string
	if len(args) > 0 {
		full := append([]string{"config", "global"}, args...)
		output = append(output, "$ ddev "+strings.Join(full, " "))
		if err := s.DDEV.Stream(r.Context(), func(l string) { output = append(output, l) }, full...); err != nil {
			httpError(w, fmt.Errorf("%w\n%s", err, strings.Join(output, "\n")))
			return
		}
		s.logf("settings: %s", strings.Join(full, " "))
	}
	out, err := s.settingsPayload(r.Context())
	if err != nil {
		httpError(w, err)
		return
	}
	writeJSON(w, map[string]any{"settings": out, "applied": args, "output": output})
}

// ---- lifecycle -----------------------------------------------------------

// startedMu guards started: the projects this daemon has started (start,
// restart, create). Only these are stopped on quit.
var startedMu sync.Mutex

func (s *Server) markStarted(name string) {
	startedMu.Lock()
	if s.started == nil {
		s.started = map[string]bool{}
	}
	s.started[name] = true
	startedMu.Unlock()
}

// quitState is ~/.ddev-desktop/state.json: what the panel had running when
// it last quit, for start-on-launch.
type quitState struct {
	RunningAtQuit []string  `json:"running_at_quit"`
	QuitAt        time.Time `json:"quit_at"`
}

// OnLaunch starts the projects recorded at the last quit, when the panel
// setting asks for it. They run as ordinary jobs so the page can attach.
func (s *Server) OnLaunch() {
	if s.jobs == nil {
		s.jobs = newJobs()
	}
	p := s.Panel()
	s.DDEV.Verbose.Store(p.Verbose)
	if !p.StartOnLaunch {
		return
	}
	var st quitState
	data, err := os.ReadFile(s.statePath())
	if err != nil || json.Unmarshal(data, &st) != nil || len(st.RunningAtQuit) == 0 {
		return
	}
	for _, name := range st.RunningAtQuit {
		if !ddev.ValidName(name) {
			continue
		}
		name := name
		s.markStarted(name)
		j := s.jobs.start(name, "start", "ddev start "+name+"   (was running at last quit)", func(line func(string)) error {
			return s.DDEV.Stream(context.Background(), line, "start", name)
		})
		s.logf("launch: job %s: %s", j.id, j.title)
	}
}

// OnQuit records the panel-started projects that are still running and,
// when the setting asks for it, stops them with `ddev stop` (never
// `ddev poweroff`: other projects are none of the panel's business).
func (s *Server) OnQuit(ctx context.Context) {
	startedMu.Lock()
	var names []string
	for n := range s.started {
		names = append(names, n)
	}
	startedMu.Unlock()
	var running []string
	if len(names) > 0 {
		projects, err := s.DDEV.List(ctx)
		if err != nil {
			s.logf("quit: ddev list: %v", err)
		}
		for _, p := range projects {
			if p.Status == "running" {
				for _, n := range names {
					if n == p.Name {
						running = append(running, n)
					}
				}
			}
		}
	}
	st := quitState{RunningAtQuit: running, QuitAt: time.Now()}
	if data, err := json.MarshalIndent(st, "", " "); err == nil && s.StateDir != "" {
		_ = os.WriteFile(s.statePath(), data, 0o600)
	}
	if !s.Panel().StopOnQuit {
		return
	}
	for _, n := range running {
		s.logf("quit: ddev stop %s", n)
		if err := s.DDEV.Stream(ctx, func(string) {}, "stop", n); err != nil {
			s.logf("quit: ddev stop %s: %v", n, err)
		}
	}
}
