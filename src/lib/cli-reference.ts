export type CliPlatform = "macOS" | "Linux" | "Windows";
export function commandConflictPlan(evolutionOwned: boolean, omniOwned: boolean) {
  return {
    installAllowed: !evolutionOwned,
    omniAliasAllowed: !evolutionOwned && !omniOwned,
    command: evolutionOwned
      ? "Use a reviewed explicit executable path; resolve the evolution name first."
      : omniOwned
        ? "evolution omni"
        : "omni",
    modifiesExistingTools: false,
  };
}
export const cliPlatformChecks: Record<CliPlatform, string> = {
  macOS: "type -a evolution omni\ncommand -v evolution\ncommand -v omni",
  Linux: "type -a evolution omni\ncommand -v evolution\ncommand -v omni",
  Windows: "Get-Command evolution,omni -All -ErrorAction SilentlyContinue",
};
