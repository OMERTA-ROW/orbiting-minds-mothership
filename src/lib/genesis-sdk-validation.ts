import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { sdkContracts } from "./genesis-sdk";
const validator = new Ajv2020({ allErrors: true, strict: false });
addFormats(validator);
const checks = sdkContracts.map((contract) => ({ key: contract.key, validate: validator.compile(contract.schema) }));
export function validateSdkJson(key: string, raw: string) {
  const check = checks.find((item) => item.key === key);
  if (!check) return { valid: false, errors: ["Unknown contract."] };
  try { const value: unknown = JSON.parse(raw); const valid = check.validate(value); return { valid: Boolean(valid), errors: valid ? [] : (check.validate.errors ?? []).map((error) => `${error.instancePath || "/"} ${error.message ?? "is invalid"}`) }; }
  catch { return { valid: false, errors: ["Enter valid JSON."] }; }
}