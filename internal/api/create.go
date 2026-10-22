package api

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"time"

	"github.com/cellear/ddev-desktop/internal/ddev"
)

// Sprint 3: creating and importing projects.

// projectTypes is what `ddev config --project-type` accepts (DDEV 1.25).
var projectTypes = map[string]bool{}

func init() {
	for _, t := range strings.Fields(`asterios backdrop cakephp codeigniter craftcms drupal drupal6
		drupal7 drupal8 drupal9 drupal10 drupal11 drupal12 generic joomla laravel magento magento2
		maho modx php shopware6 silverstripe symfony typo3 wordpress wp-bedrock`) {
		projectTypes[t] = true
	}
}

// composerPackage is what "New Drupal site" creates in an empty folder.
func composerPackage(projectType string) string {
	switch projectType {
	case "drupal10":
		return "drupal/recommended-project:^10"
	case "drupal11":
		return "drupal/recommended-project:^11"
	case "drupal12":
		return "drupal/recommended-project:^12"
	case "drupal":
		return "drupal/recommended-project"
	}
	return ""
}

var dumpExt = regexp.MustCompile(`(?i)\.(sql|sql\.gz|gz|tar|tar\.gz|tgz|tar\.bz2|bz2|tar\.xz|xz|zip)$`)

// expandPath turns ~ and relative paths into a clean absolute path.
func expandPath(p string) (string, error) {
	p = strings.TrimSpace(p)
	if p == "" {
		return "", errors.New("empty path")
	}
	if p == "~" || strings.HasPrefix(p, "~/") {
		home, err := os.UserHomeDir()
		if err != nil {
			return "", err
		}
		p = filepath.Join(home, p[1:])
	}
	if !filepath.IsAbs(p) {
		return "", fmt.Errorf("path must be absolute: %s", p)
	}
	return filepath.Clean(p), nil
}

type checkResult struct {
	AppRoot   string `json:"approot"`
	Exists    bool   `json:"exists"`
	IsDir     bool   `json:"is_dir"`
	Empty     bool   `json:"empty"`
	HasDdev   bool   `json:"has_ddev"`
	DdevName  string `json:"ddev_name"`
	DdevType  string `json:"ddev_type"`
	NameTaken bool   `json:"name_taken"`
	Suggested string `json:"suggested_name"`
	Docroot   string `json:"docroot"`
	Error     string `json:"error,omitempty"`
}

var configKey = regexp.MustCompile(`(?m)^(name|type):\s*(\S+)\s*$`)

// inspect looks at a folder the way the dialog needs: does it exist, is it
// empty, is it already a project, what docroot would ddev find.
func inspect(approot string) checkResult {
	c := checkResult{AppRoot: approot}
	st, err := os.Stat(approot)
	if err != nil {
		return c
	}
	c.Exists = true
	c.IsDir = st.IsDir()
	if !c.IsDir {
		return c
	}
	entries, _ := os.ReadDir(approot)
	c.Empty = true
	for _, e := range entries {
		if e.Name() != ".DS_Store" {
			c.Empty = false
			break
		}
	}
	if data, err := os.ReadFile(filepath.Join(approot, ".ddev", "config.yaml")); err == nil {
		c.HasDdev = true
		for _, m := range configKey.FindAllStringSubmatch(string(data), -1) {
			v := strings.Trim(m[2], `"'`)
			switch m[1] {
			case "name":
				c.DdevName = v
			case "type":
				c.DdevType = v
			}
		}
	}
	for _, d := range []string{"web", "docroot", "htdocs", "public", "html"} {
		if st, err := os.Stat(filepath.Join(approot, d)); err == nil && st.IsDir() {
			c.Docroot = d
			break
		}
	}
	return c
}

var nonSlug = regexp.MustCompile(`[^a-z0-9-]+`)

// slug makes a DDEV-friendly project name from a folder name.
func slug(base string) string {
	s := nonSlug.ReplaceAllString(strings.ToLower(base), "-")
	s = strings.Trim(s, "-")
	if s == "" {
		s = "site"
	}
	return s
}

func nameInList(projects []ddev.Project, name string) bool {
	for _, p := range projects {
		if strings.EqualFold(p.Name, name) {
			return true
		}
	}
	return false
}

// recentList returns the project list, reusing one fetched within the last
// few seconds. The check endpoint runs on every keystroke in the dialog and
// `ddev list` takes a second or two with many projects.
func (s *Server) recentList(ctx context.Context) ([]ddev.Project, error) {
	s.listMu.Lock()
	defer s.listMu.Unlock()
	if time.Since(s.listAt) < 5*time.Second && s.listCache != nil {
		return s.listCache, nil
	}
	projects, err := s.DDEV.List(ctx)
	if err != nil {
		return nil, err
	}
	s.listCache, s.listAt = projects, time.Now()
	return projects, nil
}

// check: GET /api/check?approot=...&name=...
func (s *Server) check(w http.ResponseWriter, r *http.Request) {
	approot, err := expandPath(r.URL.Query().Get("approot"))
	if err != nil {
		writeJSON(w, checkResult{Error: err.Error()})
		return
	}
	c := inspect(approot)
	projects, err := s.recentList(r.Context())
	if err != nil {
		httpError(w, err)
		return
	}
	name := strings.TrimSpace(r.URL.Query().Get("name"))
	if name != "" {
		// The folder's own project may keep its name.
		c.NameTaken = nameInList(projects, name) && !(c.HasDdev && strings.EqualFold(c.DdevName, name))
	}
	base := slug(filepath.Base(approot))
	c.Suggested = base
	for i := 2; nameInList(projects, c.Suggested) && !(c.HasDdev && strings.EqualFold(c.DdevName, c.Suggested)); i++ {
		c.Suggested = fmt.Sprintf("%s-%d", base, i)
	}
	writeJSON(w, c)
}

type createSpec struct {
	AppRoot string `json:"approot"`
	Name    string `json:"name"`
	Type    string `json:"type"`
	PHP     string `json:"php"`
	Docroot string `json:"docroot"`
	Dump    string `json:"dump"`
	Create  bool   `json:"create"` // fresh Drupal codebase via Composer
}

// createProject: POST /api/projects. Validates, then runs config, start,
// optional composer create-project and optional import-db as one job.
func (s *Server) createProject(w http.ResponseWriter, r *http.Request) {
	var spec createSpec
	if err := readJSON(r, &spec); err != nil {
		http.Error(w, "bad JSON", http.StatusBadRequest)
		return
	}
	bad := func(msg string) { http.Error(w, msg, http.StatusBadRequest) }
	approot, err := expandPath(spec.AppRoot)
	if err != nil {
		bad(err.Error())
		return
	}
	if !ddev.ValidName(spec.Name) {
		bad("project name may contain letters, digits, dots, dashes and underscores")
		return
	}
	if spec.Type != "" && !projectTypes[spec.Type] {
		bad("unknown project type " + spec.Type)
		return
	}
	if spec.PHP != "" && !validPHP.MatchString(spec.PHP) {
		bad("PHP version must look like 8.3")
		return
	}
	if spec.Docroot != "" && (filepath.IsAbs(spec.Docroot) || strings.Contains(spec.Docroot, "..")) {
		bad("docroot must be a folder inside the project")
		return
	}
	dump := ""
	if spec.Dump != "" {
		dump, err = expandPath(spec.Dump)
		if err != nil {
			bad("dump: " + err.Error())
			return
		}
		if st, err := os.Stat(dump); err != nil || st.IsDir() {
			bad("dump file not found: " + dump)
			return
		}
		if !dumpExt.MatchString(dump) {
			bad("dump must be .sql, .sql.gz, .tar.gz, .tgz, .zip, .bz2 or .xz")
			return
		}
	}

	c := inspect(approot)
	pkg := composerPackage(spec.Type)
	switch {
	case !c.Exists && !spec.Create:
		bad("folder not found: " + approot)
		return
	case c.Exists && !c.IsDir:
		bad("not a folder: " + approot)
		return
	case spec.Create && c.Exists && !c.Empty:
		bad("a fresh Drupal codebase needs an empty folder")
		return
	case !spec.Create && c.Exists && c.Empty:
		bad("the folder is empty; choose one that holds the site's code")
		return
	case spec.Create && pkg == "":
		bad("a fresh codebase can only be created for a Drupal project type")
		return
	case c.HasDdev && c.DdevName != "" && !strings.EqualFold(c.DdevName, spec.Name):
		http.Error(w, fmt.Sprintf("this folder is already the DDEV project %q", c.DdevName), http.StatusConflict)
		return
	}
	projects, err := s.DDEV.List(r.Context())
	if err != nil {
		httpError(w, err)
		return
	}
	if nameInList(projects, spec.Name) && !(c.HasDdev && strings.EqualFold(c.DdevName, spec.Name)) {
		http.Error(w, fmt.Sprintf("a project named %q already exists", spec.Name), http.StatusConflict)
		return
	}

	docroot := spec.Docroot
	if spec.Create && docroot == "" {
		docroot = "web" // drupal/recommended-project's docroot
	}
	configArgs := []string{"config", "--auto", "--project-name", spec.Name}
	if spec.Type != "" {
		configArgs = append(configArgs, "--project-type", spec.Type)
	}
	if spec.PHP != "" {
		configArgs = append(configArgs, "--php-version", spec.PHP)
	}
	if docroot != "" {
		configArgs = append(configArgs, "--docroot", docroot)
	}

	title := "ddev config + start " + spec.Name
	if spec.Create {
		title += " + composer create-project"
	}
	if dump != "" {
		title += " + import-db"
	}
	j := s.jobs.start(title, func(line func(string)) error {
		ctx := context.Background()
		if spec.Create {
			line("Creating " + approot)
			if err := os.MkdirAll(approot, 0o755); err != nil {
				return err
			}
		}
		line("$ ddev " + strings.Join(configArgs, " ") + "   (in " + approot + ")")
		if err := s.DDEV.StreamIn(ctx, approot, line, configArgs...); err != nil {
			return err
		}
		line("$ ddev start " + spec.Name)
		if err := s.DDEV.Stream(ctx, line, "start", spec.Name); err != nil {
			return err
		}
		if spec.Create {
			line("$ ddev composer create-project " + pkg + "   (this takes a few minutes)")
			if err := s.DDEV.StreamIn(ctx, approot, line, "composer", "create-project", pkg); err != nil {
				return err
			}
		}
		if dump != "" {
			line("$ ddev import-db " + spec.Name + " --file=" + dump)
			if err := s.DDEV.Stream(ctx, line, "import-db", spec.Name, "--file="+dump, "--no-progress"); err != nil {
				return err
			}
		}
		line("Done.")
		return nil
	})
	s.logf("job %s: %s", j.id, j.title)
	writeJSON(w, map[string]any{"job": j.id, "title": j.title, "name": spec.Name})
}

// choose: POST /api/choose {"kind":"folder"|"file"} opens the system
// file chooser and returns the chosen path; 204 when the user cancels.
// macOS only for now.
func (s *Server) choose(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Kind string `json:"kind"`
	}
	_ = readJSON(r, &body)
	if runtime.GOOS != "darwin" {
		http.Error(w, "no file chooser on this platform", http.StatusNotImplemented)
		return
	}
	verb, prompt := "choose folder", "Choose the project's code folder"
	if body.Kind == "file" {
		verb, prompt = "choose file", "Choose a database dump"
	}
	script := fmt.Sprintf(`tell application "System Events"
	activate
	set p to POSIX path of (%s with prompt %s)
end tell
p`, verb, appleQuote(prompt))
	var out, stderr bytes.Buffer
	cmd := exec.CommandContext(r.Context(), "osascript", "-e", script)
	cmd.Stdout = &out
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		if strings.Contains(stderr.String(), "-128") { // user cancelled
			w.WriteHeader(http.StatusNoContent)
			return
		}
		httpError(w, fmt.Errorf("chooser: %s", strings.TrimSpace(stderr.String())))
		return
	}
	path := strings.TrimRight(out.String(), "\n/")
	writeJSON(w, map[string]string{"path": path})
}

// features tells the page what this platform can do.
func (s *Server) features(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, map[string]any{
		"chooser": runtime.GOOS == "darwin",
		"os":      runtime.GOOS,
	})
}
