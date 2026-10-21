import { queryOptions } from "@tanstack/react-query";
import { readCreatorForge } from "./forge-distro.functions";
export const creatorForgeQuery = queryOptions({
  queryKey: ["private-creator-forge"],
  queryFn: () => readCreatorForge(),
});
