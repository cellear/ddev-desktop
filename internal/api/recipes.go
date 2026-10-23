package api

import (
	"archive/zip"
	"context"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// A recipe is how "New site…" puts a fresh codebase into an empty folder,
// following DDEV's own quickstart for that CMS
// (https://docs.ddev.com/en/stable/users/quickstart/).
//
// before runs after the folder is created and before `ddev config` (for
// code that must exist first, like an unpacked zip). after runs once the
// project is started (for anything that needs the web container, like
// Composer or WP-CLI).
type recipe struct {
	title   string // appended to the job title
	docroot string // what ddev config should be told, "" for the project root
	before  func(ctx context.Context, approot string, line func(string)) error
	after   func(ctx context.Context, s *Server, approot string, line func(string)) error
}

// recipeFor returns the recipe for a project type, or nil when the panel
// cannot create that type from scratch (it can still import it).
func recipeFor(projectType string) *recipe {
	if pkg := composerPackage(projectType); pkg != "" {
		return &recipe{
			title:   "composer create-project",
			docroot: "web", // drupal/recommended-project's docroot
			after: func(ctx context.Context, s *Server, approot string, line func(string)) error {
				line("$ ddev composer create-project " + pkg + "   (this takes a few minutes)")
				return s.DDEV.StreamIn(ctx, approot, line, "composer", "create-project", pkg)
			},
		}
	}
	switch projectType {
	case "wordpress":
		return &recipe{
			title: "wp core download",
			after: func(ctx context.Context, s *Server, approot string, line func(string)) error {
				line("$ ddev wp core download")
				return s.DDEV.StreamIn(ctx, approot, line, "wp", "core", "download")
			},
		}
	case "joomla":
		return &recipe{
			title: "joomla download",
			before: func(ctx context.Context, approot string, line func(string)) error {
				if err := downloadZip(ctx, joomlaLatest, approot, line); err != nil {
					return err
				}
				// From DDEV's Joomla quickstart: the installer needs these.
				ini := filepath.Join(approot, ".ddev", "php", "joomla.ini")
				line("Writing .ddev/php/joomla.ini (display_errors = off, output_buffering = off)")
				if err := os.MkdirAll(filepath.Dir(ini), 0o755); err != nil {
					return err
				}
				return os.WriteFile(ini, []byte("display_errors = off\noutput_buffering = off\n"), 0o644)
			},
		}
	}
	return nil
}

const joomlaLatest = "https://www.joomla.org/latest"

// downloadZip fetches a zip archive and unpacks it into dir, reporting
// progress through line. Entries that would land outside dir are refused.
func downloadZip(ctx context.Context, url, dir string, line func(string)) error {
	line("Downloading " + url)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	client := &http.Client{Timeout: 10 * time.Minute}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("download: %s", resp.Status)
	}
	if final := resp.Request.URL.String(); final != url {
		line("  → " + filepath.Base(final))
	}
	tmp, err := os.CreateTemp(dir, ".download-*.zip")
	if err != nil {
		return err
	}
	defer os.Remove(tmp.Name())
	defer tmp.Close()
	n, err := io.Copy(tmp, resp.Body)
	if err != nil {
		return fmt.Errorf("download: %w", err)
	}
	line(fmt.Sprintf("  %.1f MB received", float64(n)/1e6))

	zr, err := zip.NewReader(tmp, n)
	if err != nil {
		return fmt.Errorf("not a zip archive: %w", err)
	}
	line("Unpacking into " + dir)
	files := 0
	for _, f := range zr.File {
		dst := filepath.Join(dir, filepath.FromSlash(f.Name))
		if rel, err := filepath.Rel(dir, dst); err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
			return fmt.Errorf("refusing zip entry outside the folder: %s", f.Name)
		}
		if f.FileInfo().IsDir() {
			if err := os.MkdirAll(dst, 0o755); err != nil {
				return err
			}
			continue
		}
		if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
			return err
		}
		if err := extractFile(f, dst); err != nil {
			return err
		}
		files++
	}
	line(fmt.Sprintf("  %d files unpacked", files))
	return nil
}

func extractFile(f *zip.File, dst string) error {
	rc, err := f.Open()
	if err != nil {
		return err
	}
	defer rc.Close()
	mode := f.Mode().Perm()
	if mode == 0 {
		mode = 0o644
	}
	out, err := os.OpenFile(dst, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, mode)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, rc); err != nil {
		out.Close()
		return err
	}
	return out.Close()
}
