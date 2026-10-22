package companion

import (
	"bufio"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
)

// ReleaseReport is the result of checking a staged release directory.
// Hash checks are real. Signature status is only "VERIFIED" when a platform
// verifier has been run and recorded by CI; this code never asserts it.
type ReleaseReport struct {
	Files      int      `json:"files_checked"`
	HashErrors []string `json:"hash_errors"`
	Signed     string   `json:"signature_status"`
	Missing    []string `json:"missing_signature_files"`
	Verdict    string   `json:"verdict"`
}

func sha256File(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()
	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return "", err
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}

func VerifyRelease(dir string) (ReleaseReport, error) {
	r := ReleaseReport{HashErrors: []string{}, Missing: []string{}}
	if !filepath.IsAbs(dir) {
		return r, errors.New("--dir must be an absolute path")
	}
	sums, err := os.Open(filepath.Join(dir, "SHA256SUMS"))
	if err != nil {
		return r, errors.New("SHA256SUMS not found")
	}
	defer sums.Close()
	scan := bufio.NewScanner(sums)
	for scan.Scan() {
		parts := strings.Fields(scan.Text())
		if len(parts) != 2 || len(parts[0]) != 64 || strings.ContainsAny(parts[1], `/\`) || parts[1] == ".." {
			r.HashErrors = append(r.HashErrors, "malformed line")
			continue
		}
		r.Files++
		got, err := sha256File(filepath.Join(dir, parts[1]))
		if err != nil {
			r.HashErrors = append(r.HashErrors, parts[1]+": missing")
		} else if got != parts[0] {
			r.HashErrors = append(r.HashErrors, parts[1]+": checksum mismatch")
		}
		// Expected detached signature produced by the release pipeline (cosign/minisign).
		if _, err := os.Stat(filepath.Join(dir, parts[1]+".sig")); err != nil {
			r.Missing = append(r.Missing, parts[1]+".sig")
		}
	}
	if r.Files == 0 {
		r.HashErrors = append(r.HashErrors, "no artifacts listed")
	}
	var manifest struct {
		Signed bool `json:"signed"`
	}
	if data, err := os.ReadFile(filepath.Join(dir, "source-manifest.json")); err == nil {
		_ = json.Unmarshal(data, &manifest)
	}
	switch {
	case len(r.Missing) == 0 && r.Files > 0:
		r.Signed = "SIGNATURE FILES PRESENT — NOT VERIFIED HERE; run platform verifiers (cosign verify-blob, codesign/spctl, signtool verify)"
	case manifest.Signed:
		r.Signed = "INVALID CLAIM: manifest says signed but signature files are missing"
	default:
		r.Signed = "UNSIGNED"
	}
	if len(r.HashErrors) > 0 || strings.HasPrefix(r.Signed, "INVALID") {
		r.Verdict = "REJECT: do not distribute"
	} else {
		r.Verdict = fmt.Sprintf("HASHES OK for %d files; not a trusted release until signatures are verified", r.Files)
	}
	return r, nil
}
