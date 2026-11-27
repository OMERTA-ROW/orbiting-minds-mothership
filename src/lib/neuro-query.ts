import { queryOptions } from "@tanstack/react-query";
import { readNeuroRegistry } from "./neuro.functions";
export const neuroRegistryQuery = queryOptions({
  queryKey: ["neuro-private-registry"],
  queryFn: () => readNeuroRegistry(),
  retry: false,
});
