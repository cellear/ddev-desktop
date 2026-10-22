package ddev

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func fixture(t *testing.T, name string) []byte {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("..", "..", "testdata", name))
	if err != nil {
		t.Fatal(err)
	}
	return data
}

func TestParseList(t *testing.T) {
	var projects []Project
	if err := ParseJSON(fixture(t, "list.json"), &projects); err != nil {
		t.Fatal(err)
	}
	if len(projects) != 20 {
		t.Fatalf("want 20 projects, got %d", len(projects))
	}
	p := projects[0]
	if p.Name != "DCMS-26-08-06" || p.Type != "drupal11" || p.Status != "stopped" {
		t.Errorf("unexpected first project: %+v", p)
	}
	if p.AppRoot == "" || p.HTTPURL == "" || p.MailpitURL == "" {
		t.Errorf("missing fields: %+v", p)
	}
}

func TestParseDescribe(t *testing.T) {
	var d Details
	if err := ParseJSON(fixture(t, "describe-running.json"), &d); err != nil {
		t.Fatal(err)
	}
	if d.Name != "dropsuite" || d.Status != "running" || d.PHPVersion != "8.3" {
		t.Errorf("unexpected details: %+v", d.Project)
	}
	if d.Database.Type != "mariadb" || d.Database.Version != "11.8" || d.Database.Name != "db" {
		t.Errorf("unexpected database: %+v", d.Database)
	}
	if d.Services["web"].Status != "running" || d.Services["db"].Status != "running" {
		t.Errorf("unexpected services: %+v", d.Services)
	}

	var stopped Details
	if err := ParseJSON(fixture(t, "describe-stopped.json"), &stopped); err != nil {
		t.Fatal(err)
	}
	if stopped.Status != "stopped" || stopped.Services["web"].Status != "stopped" {
		t.Errorf("unexpected stopped details: %+v", stopped)
	}
}

func TestParseFatal(t *testing.T) {
	data := []byte(`{"level":"fatal","msg":"Failed to describe project(s): could not find requested project 'x'","time":"2026-10-22T16:04:17-07:00"}`)
	var d Details
	err := ParseJSON(data, &d)
	if err == nil || err.Error() == "" {
		t.Fatal("want an error from a fatal log line")
	}
}

func TestParseLogThenPayload(t *testing.T) {
	data := []byte(`{"level":"info","msg":"something first","time":"t"}
{"level":"info","msg":"","raw":[{"name":"a","status":"running"}],"time":"t"}`)
	var projects []Project
	if err := ParseJSON(data, &projects); err != nil {
		t.Fatal(err)
	}
	if len(projects) != 1 || projects[0].Name != "a" {
		t.Errorf("got %+v", projects)
	}
}

func TestValidName(t *testing.T) {
	for _, ok := range []string{"dropsuite", "DCMS-26-08-06", "a.b_c"} {
		if !ValidName(ok) {
			t.Errorf("%q should be valid", ok)
		}
	}
	for _, bad := range []string{"", "-flag", "has space", "semi;colon", "../x"} {
		if ValidName(bad) {
			t.Errorf("%q should be invalid", bad)
		}
	}
}

func TestLastUsedAndSort(t *testing.T) {
	dir := t.TempDir()
	mk := func(name string, files map[string]time.Time) string {
		root := filepath.Join(dir, name)
		if err := os.MkdirAll(filepath.Join(root, ".ddev"), 0o755); err != nil {
			t.Fatal(err)
		}
		for f, when := range files {
			p := filepath.Join(root, ".ddev", f)
			if err := os.WriteFile(p, []byte("x"), 0o644); err != nil {
				t.Fatal(err)
			}
			if err := os.Chtimes(p, when, when); err != nil {
				t.Fatal(err)
			}
		}
		return root
	}
	now := time.Now().Truncate(time.Second)
	started := mk("started", map[string]time.Time{
		"config.yaml":                    now.Add(-48 * time.Hour),
		".ddev-docker-compose-full.yaml": now.Add(-1 * time.Hour),
	})
	configured := mk("configured", map[string]time.Time{"config.yaml": now.Add(-24 * time.Hour)})
	empty := mk("empty", nil)

	if got := lastUsed(started); !got.Equal(now.Add(-1 * time.Hour)) {
		t.Errorf("started: got %v", got)
	}
	if got := lastUsed(configured); !got.Equal(now.Add(-24 * time.Hour)) {
		t.Errorf("configured: got %v", got)
	}
	if got := lastUsed(empty); !got.IsZero() {
		t.Errorf("empty: got %v", got)
	}

	projects := []Project{
		{Name: "zeta", LastUsed: lastUsed(empty)},
		{Name: "beta", LastUsed: lastUsed(configured)},
		{Name: "alpha", LastUsed: lastUsed(empty)},
		{Name: "gamma", LastUsed: lastUsed(started)},
	}
	SortByLastUsed(projects)
	want := []string{"gamma", "beta", "alpha", "zeta"}
	for i, w := range want {
		if projects[i].Name != w {
			t.Fatalf("order: got %v", names(projects))
		}
	}
}

func names(ps []Project) []string {
	out := make([]string, len(ps))
	for i, p := range ps {
		out[i] = p.Name
	}
	return out
}
