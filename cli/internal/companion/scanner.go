package companion

import (
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

type ScannerInfo struct {
	Engine      string `json:"engine"`
	Status      string `json:"status"`
	ScanStarted bool   `json:"scan_started"`
	Verdict     string `json:"verdict"`
}

// Fixed install locations, never PATH execution. Availability performs metadata
// inspection only, not --version or a scan. Filename presence is not trust.
func ScannerAvailability() ScannerInfo {
	info := ScannerInfo{Engine: "ClamAV clamscan", Status: "UNAVAILABLE: no supported installed scanner found", Verdict: "NOT SCANNED"}
	if runtime.GOOS != "linux" {
		info.Status = "UNSUPPORTED: native scanner adapter not verified on this host"
		return info
	}
	for _, filename := range []string{"/usr/bin/clamscan", "/usr/local/bin/clamscan"} {
		if safeScannerExecutable(filename) == nil {
			info.Status = "PRESENT: filename/permissions only; version/database/scan unverified"
			return info
		}
	}
	return info
}

func safeScannerExecutable(filename string) error {
	if !filepath.IsAbs(filename) || filepath.Clean(filename) != filename || filepath.Base(filename) != "clamscan" {
		return errors.New("unsupported scanner executable")
	}
	for current := filename; ; current = filepath.Dir(current) {
		stat, err := os.Lstat(current)
		if err != nil || stat.Mode()&os.ModeSymlink != 0 || (stat.Mode().Perm()&0022 != 0 && !(current == "/tmp" && stat.IsDir() && stat.Mode()&os.ModeSticky != 0)) {
			return errors.New("scanner path unavailable or writable/symlinked")
		}
		if current == filename {
			if !stat.Mode().IsRegular() || stat.Mode().Perm()&0111 == 0 {
				return errors.New("scanner not executable")
			}
		} else if !stat.IsDir() {
			return errors.New("scanner parent unsafe")
		}
		// Sticky /tmp is permitted for disposable adapter tests, never production discovery.
		if filepath.Dir(current) == current {
			break
		}
	}
	return nil
}

type ScanEvidence struct {
	Engine      string  `json:"engine"`
	Version     string  `json:"version"`
	Started     string  `json:"started"`
	Seconds     float64 `json:"seconds"`
	ExitCode    int     `json:"exit_code"`
	Result      string  `json:"result"`
	Output      string  `json:"output"`
	Truncated   bool    `json:"truncated"`
	Containment string  `json:"containment"`
}

