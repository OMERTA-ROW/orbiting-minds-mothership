import { describe, it, expect } from "vitest";
import { commandConflictPlan } from "@/lib/cli-reference";

describe("CLI command-name permission rules", () => {
 it("uses the founder's omni name when unclaimed", () => { expect(commandConflictPlan(false,false)).toEqual({installAllowed:true,omniAliasAllowed:true,command:"omni",modifiesExistingTools:false}); });
 it("uses evolution omni when omni is owned by another tool", () => { const p=commandConflictPlan(false,true);expect(p.command).toBe("evolution omni");expect(p.omniAliasAllowed).toBe(false);expect(p.modifiesExistingTools).toBe(false); });
 it.each([false,true])("blocks installation when evolution is already owned (%s)", omni => { const p=commandConflictPlan(true,omni);expect(p.installAllowed).toBe(false);expect(p.omniAliasAllowed).toBe(false);expect(p.modifiesExistingTools).toBe(false); });
});