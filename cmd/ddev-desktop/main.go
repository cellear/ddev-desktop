// ddev-desktop serves the DDEV Desktop page on 127.0.0.1 and runs ddev on
// its behalf. Run it with no arguments: it picks a free port, opens the
// browser, and keeps running until interrupted. A second run while one is
// already up just opens the browser on the running one.
package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"runtime"
	"syscall"
	"time"

	"github.com/cellear/ddev-desktop/internal/api"
	"github.com/cellear/ddev-desktop/internal/ddev"
	"github.com/cellear/ddev-desktop/ui"
)

// daemonInfo is written to ~/.ddev-desktop/daemon.json while running so a
// second launch can find the first.
type daemonInfo struct {
	PID   int    `json:"pid"`
	Port  int    `json:"port"`
	Token string `json:"token"`
	URL   string `json:"url"`
}

func main() {
	port := flag.Int("port", 0, "port to listen on (default: a free one)")
	limit := flag.Int("limit", 20, "maximum number of projects to show")
	noOpen := flag.Bool("no-open", false, "do not open the browser")
	stateFlag := flag.String("state-dir", "", "where daemon.json, settings.json and state.json live (default ~/.ddev-desktop)")
	flag.Parse()

	logger := log.New(os.Stderr, "ddev-desktop: ", log.Ltime)

	dir, err := stateDir(*stateFlag)
	if err != nil {
		logger.Fatal(err)
	}
	infoPath := filepath.Join(dir, "daemon.json")

	if running, ok := alive(infoPath); ok {
		logger.Printf("already running at %s (pid %d)", running.URL, running.PID)
		if !*noOpen {
			openBrowser(running.URL)
		}
		return
	}

	if _, err := exec.LookPath("ddev"); err != nil {
		logger.Fatal("ddev was not found on PATH; install DDEV first")
	}

	static, err := ui.Dist()
	if err != nil {
		logger.Fatal(err)
	}

	ln, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", *port))
	if err != nil {
		logger.Fatal(err)
	}
	actualPort := ln.Addr().(*net.TCPAddr).Port
	token := newToken()
	url := fmt.Sprintf("http://127.0.0.1:%d/?token=%s", actualPort, token)

	info := daemonInfo{PID: os.Getpid(), Port: actualPort, Token: token, URL: url}
	if err := writeInfo(infoPath, info); err != nil {
		logger.Fatal(err)
	}
	defer os.Remove(infoPath)

	runner := ddev.New()
	runner.Log = logger
	server := &api.Server{
		DDEV:     runner,
		Token:    token,
		Limit:    *limit,
		Static:   static,
		Log:      logger,
		StateDir: dir,
	}
	srv := &http.Server{
		Handler:           server.Handler(),
		ReadHeaderTimeout: 10 * time.Second,
	}
	server.OnLaunch()

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	go func() {
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		srv.Shutdown(shutdownCtx)
	}()

	logger.Printf("listening on %s", url)
	if !*noOpen {
		openBrowser(url)
	}
	if err := srv.Serve(ln); err != nil && !errors.Is(err, http.ErrServerClosed) {
		logger.Fatal(err)
	}
	// Record what the panel had running and, if asked, stop it. ddev stop
	// takes a few seconds per project.
	quitCtx, cancelQuit := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancelQuit()
	server.OnQuit(quitCtx)
	logger.Print("stopped")
}

func stateDir(override string) (string, error) {
	dir := override
	if dir == "" {
		home, err := os.UserHomeDir()
		if err != nil {
			return "", err
		}
		dir = filepath.Join(home, ".ddev-desktop")
	}
	return dir, os.MkdirAll(dir, 0o700)
}

func writeInfo(path string, info daemonInfo) error {
	data, err := json.MarshalIndent(info, "", " ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0o600)
}

// alive reads daemon.json and asks that daemon whether it is still there.
func alive(path string) (daemonInfo, bool) {
	var info daemonInfo
	data, err := os.ReadFile(path)
	if err != nil {
		return info, false
	}
	if err := json.Unmarshal(data, &info); err != nil || info.Port == 0 {
		return info, false
	}
	client := &http.Client{Timeout: 2 * time.Second}
	resp, err := client.Get(fmt.Sprintf("http://127.0.0.1:%d/api/health?token=%s", info.Port, info.Token))
	if err != nil {
		os.Remove(path) // stale
		return info, false
	}
	resp.Body.Close()
	return info, resp.StatusCode == http.StatusOK
}

func newToken() string {
	b := make([]byte, 16)
	rand.Read(b)
	return hex.EncodeToString(b)
}

func openBrowser(url string) {
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
		log.Printf("open browser: %v (open %s yourself)", err, url)
	}
}
