package companion

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
)

func maintenanceFixture(t *testing.T) (ProjectProfile, time.Time) {
	t.Helper()
	if runtime.GOOS != "linux" {
		t.Skip("Linux metadata adapter only")
	}
	p := defenseProject(t)
	now := time.Now().UTC()
	for _, dir := range []string{".evolution/cache", ".evolution/tmp", "Code", "Documents", "Backups"} {
		if err := os.MkdirAll(filepath.Join(p.Root, dir), 0700); err != nil {
			t.Fatal(err)
		}
	}
	for name, content := range map[string]string{".evolution/cache/old.bin": "12345678", ".evolution/tmp/old.bin": "1234", ".evolution/cache/recent.bin": "active", "Code/main.go": "code", "Documents/private.txt": "private", "Backups/old.bak": "backup", ".evolution/cache/photo.jpg": "media", ".evolution/cache/api-token.txt": "credential"} {
		file := filepath.Join(p.Root, name)
		if err := os.WriteFile(file, []byte(content), 0600); err != nil {
			t.Fatal(err)
		}
		if !strings.Contains(name, "recent") {
			os.Chtimes(file, now.Add(-2*time.Hour), now.Add(-2*time.Hour))
		}
	}
	return p, now
}

func TestStorageReadOnlyMetadataAndPlanDefaults(t *testing.T) {
	p, now := maintenanceFixture(t)
	report, err := ReportStorage(context.Background(), p, "local", now)
	if err != nil {
		t.Fatal(err)
	}
	if report.CategoryBytes["cache"] != 14 || report.CategoryBytes["temp"] != 4 || report.FreeBytes == nil || len(report.Candidates) != 2 {
		t.Fatalf("unexpected actual fixture report %+v", report)
	}
	plan, err := PlanCleanup(context.Background(), p, "local", []string{"cache", "temp"}, now)
	if err != nil {
		t.Fatal(err)
	}
	if plan.EstimatedBytes != 12 || len(plan.Files) != 2 || !strings.HasPrefix(plan.Apply, "BLOCKED") {
		t.Fatalf("unexpected plan %+v", plan)
	}
	if expires, _ := time.Parse(time.RFC3339Nano, plan.ExpiresAt); expires.Sub(now) != 10*time.Minute {
		t.Fatal("plan expiry changed")
	}
	for _, file := range plan.Files {
		raw, err := os.ReadFile(filepath.Join(p.Root, file.Path))
		if err != nil || int64(len(raw)) != file.Bytes {
			t.Fatal("dry-run modified files")
		}
	}
	if _, err := os.Stat(filepath.Join(p.Root, profileDir, "security")); !os.IsNotExist(err) {
		t.Fatal("read-only report wrote audit files")
	}
	if _, err := PlanCleanup(context.Background(), p, "local", nil, now); err == nil {
		t.Fatal("categories defaulted silently")
	}
	if _, err := PlanCleanup(context.Background(), p, "local", []string{"documents"}, now); err == nil {
		t.Fatal("personal category accepted")
	}
}

func TestStorageDeniesRemoteForgedProfileAndUnsafePermissions(t *testing.T) {
	p, now := maintenanceFixture(t)
	if _, err := ReportStorage(context.Background(), p, "other-user-device", now); err == nil {
		t.Fatal("remote target accepted")
	}
	forged := p
	forged.CreatedAt = "forged-owner"
	if _, err := ReportStorage(context.Background(), forged, "local", now); err == nil {
		t.Fatal("forged profile accepted")
	}
	os.Chmod(p.Root, 0777)
	if _, err := ReportStorage(context.Background(), p, "local", now); err == nil {
		t.Fatal("unsafe project permissions accepted")
	}
}

func TestStorageSymlinkHardlinkAndCredentialExclusions(t *testing.T) {
	p, now := maintenanceFixture(t)
	outside := t.TempDir()
	secret := filepath.Join(outside, "secret.txt")
	os.WriteFile(secret, []byte("outside"), 0600)
	os.Symlink(secret, filepath.Join(p.Root, ".evolution/cache/link.bin"))
	os.Link(secret, filepath.Join(p.Root, ".evolution/cache/hard.bin"))
	r, err := ReportStorage(context.Background(), p, "local", now)
	if err != nil {
		t.Fatal(err)
	}
	for _, file := range append(r.Candidates, r.LargeFiles...) {
		if strings.Contains(file.Path, "link") || strings.Contains(file.Path, "photo") || strings.Contains(file.Path, "token") || strings.Contains(file.Path, "Documents") || strings.Contains(file.Path, "Backups") {
			t.Fatal("excluded target surfaced", file.Path)
		}
	}
}

func TestStorageExactConfirmationExpiredChangedAndTraversalPlanRefused(t *testing.T) {
	p, now := maintenanceFixture(t)
	plan, err := PlanCleanup(context.Background(), p, "local", []string{"cache"}, now)
	if err != nil {
		t.Fatal(err)
	}
	if err := ValidateCleanupPlan(context.Background(), p, "local", plan, "wrong", now); err == nil {
		t.Fatal("confirmation bypass")
	}
	if err := ValidateCleanupPlan(context.Background(), p, "local", plan, plan.SHA256, now.Add(10*time.Minute)); err == nil {
		t.Fatal("expired plan accepted at boundary")
	}
	if err := ValidateCleanupPlan(context.Background(), p, "local", plan, plan.SHA256, now); err != nil {
		t.Fatal("baseline validation failed", err)
	}
	bad := plan
	bad.Files = append([]StorageFile{}, plan.Files...)
	bad.Files[0].Path = "../outside"
	bad.SHA256 = cleanupDigest(bad)
	if err := ValidateCleanupPlan(context.Background(), p, "local", bad, bad.SHA256, now); err == nil {
		t.Fatal("traversal plan accepted")
	}
	os.WriteFile(filepath.Join(p.Root, plan.Files[0].Path), []byte("changed"), 0600)
	if err := ValidateCleanupPlan(context.Background(), p, "local", plan, plan.SHA256, now); err == nil {
		t.Fatal("changed target accepted")
	}
}

func TestStorageApplyAlwaysBlockedAndPreservesFiles(t *testing.T) {
	p, now := maintenanceFixture(t)
	plan, err := PlanCleanup(context.Background(), p, "local", []string{"cache"}, now)
	if err != nil {
		t.Fatal(err)
	}
	file := filepath.Join(p.Root, "cleanup-plan.json")
	raw, _ := json.Marshal(plan)
	os.WriteFile(file, raw, 0600)
	var out, errOut bytes.Buffer
	args := []string{"storage", "apply", "--project", p.Root, "--device", "local", "--plan", file, "--confirm", plan.SHA256, "--approve"}
	if code := Run(args, "evolution", &out, &errOut); code != 2 || !strings.Contains(errOut.String(), "No files moved/deleted") {
		t.Fatal("valid plan did not block apply", code, errOut.String())
	}
	content, _ := os.ReadFile(filepath.Join(p.Root, plan.Files[0].Path))
	if string(content) != "12345678" {
		t.Fatal("apply mutated data")
	}
	if Run(args[:len(args)-1], "evolution", &out, &errOut) != 1 {
		t.Fatal("no approval accepted")
	}
}

func TestStorageCancelledReportAndEntryBound(t *testing.T) {
	p, now := maintenanceFixture(t)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := ReportStorage(ctx, p, "local", now); err == nil {
		t.Fatal("cancelled report succeeded")
	}
	for n := 0; n < 5001; n++ {
		os.WriteFile(filepath.Join(p.Root, "Code", fmt.Sprintf("x-%04d", n)), nil, 0600)
	}
	r, err := ReportStorage(context.Background(), p, "local", now)
	if err != nil || r.Complete {
		t.Fatal("entry cap missing", err)
	}
	if _, err := PlanCleanup(context.Background(), p, "local", []string{"cache"}, now); err == nil {
		t.Fatal("partial traversal produced plan")
	}
}

func TestMaintenanceReadOnlyAvailabilityAndBlockedServiceCommands(t *testing.T) {
	for _, args := range [][]string{{"device", "identity", "--json"}, {"device", "permissions", "--json"}, {"malware", "availability", "--json"}, {"terminal", "security", "--json"}} {
		var out, errOut bytes.Buffer
		if Run(args, "evolution", &out, &errOut) != 0 {
			t.Fatal("status command failed", errOut.String())
		}
		if !json.Valid(out.Bytes()) {
			t.Fatal("JSON status invalid")
		}
	}
	for _, args := range [][]string{{"malware", "scan"}, {"operation", "cancel"}, {"operation", "status"}} {
		var out, errOut bytes.Buffer
		if Run(args, "evolution", &out, &errOut) != 2 {
			t.Fatal("unsupported endpoint accepted")
		}
	}
	var out, errOut bytes.Buffer
	if Run([]string{"storage", "report", "--device", "remote"}, "evolution", &out, &errOut) != 1 {
		t.Fatal("remote command accepted")
	}
	if Run([]string{"malware", "scan", "--shell", "rm -rf"}, "evolution", &out, &errOut) != 2 {
		t.Fatal("shell flag accepted")
	}
}

func TestScannerDisposableFixedArgvVersionResultRedactionAndCancel(t *testing.T) {
	p, _ := maintenanceFixture(t)
	tools := t.TempDir()
	source := filepath.Join(tools, "fixture.go")
	binary := filepath.Join(tools, "clamscan")
	// This is a compiled adapter fixture, NOT ClamAV and NOT malware detection.
	fixture := `package main
import("fmt";"os";"time")
func main(){if len(os.Args)==2&&os.Args[1]=="--version"{fmt.Println("ClamAV fixture-only/NO-REAL-DATABASE");return};if len(os.Args)!=10||os.Args[1]!="--no-summary"||os.Args[8]!="--"{os.Exit(2)};fmt.Println("password=synthetic-secret");if os.Args[9][len(os.Args[9])-8:]=="slow.bin"{time.Sleep(10*time.Second)};os.Exit(1)}`
	os.WriteFile(source, []byte(fixture), 0600)
	if output, err := exec.Command("go", "build", "-o", binary, source).CombinedOutput(); err != nil {
		t.Fatal(string(output), err)
	}
	os.Chmod(binary, 0700)
	if e, err := scanSelectedFile(context.Background(), p, "local", "Code/main.go", binary, false, time.Second); err == nil || e.Started != "" {
		t.Fatal("unapproved scan started")
	}
	if _, err := scanSelectedFile(context.Background(), p, "local", "Code/main.go", filepath.Join(tools, "missing"), true, time.Second); err == nil {
		t.Fatal("missing scanner accepted")
	}
	e, err := scanSelectedFile(context.Background(), p, "local", "Code/main.go", binary, true, 5*time.Second)
	if err != nil || e.ExitCode != 1 || !strings.Contains(e.Result, "no remediation") || strings.Contains(e.Output, "synthetic-secret") || !strings.Contains(e.Output, "[REDACTED]") {
		t.Fatalf("fixture scan evidence %+v %v", e, err)
	}
	os.WriteFile(filepath.Join(p.Root, "Code/slow.bin"), []byte("disposable"), 0600)
	e, err = scanSelectedFile(context.Background(), p, "local", "Code/slow.bin", binary, true, 200*time.Millisecond)
	if err != nil || !strings.HasPrefix(e.Result, "TIMED OUT") {
		t.Fatalf("timeout missing %+v %v", e, err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if e, err := scanSelectedFile(ctx, p, "local", "Code/main.go", binary, true, time.Second); err == nil || e.Started != "" {
		t.Fatal("pre-cancelled scanner started")
	}
	if _, err := scanSelectedFile(context.Background(), p, "remote", "Code/main.go", binary, true, time.Second); err == nil {
		t.Fatal("remote scanner target accepted")
	}
}
