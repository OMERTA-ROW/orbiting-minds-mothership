package companion

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"runtime"
)

// DeveloperTool is a reviewed executable-name catalogue entry. Matches show only
// that a regular file with this name exists in PATH, never its version or safety.
type DeveloperTool struct {
	ID         string   `json:"id"`
	Name       string   `json:"name"`
	Executable string   `json:"executable"`
	References []string `json:"compatible_references"`
}

var DeveloperTools = []DeveloperTool{
	{"git", "Git", "git", []string{"GitHub adapter · NOT CONNECTED", "Code Vault review · REFERENCE"}},
	{"node", "Node.js", "node", []string{"TypeScript project diagnostics · PLANNED"}},
	{"python", "Python", "python3", []string{"Python project diagnostics · PLANNED"}},
	{"go", "Go", "go", []string{"Evolution CLI source builds · REFERENCE"}},
	{"docker", "Docker", "docker", []string{"Isolated sandbox adapter · PLANNED"}},
	{"code", "Visual Studio Code", "code", []string{"Editor extension · PLANNED / NOT VERIFIED"}},
	{"unity", "Unity", "Unity", []string{"Unity companion · DISABLED REFERENCE"}},
	{"blender", "Blender", "blender", []string{"Blender companion · DISABLED REFERENCE"}},
	{"solana", "Solana CLI", "solana", []string{"Testnet read-only status · FUTURE / NO WALLETS"}},
}

type DiscoveryResult struct {
	Tool     DeveloperTool `json:"tool"`
	Detected bool          `json:"detected"`
	Matches  int           `json:"path_matches"`
}

type DiscoveryReport struct {
	Platform     string            `json:"platform"`
	Consent      string            `json:"consent"`
	Results      []DiscoveryResult `json:"results"`
	Transmission string            `json:"transmission"`
	Execution    string            `json:"execution"`
	Verification string            `json:"verification"`
}

// Discover uses PATH filename metadata only. It records match counts, not paths,
// so terminal output and JSON exports omit usernames and directory layouts.
func Discover(path, platform string) DiscoveryReport {
	results := make([]DiscoveryResult, 0, len(DeveloperTools))
	for _, tool := range DeveloperTools {
		matches := len(FindCommands(tool.Executable, path, platform))
		results = append(results, DiscoveryResult{tool, matches > 0, matches})
	}
	return DiscoveryReport{platform, "EXPLICIT --approve", results, "NONE; local output only", "NONE; tools were not launched", "NAME MATCHES ONLY; versions and compatibility NOT VERIFIED"}
}

func runDiscover(args []string, out, errOut io.Writer) int {
	approve, asJSON := false, false
	for _, arg := range args {
		switch {
		case arg == "--approve" && !approve:
			approve = true
		case arg == "--json" && !asJSON:
			asJSON = true
		default:
			return invalid(errOut)
		}
	}
	if !approve {
		fmt.Fprintln(errOut, "Opt-in required: evolution discover --approve [--json]. Nothing was scanned.")
		return 2
	}
	report := Discover(os.Getenv("PATH"), runtime.GOOS)
	if asJSON {
		if json.NewEncoder(out).Encode(report) != nil {
			return 1
		}
		return 0
	}
	fmt.Fprintln(out, "LOCAL READ-ONLY DEVELOPER TOOL DISCOVERY")
	fmt.Fprintln(out, "PATH filenames only. No tools launched, files read, versions collected or data sent.")
	for _, r := range report.Results {
		state := "not found"
		if r.Detected {
			state = "name found in PATH"
		}
		fmt.Fprintf(out, "%s: %s\n", r.Tool.Name, state)
		if r.Detected {
			for _, ref := range r.Tool.References {
				fmt.Fprintf(out, "  compatible reference: %s\n", ref)
			}
		}
	}
	fmt.Fprintln(out, "References are not installed, connected or verified compatible.")
	return 0
}
