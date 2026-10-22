package api

import (
	"crypto/rand"
	"encoding/hex"
	"sync"
	"time"
)

// job is one running or finished ddev command and everything it printed.
type job struct {
	id    string
	title string

	mu       sync.Mutex
	lines    []string
	done     bool
	err      string
	finished time.Time
	changed  chan struct{} // closed and replaced on every change
}

func (j *job) append(line string) {
	j.mu.Lock()
	j.lines = append(j.lines, line)
	j.bump()
	j.mu.Unlock()
}

func (j *job) finish(err error) {
	j.mu.Lock()
	j.done = true
	j.finished = time.Now()
	if err != nil {
		j.err = err.Error()
	}
	j.bump()
	j.mu.Unlock()
}

// bump wakes every waiter. Callers hold j.mu.
func (j *job) bump() {
	close(j.changed)
	j.changed = make(chan struct{})
}

// snapshot returns the lines from index from on, whether the job is done,
// its error text, and a channel that closes on the next change.
func (j *job) snapshot(from int) ([]string, bool, string, <-chan struct{}) {
	j.mu.Lock()
	defer j.mu.Unlock()
	var lines []string
	if from < len(j.lines) {
		lines = append(lines, j.lines[from:]...)
	}
	return lines, j.done, j.err, j.changed
}

// jobs is the registry. Finished jobs are kept for a while so a page that
// reconnects can still read the log, then dropped.
type jobs struct {
	mu   sync.Mutex
	byID map[string]*job
}

const keepFinished = 10 * time.Minute

func newJobs() *jobs { return &jobs{byID: map[string]*job{}} }

// start registers a job and runs fn in the background. fn receives the
// function to call for each output line.
func (js *jobs) start(title string, fn func(line func(string)) error) *job {
	j := &job{id: newID(), title: title, changed: make(chan struct{})}
	js.mu.Lock()
	js.purge()
	js.byID[j.id] = j
	js.mu.Unlock()
	go func() { j.finish(fn(j.append)) }()
	return j
}

func (js *jobs) get(id string) *job {
	js.mu.Lock()
	defer js.mu.Unlock()
	return js.byID[id]
}

// purge drops finished jobs older than keepFinished. Callers hold js.mu.
func (js *jobs) purge() {
	cutoff := time.Now().Add(-keepFinished)
	for id, j := range js.byID {
		j.mu.Lock()
		old := j.done && j.finished.Before(cutoff)
		j.mu.Unlock()
		if old {
			delete(js.byID, id)
		}
	}
}

func newID() string {
	b := make([]byte, 8)
	rand.Read(b)
	return hex.EncodeToString(b)
}
