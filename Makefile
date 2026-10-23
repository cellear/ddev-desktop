BINARY=ddev-desktop
VERSION?=$(shell git describe --tags --always --dirty 2>/dev/null || echo dev)
LDFLAGS=-ldflags "-s -w -X main.version=$(VERSION)"

ui/dist: $(shell find ui/src ui/index.html ui/package.json -type f 2>/dev/null)
	cd ui && npm install --no-audit --no-fund && npm run build

build: ui/dist
	mkdir -p bin
	go build $(LDFLAGS) -o bin/$(BINARY) ./cmd/ddev-desktop

install: build
	mkdir -p $(HOME)/go/bin
	cp bin/$(BINARY) $(HOME)/go/bin/$(BINARY)

test:
	go test ./...

dist: ui/dist
	mkdir -p dist
	for os in darwin linux; do for arch in amd64 arm64; do \
	  GOOS=$$os GOARCH=$$arch go build $(LDFLAGS) -o dist/$(BINARY)-$$os-$$arch ./cmd/ddev-desktop; \
	done; done
	cd dist && shasum -a 256 $(BINARY)-* > checksums.txt

clean:
	rm -rf bin/ dist/ ui/dist/

.PHONY: build install test dist clean
