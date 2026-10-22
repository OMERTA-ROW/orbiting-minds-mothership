package companion

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
)

// ManifestEntry describes one built target. SigningStatus never claims
// "VERIFIED": this tool does not run platform verifiers.
type ManifestEntry struct {
	Platform      string `json:"platform"`
	Arch          string `json:"arch"`
	Artifact      string `json:"artifact_path"`
	SHA256        string `json:"sha256"`
	Fingerprint   string `json:"fingerprint_check"`
	SigningStatus string `json:"signing_status"`
}

func ReleaseManifest(dir string) ([]ManifestEntry, error) {
	if !filepath.IsAbs(dir) {
		return nil, errors.New("--dir must be an absolute path")
	}
	data, err := os.ReadFile(filepath.Join(dir, "source-manifest.json"))
	if err != nil {
		return nil, errors.New("source-manifest.json not found")
	}
	var m struct {
		Artifacts []struct {
			Target string `json:"target"`
			File   string `json:"file"`
			SHA256 string `json:"sha256"`
		} `json:"artifacts"`
	}
	if json.Unmarshal(data, &m) != nil || len(m.Artifacts) == 0 {
		return nil, errors.New("source-manifest.json is malformed or lists no artifacts")
	}
	out := []ManifestEntry{}
	for _, a := range m.Artifacts {
		parts := strings.SplitN(a.Target, "/", 2)
		if len(parts) != 2 || a.File == "" || strings.ContainsAny(a.File, `/\`) || a.File == ".." {
			return nil, errors.New("manifest contains an invalid artifact entry")
		}
		p := filepath.Join(dir, a.File)
		e := ManifestEntry{Platform: parts[0], Arch: parts[1], Artifact: p, SHA256: a.SHA256}
		switch got, err := sha256File(p); {
		case err != nil:
			e.Fingerprint = "MISSING FILE"
		case got != a.SHA256:
			e.Fingerprint = "MISMATCH (actual " + got + ")"
		default:
			e.Fingerprint = "MATCHES"
		}
		if _, err := os.Stat(p + ".sig"); err == nil {
			e.SigningStatus = "SIGNATURE FILE PRESENT — NOT VERIFIED HERE"
		} else {
			e.SigningStatus = "UNSIGNED"
		}
		out = append(out, e)
	}
	return out, nil
}
