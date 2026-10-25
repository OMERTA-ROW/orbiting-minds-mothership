package companion

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// Local evidence only: a hash chain detects edits relative to the exported
// head. A same-user writer can rewrite the entire chain; no external anchor.
type SecurityEvent struct {
	Version  int    `json:"version"`
	Sequence int    `json:"sequence"`
	At       string `json:"at"`
	Project  string `json:"project"`
	Severity string `json:"severity"`
	Rule     string `json:"rule"`
	Action   string `json:"action"`
	Evidence string `json:"evidence"`
	Previous string `json:"previous"`
	SHA256   string `json:"sha256"`
}

const maxSecurityAudit = 2 << 20

func eventHash(e SecurityEvent) string {
	payload := fmt.Sprintf("%d\n%d\n%s\n%s\n%s\n%s\n%s\n%s\n%s", e.Version, e.Sequence, e.At, e.Project, e.Severity, e.Rule, e.Action, e.Evidence, e.Previous)
	h := sha256.Sum256([]byte(payload))
	return hex.EncodeToString(h[:])
}

func openSecurityAudit(p ProjectProfile, create bool) (*os.Root, error) {
	if err := validateProjectRoot(p.Root); err != nil {
		return nil, err
	}
	dir := filepath.Join(p.Root, profileDir, "security")
	if create {
		if err := os.Mkdir(dir, 0700); err != nil && !os.IsExist(err) {
			return nil, err
		}
	}
	info, err := os.Lstat(dir)
	if err != nil || !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
		return nil, errors.New("local security evidence directory unavailable or unsafe")
	}
	if info.Mode().Perm()&0077 != 0 {
		return nil, errors.New("local security evidence directory must be private")
	}
	return os.OpenRoot(dir)
}

func readSecurityEvents(root *os.Root, project string) ([]SecurityEvent, error) {
	info, err := root.Lstat("events.jsonl")
	if os.IsNotExist(err) {
		return []SecurityEvent{}, nil
	}
	if err != nil || !info.Mode().IsRegular() || info.Size() > maxSecurityAudit || info.Mode().Perm()&0077 != 0 {
		return nil, errors.New("local security evidence is unsafe or exceeds 2 MiB")
	}
	raw, err := root.ReadFile("events.jsonl")
	if err != nil {
		return nil, errors.New("local security evidence could not be read")
	}
	events := []SecurityEvent{}
	previous := ""
	if len(raw) == 0 {
		return events, nil
	}
	if raw[len(raw)-1] != '\n' {
		return nil, errors.New("security evidence has an incomplete write; owner review required")
	}
	for _, line := range strings.Split(strings.TrimSuffix(string(raw), "\n"), "\n") {
		var e SecurityEvent
		if json.Unmarshal([]byte(line), &e) != nil || e.Version != 1 || e.Sequence != len(events)+1 || e.Project != project || e.Previous != previous || e.SHA256 != eventHash(e) {
			return nil, errors.New("security evidence chain mismatch; preserve original for owner review")
		}
		events = append(events, e)
		previous = e.SHA256
	}
	return events, nil
}

func SecurityAudit(p ProjectProfile) ([]SecurityEvent, error) {
	root, err := openSecurityAudit(p, false)
	if err != nil {
		return nil, err
	}
	defer root.Close()
	return readSecurityEvents(root, p.Name)
}

// Only fixed rule/action/evidence strings from enforcement code are persisted.
// No prompts, file contents, credentials, absolute paths or classifier excerpts.
func recordSecurity(p ProjectProfile, severity, rule, action, evidence string) error {
	root, err := openSecurityAudit(p, true)
	if err != nil {
		return err
	}
	defer root.Close()
	if err := root.Mkdir(".lock", 0700); err != nil {
		return errors.New("security evidence busy or interrupted; no new task authorized")
	}
	defer root.Remove(".lock")
	events, err := readSecurityEvents(root, p.Name)
	if err != nil {
		return err
	}
	e := SecurityEvent{Version: 1, Sequence: len(events) + 1, At: time.Now().UTC().Format(time.RFC3339Nano), Project: p.Name, Severity: severity, Rule: rule, Action: action, Evidence: evidence}
	if len(events) > 0 {
		e.Previous = events[len(events)-1].SHA256
	}
	e.SHA256 = eventHash(e)
	line, err := json.Marshal(e)
	if err != nil {
		return err
	}
	line = append(line, '\n')
	info, err := root.Lstat("events.jsonl")
	if err != nil && !os.IsNotExist(err) {
		return err
	}
	if info != nil && info.Size()+int64(len(line)) > maxSecurityAudit {
		return errors.New("security evidence reached 2 MiB; owner archive/review required")
	}
	f, err := root.OpenFile("events.jsonl", os.O_WRONLY|os.O_CREATE|os.O_APPEND, 0600)
	if err != nil {
		return errors.New("security evidence write unavailable")
	}
	_, writeErr := f.Write(line)
	syncErr := f.Sync()
	closeErr := f.Close()
	if writeErr != nil || syncErr != nil || closeErr != nil {
		return errors.New("security evidence write incomplete; owner review required")
	}
	return nil
}

// Fixed patterns are advisory indicators, NOT semantic/AI detection and never
// an authorization input. Unknown/obfuscated attempts will be missed.
func InjectionIndicators(text string) []string {
	text = strings.ToLower(text)
	rules := []string{}
	if strings.Contains(text, "ignore previous instructions") || strings.Contains(text, "ignore all previous") {
		rules = append(rules, "instruction-override")
	}
	if strings.Contains(text, "reveal secrets") || strings.Contains(text, "print api key") || strings.Contains(text, "show environment variables") {
		rules = append(rules, "secret-request")
	}
	if strings.Contains(text, "grant yourself") || strings.Contains(text, "disable guardian") || strings.Contains(text, "expand privileges") {
		rules = append(rules, "policy-escalation")
	}
	return rules
}
