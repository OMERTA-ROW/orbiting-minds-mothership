import { queryOptions } from "@tanstack/react-query";
import { readEvolutionAccess, readEvolutionWorkspace } from "./evolution.functions";

export const evolutionAccessQuery = queryOptions({
  queryKey: ["evolution-owner-access"],
  queryFn: () => readEvolutionAccess(),
  retry: false,
});
export const evolutionWorkspaceQuery = queryOptions({
  queryKey: ["evolution-workspace"],
  queryFn: () => readEvolutionWorkspace(),
  retry: false,
});
