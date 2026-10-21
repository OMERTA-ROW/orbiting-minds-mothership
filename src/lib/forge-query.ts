import { queryOptions } from "@tanstack/react-query";
import { readForge } from "./forge.functions";
export const forgeQuery = queryOptions({ queryKey: ["private-forge"], queryFn: () => readForge() });
