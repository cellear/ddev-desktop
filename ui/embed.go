// Package ui embeds the built page. Run `npm run build` in this directory
// (or `make build` at the root) before `go build`; the embed fails without
// dist/.
package ui

import (
	"embed"
	"io/fs"
)

//go:embed all:dist
var dist embed.FS

// Dist is the built page with dist/ as its root.
func Dist() (fs.FS, error) { return fs.Sub(dist, "dist") }
