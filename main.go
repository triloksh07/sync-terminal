package main

import (
	"embed"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
)

//go:embed payload/* node-bin/*
var embeddedFiles embed.FS

// Version is dynamically injected at build time via Go ldflags. 
// It defaults to "dev" for local sandbox testing.
var Version = "dev"

func main() {
	// 1. Define where the payload will unpack on the user's machine
	cacheDir := filepath.Join(os.TempDir(), "syncpty-cache-"+Version)

	// 2. Unpack if it doesn't exist yet
	if _, err := os.Stat(cacheDir); os.IsNotExist(err) {
		unpack(cacheDir)
	}

	// 3. Determine the correct Node executable path based on OS
	nodeExe := "node"
	if os.Getenv("OS") == "Windows_NT" {
		nodeExe = "node.exe"
	}
	nodePath := filepath.Join(cacheDir, "node-bin", nodeExe)
	cliPath := filepath.Join(cacheDir, "payload", "syncpty.js")

	// 4. Pass execution to Node
	cmd := exec.Command(nodePath, append([]string{cliPath}, os.Args[1:]...)...)
	cmd.Stdin = os.Stdin
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	err := cmd.Run()
	if err != nil {
		os.Exit(1)
	}
}

func unpack(dest string) {
	fs.WalkDir(embeddedFiles, ".", func(path string, d fs.DirEntry, err error) error {
		if err != nil { return err }
		outPath := filepath.Join(dest, path)
		if d.IsDir() {
			return os.MkdirAll(outPath, 0755)
		}
		data, _ := embeddedFiles.ReadFile(path)
		return os.WriteFile(outPath, data, 0755)
	})
}
