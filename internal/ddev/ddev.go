// Package ddev runs the ddev command line and turns its JSON output into
// Go values. It is the only place in the program that executes ddev.
package ddev

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"
)

// Project is one entry of `ddev list -j`.
type Project struct {
	Name            string `json:"name"`
	Status          string `json:"status"`
	StatusDesc      string `json:"status_desc"`
	Type            string `json:"type"`
	AppRoot         string `json:"approot"`
	ShortRoot       string `json:"shortroot"`
	Docroot         string `json:"docroot"`
	HTTPURL         string `json:"httpurl"`
	HTTPSURL        string `json:"httpsurl"`
	PrimaryURL      string `json:"primary_url"`
	MailpitURL      string `json:"mailpit_url"`
	MailpitHTTPSURL string `json:"mailpit_https_url"`

	// LastUsed is when the project was last started (see lastUsed); zero
	// when nothing in the project tells us.
	LastUsed time.Time `json:"last_used"`
}

// Service is one container of a project as reported by `ddev describe -j`.
type Service struct {
	Status   string `json:"status"`
	FullName string `json:"full_name"`
	Image    string `json:"image"`
}

// DBInfo is the database part of `ddev describe -j`.
type DBInfo struct {
	Type    string `json:"database_type"`
	Version string `json:"database_version"`
	Name    string `json:"dbname"`
}

// Details is `ddev describe -j` for one project.
type Details struct {
	Project
	Hostname      string             `json:"hostname"`
	PHPVersion    string             `json:"php_version"`
	WebserverType string             `json:"webserver_type"`
	NodeJSVersion string             `json:"nodejs_version"`
	Database      DBInfo             `json:"dbinfo"`
	Services      map[string]Service `json:"services"`
}

// Runner executes ddev. Bin is the executable (default "ddev", found on PATH).
type Runner struct {
	Bin string
}

// New returns a Runner that uses the ddev on PATH.
func New() *Runner { return &Runner{Bin: "ddev"} }

// validName is what we accept as a project name before handing it to ddev.
// It also keeps a name from ever being read as a flag.
var validName = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._-]*$`)

// ValidName reports whether name is safe to pass to ddev as a project name.
func ValidName(name string) bool { return validName.MatchString(name) }

func (r *Runner) command(ctx context.Context, args ...string) *exec.Cmd {
	cmd := exec.CommandContext(ctx, r.Bin, args...)
	cmd.Env = append(os.Environ(),
		"DDEV_NONINTERACTIVE=true",
		"NO_COLOR=1",
		"TERM=dumb",
	)
	return cmd
}

// List returns every project ddev knows about, most recently used first
// (ties by name).
func (r *Runner) List(ctx context.Context) ([]Project, error) {
	var projects []Project
	if err := r.runJSON(ctx, &projects, "list"); err != nil {
		return nil, err
	}
	for i := range projects {
		projects[i].LastUsed = lastUsed(projects[i].AppRoot)
	}
	SortByLastUsed(projects)
	return projects, nil
}

// SortByLastUsed orders projects most recently used first, then by name.
func SortByLastUsed(projects []Project) {
	sort.SliceStable(projects, func(i, j int) bool {
		a, b := projects[i], projects[j]
		if !a.LastUsed.Equal(b.LastUsed) {
			return a.LastUsed.After(b.LastUsed)
		}
		return strings.ToLower(a.Name) < strings.ToLower(b.Name)
	})
}

// lastUsed returns when the project at approot was last started. ddev
// rewrites .ddev/.ddev-docker-compose-full.yaml on every start, so its
// modification time is that moment. A project that was configured but
// never started falls back to config.yaml's time; one with no .ddev at all
// reports the zero time.
func lastUsed(approot string) time.Time {
	for _, name := range []string{".ddev-docker-compose-full.yaml", "config.yaml"} {
		if st, err := os.Stat(filepath.Join(approot, ".ddev", name)); err == nil {
			return st.ModTime()
		}
	}
	return time.Time{}
}

// Describe returns the details of one project.
func (r *Runner) Describe(ctx context.Context, name string) (*Details, error) {
	if !ValidName(name) {
		return nil, fmt.Errorf("invalid project name %q", name)
	}
	var d Details
	if err := r.runJSON(ctx, &d, "describe", name); err != nil {
		return nil, err
	}
	return &d, nil
}

// runJSON runs ddev with --json-output and decodes the "raw" payload into out.
func (r *Runner) runJSON(ctx context.Context, out any, args ...string) error {
	cmd := r.command(ctx, append(args, "--json-output")...)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	runErr := cmd.Run()
	if err := ParseJSON(stdout.Bytes(), out); err != nil {
		if runErr != nil {
			// ddev logs its fatal message as JSON on stderr; prefer that text.
			if ferr := ParseJSON(stderr.Bytes(), new(json.RawMessage)); ferr != nil && ferr.Error() != "no JSON payload in ddev output" {
				return fmt.Errorf("ddev %s: %w", strings.Join(args, " "), ferr)
			}
			return fmt.Errorf("ddev %s: %w: %s", strings.Join(args, " "), runErr, strings.TrimSpace(stderr.String()))
		}
		return fmt.Errorf("ddev %s: %w", strings.Join(args, " "), err)
	}
	return nil
}

// ParseJSON finds the object carrying ddev's "raw" payload in data (ddev may
// print several JSON objects, one per log line) and decodes it into out. A
// "fatal" log object becomes an error.
func ParseJSON(data []byte, out any) error {
	dec := json.NewDecoder(bytes.NewReader(data))
	var found bool
	for {
		var obj struct {
			Level string          `json:"level"`
			Msg   string          `json:"msg"`
			Raw   json.RawMessage `json:"raw"`
		}
		if err := dec.Decode(&obj); err != nil {
			// End of input, or trailing non-JSON text: stop reading.
			break
		}
		if obj.Level == "fatal" || obj.Level == "error" {
			return errors.New(obj.Msg)
		}
		if len(obj.Raw) > 0 {
			if err := json.Unmarshal(obj.Raw, out); err != nil {
				return fmt.Errorf("decode raw: %w", err)
			}
			found = true
		}
	}
	if !found {
		return errors.New("no JSON payload in ddev output")
	}
	return nil
}

// Stream runs ddev with args and calls line for every line of combined
// output as it arrives. It returns when ddev exits; a non-zero exit is the
// returned error. The context cancels the command.
func (r *Runner) Stream(ctx context.Context, line func(string), args ...string) error {
	cmd := r.command(ctx, args...)
	pr, pw, err := os.Pipe()
	if err != nil {
		return err
	}
	cmd.Stdout = pw
	cmd.Stderr = pw
	if err := cmd.Start(); err != nil {
		pw.Close()
		pr.Close()
		return err
	}
	pw.Close()
	sc := bufio.NewScanner(pr)
	sc.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	for sc.Scan() {
		line(strings.TrimRight(sc.Text(), "\r"))
	}
	pr.Close()
	return cmd.Wait()
}
