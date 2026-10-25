package companion

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

const storageMaxEntries = 5000
const storageMaxBytes = 256 << 20 // maximum selected candidate bytes, not a filesystem quota
const storageActiveAge = time.Hour

type StorageFile struct {
	Path     string `json:"path"`
	Category string `json:"category"`
	Bytes    int64  `json:"bytes"`
	Modified string `json:"modified"`
	Mode     uint32 `json:"mode"`
	Identity string `json:"identity"`
}

type StorageReport struct {
	Version         int              `json:"version"`
	Device          string           `json:"device"`
	Project         string           `json:"project"`
	Root            string           `json:"root"`
	At              string           `json:"at"`
	ObservedBytes   int64            `json:"observed_bytes"`
	ObservedFiles   int              `json:"observed_files"`
	ExcludedEntries int              `json:"excluded_entries"`
	CategoryBytes   map[string]int64 `json:"category_bytes"`
	LargeFiles      []StorageFile    `json:"large_files"`
	Candidates      []StorageFile    `json:"candidates"`
	FreeBytes       *uint64          `json:"free_bytes"`
	FreeStatus      string           `json:"free_status"`
	Boundary        string           `json:"boundary"`
	Complete        bool             `json:"complete"`
}

type CleanupPlan struct {
	Version        int            `json:"version"`
	Device         string         `json:"device"`
	Profile        ProjectProfile `json:"profile"`
	CreatedAt      string         `json:"created_at"`
	ExpiresAt      string         `json:"expires_at"`
	Categories     []string       `json:"categories"`
	Files          []StorageFile  `json:"files"`
	EstimatedBytes int64          `json:"estimated_bytes"`
	Exclusions     []string       `json:"exclusions"`
	Apply          string         `json:"apply"`
	SHA256         string         `json:"sha256"`
}

var storageExclusions = []string{"personal documents/media", "credentials/hidden configuration", "application data/dependencies", "backups/trash", "system paths", "symlinks/hardlinks", "unsafe owner/permissions", "files modified in last hour", "all categories except explicit Evolution cache/temp"}

func maintenanceTarget(p ProjectProfile, device string) error {
	if device != "local" {
		return errors.New("remote/unverified device denied; only exact --device local is supported")
	}
	if err := validateCurrentProject(p); err != nil {
		return err
	}
	if p.Root == string(filepath.Separator) {
		return errors.New("system root cannot be a maintenance target")
	}
	for _, denied := range []string{"/etc", "/usr", "/bin", "/sbin", "/var", "/proc", "/sys", "/dev", "/boot", "/opt", "/root", "/System", "/Library", "/Applications"} {
		if p.Root == denied || strings.HasPrefix(p.Root, denied+string(filepath.Separator)) {
			return errors.New("system locations cannot be maintenance targets")
		}
	}
	if home, err := os.UserHomeDir(); err == nil && p.Root == home {
		return errors.New("home root cannot be a maintenance target")
	}
	return nil
}

func storageCategory(relative string) string {
	if strings.HasPrefix(relative, ".evolution/cache/") {
		return "cache"
	}
	if strings.HasPrefix(relative, ".evolution/tmp/") {
		return "temp"
	}
	return "other"
}

func excludedStoragePath(relative string, directory bool) bool {
	parts := strings.Split(relative, "/")
	for index, name := range parts {
		lower := strings.ToLower(name)
		if lower == ".evolution" && index == 0 {
			continue
		}
		if strings.HasPrefix(name, ".") || strings.ContainsAny(name, "\r\n\t") {
			return true
		}
		switch lower {
		case "documents", "desktop", "downloads", "pictures", "photos", "music", "movies", "videos", "footage", "game assets", "audio", "backups", "backup", "trash", "node_modules", "vendor", "appdata", "application support", "credentials", "secrets":
			return true
		}
	}
	if strings.HasPrefix(relative, ".evolution/") {
		if relative != ".evolution/cache" && relative != ".evolution/tmp" && !strings.HasPrefix(relative, ".evolution/cache/") && !strings.HasPrefix(relative, ".evolution/tmp/") {
			return true
		}
	}
	if !directory {
		lower := strings.ToLower(path.Base(relative))
		if strings.Contains(lower, "secret") || strings.Contains(lower, "token") || strings.Contains(lower, "password") || strings.Contains(lower, "credential") {
			return true
		}
		switch strings.ToLower(path.Ext(relative)) {
		case ".pem", ".key", ".p12", ".pfx", ".db", ".sqlite", ".bak", ".zip", ".tar", ".gz", ".jpg", ".jpeg", ".png", ".gif", ".webp", ".mp4", ".mov", ".mp3", ".wav", ".flac", ".pdf", ".doc", ".docx", ".xls", ".xlsx":
			return true
		}
	}
	return false
}

// Metadata-only traversal, no content read and no persisted files. It is confined
// to a selected non-system project and bounded by entries/deadline. Reports are
// partial observations, never entire-device usage or predicted savings.
func ReportStorage(ctx context.Context, p ProjectProfile, device string, now time.Time) (StorageReport, error) {
	r := StorageReport{Version: 1, Device: device, Project: p.Name, Root: p.Root, At: now.UTC().Format(time.RFC3339Nano), CategoryBytes: map[string]int64{"cache": 0, "temp": 0, "other": 0}, LargeFiles: []StorageFile{}, Candidates: []StorageFile{}, Boundary: storageNativeBoundary, Complete: true}
	if err := maintenanceTarget(p, device); err != nil {
		return r, err
	}
	if stat, err := os.Lstat(p.Root); err != nil || !safeStorageOwner(stat) {
		return r, errors.New("selected project ownership/permissions adapter unavailable or unsafe")
	}
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	root, err := os.OpenRoot(p.Root)
	if err != nil {
		return r, errors.New("selected project unavailable")
	}
	defer root.Close()
	queue := []string{"."}
	entries := 0
	for len(queue) > 0 {
		if ctx.Err() != nil {
			return r, errors.New("storage report cancelled or exceeded 10 seconds")
		}
		rel := queue[0]
		queue = queue[1:]
		info, err := root.Lstat(rel)
		if err != nil || !info.IsDir() || info.Mode()&os.ModeSymlink != 0 || !safeStorageOwner(info) {
			r.ExcludedEntries++
			continue
		}
		dir, err := root.Open(rel)
		if err != nil {
			r.ExcludedEntries++
			continue
		}
		opened, err := dir.Stat()
		if err != nil || !os.SameFile(info, opened) {
			dir.Close()
			return r, errors.New("directory target changed during report")
		}
		for {
			batch, readErr := dir.ReadDir(128)
			for _, entry := range batch {
				entries++
				if entries > storageMaxEntries {
					dir.Close()
					r.Complete = false
					if err := validateCurrentProject(p); err != nil {
						return r, err
					}
					return finishStorageReport(r, p), nil
				}
				if ctx.Err() != nil {
					dir.Close()
					return r, errors.New("storage report cancelled or exceeded 10 seconds")
				}
				name := path.Join(rel, entry.Name())
				stat, err := root.Lstat(name)
				if err != nil || stat.Mode()&os.ModeSymlink != 0 || excludedStoragePath(name, stat.IsDir()) || !safeStorageOwner(stat) {
					r.ExcludedEntries++
					continue
				}
				if stat.IsDir() {
					queue = append(queue, name)
					continue
				}
				if !stat.Mode().IsRegular() {
					r.ExcludedEntries++
					continue
				}
				category := storageCategory(name)
				file := StorageFile{name, category, stat.Size(), stat.ModTime().UTC().Format(time.RFC3339Nano), uint32(stat.Mode().Perm()),storageIdentity(stat)}
				r.ObservedFiles++
				r.ObservedBytes += stat.Size()
				r.CategoryBytes[category] += stat.Size()
				r.LargeFiles = append(r.LargeFiles, file)
				if category != "other" && now.Sub(stat.ModTime()) >= storageActiveAge && stat.Size() <= storageMaxBytes {
					r.Candidates = append(r.Candidates, file)
				}
			}
			if readErr != nil {
				if readErr != io.EOF {
					r.Complete = false
				}
				break
			}
		}
		dir.Close()
	}
	if err := validateCurrentProject(p); err != nil {
		return r, err
	}
	return finishStorageReport(r, p), nil
}

func finishStorageReport(r StorageReport, p ProjectProfile) StorageReport {
	sort.Slice(r.LargeFiles, func(i, j int) bool {
		if r.LargeFiles[i].Bytes == r.LargeFiles[j].Bytes {
			return r.LargeFiles[i].Path < r.LargeFiles[j].Path
		}
		return r.LargeFiles[i].Bytes > r.LargeFiles[j].Bytes
	})
	if len(r.LargeFiles) > 20 {
		r.LargeFiles = r.LargeFiles[:20]
	}
	sort.Slice(r.Candidates, func(i, j int) bool { return r.Candidates[i].Path < r.Candidates[j].Path })
	r.FreeBytes, r.FreeStatus = storageFree(p.Root)
	return r
}

func cleanupDigest(plan CleanupPlan) string {
	plan.SHA256 = ""
	raw, _ := json.Marshal(plan)
	h := sha256.Sum256(raw)
	return hex.EncodeToString(h[:])
}

func PlanCleanup(ctx context.Context, p ProjectProfile, device string, categories []string, now time.Time) (CleanupPlan, error) {
	plan := CleanupPlan{Version: 1, Device: device, Profile: p, CreatedAt: now.UTC().Format(time.RFC3339Nano), ExpiresAt: now.Add(10 * time.Minute).UTC().Format(time.RFC3339Nano), Files: []StorageFile{}, Exclusions: append([]string{}, storageExclusions...), Apply: "BLOCKED: authenticated enrollment, scoped capabilities and safe trash/recovery adapter absent"}
	selected := map[string]bool{}
	for _, c := range categories {
		if (c != "cache" && c != "temp") || selected[c] {
			return plan, errors.New("select cache and/or temp once; no other categories supported")
		}
		selected[c] = true
	}
	if len(selected) == 0 {
		return plan, errors.New("explicit categories required")
	}
	plan.Categories = append([]string{}, categories...)
	sort.Strings(plan.Categories)
	report, err := ReportStorage(ctx, p, device, now)
	if err != nil {
		return plan, err
	}
	if !report.Complete {
		return plan, errors.New("partial report cannot create a cleanup plan")
	}
	for _, file := range report.Candidates {
		if selected[file.Category] {
			plan.Files = append(plan.Files, file)
			plan.EstimatedBytes += file.Bytes
			if plan.EstimatedBytes > storageMaxBytes {
				return plan, errors.New("plan exceeds 256 MiB candidate bound")
			}
		}
	}
	plan.SHA256 = cleanupDigest(plan)
	return plan, nil
}

// Revalidation is useful even while apply is disabled: nothing is moved/deleted.
// Metadata cannot prove a file is unused; inode/ctime are local metadata, not trust.
func ValidateCleanupPlan(ctx context.Context, p ProjectProfile, device string, plan CleanupPlan, confirmation string, now time.Time) error {
	ctx,cancel:=context.WithTimeout(ctx,10*time.Second);defer cancel()
	if err := maintenanceTarget(p, device); err != nil {
		return err
	}
	if stat,err:=os.Lstat(p.Root);err!=nil||!safeStorageOwner(stat){return errors.New("unsafe project ownership/permissions")}
	if plan.Version != 1 || plan.Device != device || plan.Profile != p || plan.SHA256 != cleanupDigest(plan) || confirmation != plan.SHA256 {
		return errors.New("exact device/project/plan fingerprint confirmation required")
	}
	created, err := time.Parse(time.RFC3339Nano, plan.CreatedAt)
	if err != nil {
		return errors.New("invalid plan time")
	}
	expires, err := time.Parse(time.RFC3339Nano, plan.ExpiresAt)
	if err != nil || expires.Sub(created) != 10*time.Minute || now.Before(created) || !now.Before(expires) {
		return errors.New("cleanup plan expired or invalid")
	}
	root, err := os.OpenRoot(p.Root)
	if err != nil {
		return errors.New("project unavailable")
	}
	defer root.Close()
	seen := map[string]bool{}
	total := int64(0)
	selected := map[string]bool{}
	for _, c := range plan.Categories {
		if (c != "cache" && c != "temp") || selected[c] {
			return errors.New("invalid categories")
		}
		selected[c] = true
	}
	if len(selected) == 0 || len(plan.Files) > storageMaxEntries {
		return errors.New("invalid cleanup selection")
	}
	for _, file := range plan.Files {
		if ctx.Err() != nil {
			return errors.New("plan validation cancelled")
		}
		if !filepath.IsLocal(file.Path) || path.Clean(file.Path) != file.Path || strings.Contains(file.Path, "\\") || seen[file.Path] || excludedStoragePath(file.Path, false) || storageCategory(file.Path) != file.Category || file.Category == "other" || !selected[file.Category] {
			return errors.New("unsafe or duplicate cleanup target")
		}
		seen[file.Path] = true
		for parent := path.Dir(file.Path); parent != "."; parent = path.Dir(parent) {
			stat, err := root.Lstat(parent)
			if err != nil || !stat.IsDir() || stat.Mode()&os.ModeSymlink != 0 || !safeStorageOwner(stat) {
				return errors.New("cleanup parent changed or unsafe")
			}
		}
		stat, err := root.Lstat(file.Path)
		if err != nil || !stat.Mode().IsRegular() || !safeStorageOwner(stat) || file.Identity=="" || storageIdentity(stat)!=file.Identity || stat.Size() != file.Bytes || stat.ModTime().UTC().Format(time.RFC3339Nano) != file.Modified || uint32(stat.Mode().Perm()) != file.Mode || now.Sub(stat.ModTime()) < storageActiveAge {
			return errors.New("cleanup target changed, active or unsafe")
		}
		total += file.Bytes
	}
	if total != plan.EstimatedBytes || total > storageMaxBytes {
		return errors.New("cleanup estimate mismatch")
	}
	return validateCurrentProject(p)
}
