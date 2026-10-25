package companion

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"time"
)

func runMaintenance(command string, args []string, out, errOut io.Writer) int {
	f, pos, ok := flags(args, map[string]bool{"--device": true, "--project": true, "--categories": true, "--plan": true, "--confirm": true})
	if !ok || len(pos) != 1 {
		return invalid(errOut)
	}
	allowed := map[string]bool{"--device": true, "--project": true, "--json": true}
	if command == "storage" && pos[0] == "plan" {
		allowed["--categories"] = true
	}
	if command == "storage" && pos[0] == "apply" {
		allowed["--plan"] = true
		allowed["--confirm"] = true
		allowed["--approve"] = true
	}
	for key := range f {
		if !allowed[key] {
			return invalid(errOut)
		}
	}
	device := f["--device"]
	if device == "" {
		device = "local"
	}
	if device != "local" {
		fmt.Fprintln(errOut, "DENIED: remote/unverified device; no enrolled companion connection.")
		return 1
	}
	if command == "device" && (pos[0] == "identity" || pos[0] == "permissions") {
		v := map[string]any{"device": "local", "identity": "UNATTESTED local invocation; no device identifier collected", "enrolled": false, "remote": false, "scopes": []string{}, "authentication": "NOT CONNECTED", "maintenance": "selected-project report/dry-run only; no cleanup permission", "boundary": storageNativeBoundary}
		return emit(out, f["--json"] == "1", v, "LOCAL INVOCATION ONLY · not enrolled/authenticated\nScopes: none. Selected-project report/dry-run only; cleanup/remote permissions unavailable.")
	}
	if command == "terminal" && pos[0] == "security" {
		v := map[string]any{"device": "local", "status": "PARTIAL LOCAL ENFORCEMENT; not security certification", "authentication": "NOT CONNECTED", "capabilities": "UNAVAILABLE", "rate_limits": "UNAVAILABLE: no standard backend limiter", "guardian": "fixed task/project checks and local evidence only", "emergency_stop": processBoundary, "cleanup": "BLOCKED", "scanner": ScannerAvailability()}
		return emit(out, f["--json"] == "1", v, "PARTIAL LOCAL ENFORCEMENT · no enrolled device/auth/capabilities/rate limiter.\nFixed tasks, project binding and local evidence only. Cleanup blocked. No security all-clear.")
	}
	if command == "operation" && (pos[0] == "status" || pos[0] == "cancel") {
		fmt.Fprintln(errOut, "UNSUPPORTED: no enrolled background operation service. Foreground reports use Ctrl-C; local Linux tasks use process-group cancellation. No remote cancel receipt.")
		return 2
	}
	if command == "malware" {
		if pos[0] == "availability" || pos[0] == "status" {
			v := ScannerAvailability()
			return emit(out, f["--json"] == "1", v, fmt.Sprintf("%s · %s\nNo scan performed; no clean/malware-free verdict.", v.Engine, v.Status))
		}
		if pos[0] == "scan" {
			fmt.Fprintln(errOut, "BLOCKED: authenticated enrolled device/scoped scan capability and verified native adapter required. No scan started, file uploaded or remediation performed.")
			return 2
		}
		return invalid(errOut)
	}
	if command != "storage" {
		return invalid(errOut)
	}
	if pos[0] != "report" && pos[0] != "plan" && pos[0] != "apply" {
		return invalid(errOut)
	}
	p, err := LoadProject(f["--project"])
	if err != nil {
		fmt.Fprintln(errOut, "Selected project unavailable or invalid; no operation performed.")
		return 1
	}
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt)
	defer cancel()
	switch pos[0] {
	case "report":
		r, err := ReportStorage(ctx, p, device, time.Now())
		if err != nil {
			fmt.Fprintln(errOut, "Report denied:", err)
			return 1
		}
		text:=fmt.Sprintf("READ-ONLY PROJECT METADATA · %s\nObserved %d files / %d bytes; excluded %d entries; complete=%t\nCategory bytes: cache=%d temp=%d other=%d\nFree space: %s",p.Root,r.ObservedFiles,r.ObservedBytes,r.ExcludedEntries,r.Complete,r.CategoryBytes["cache"],r.CategoryBytes["temp"],r.CategoryBytes["other"],r.FreeStatus)
		if r.FreeBytes!=nil{text+=fmt.Sprintf(" (%d bytes)",*r.FreeBytes)}
		for _,file:=range r.LargeFiles{text+=fmt.Sprintf("\n  %d bytes · %s · %s",file.Bytes,file.Category,file.Path)}
		text+="\nNo entire-device scan, cleanup or savings claim."
		return emit(out,f["--json"]=="1",r,text)
	case "plan":
		plan, err := PlanCleanup(ctx, p, device, strings.Split(f["--categories"], ","), time.Now())
		if err != nil {
			fmt.Fprintln(errOut, "Plan denied:", err)
			return 1
		}
		return emit(out, f["--json"] == "1", plan, fmt.Sprintf("DRY-RUN ONLY · %s\nSelected %d files / %d bytes, categories %v\nExact plan fingerprint: %s\n%s\nNo files moved/deleted; export JSON for exact target review.", p.Root, len(plan.Files), plan.EstimatedBytes, plan.Categories, plan.SHA256, plan.Apply))
	case "apply":
		if f["--device"]!="local" || f["--approve"] != "1" || f["--plan"] == "" || f["--confirm"] == "" {
			fmt.Fprintln(errOut, "Exact saved plan, fingerprint and --approve required. Nothing changed.")
			return 1
		}
		plan, err := loadCleanupPlan(f["--plan"])
		if err != nil {
			fmt.Fprintln(errOut, "Plan unavailable/unsafe; nothing changed.")
			return 1
		}
		if err := ValidateCleanupPlan(ctx, p, device, plan, f["--confirm"], time.Now()); err != nil {
			fmt.Fprintln(errOut, "Apply denied:", err)
			return 1
		}
		fmt.Fprintln(errOut, "BLOCKED after plan validation: authenticated device capabilities and safe trash/recovery adapter unavailable. No files moved/deleted.")
		return 2
	}
	return invalid(errOut)
}

func loadCleanupPlan(filename string) (CleanupPlan, error) {
	var plan CleanupPlan
	if !filepath.IsAbs(filename)||filepath.Clean(filename)!=filename{return plan,fmt.Errorf("clean absolute plan path required")}
	for parent:=filepath.Dir(filename);;parent=filepath.Dir(parent){stat,err:=os.Lstat(parent);if err!=nil||!stat.IsDir()||stat.Mode()&os.ModeSymlink!=0{return plan,fmt.Errorf("unsafe plan parent")};if filepath.Dir(parent)==parent{break}}
	info, err := os.Lstat(filename)
	if err != nil || !info.Mode().IsRegular() || info.Size() > 2<<20 || !safeStorageOwner(info) {
		return plan, fmt.Errorf("unsafe plan")
	}
	f, err := os.Open(filename)
	if err != nil {
		return plan, err
	}
	defer f.Close()
	opened, err := f.Stat()
	if err != nil || !os.SameFile(info, opened) {
		return plan, fmt.Errorf("plan changed")
	}
	decoder := json.NewDecoder(io.LimitReader(f, 2<<20))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&plan); err != nil {
		return plan, err
	}
	var extra any
	if decoder.Decode(&extra) != io.EOF {
		return plan, fmt.Errorf("extra plan data")
	}
	return plan, nil
}
