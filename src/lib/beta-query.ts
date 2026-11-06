import { queryOptions } from "@tanstack/react-query";
import { readBeta } from "./beta.functions";
export const betaQuery = queryOptions({
  queryKey: ["beta-private"],
  queryFn: () => readBeta(),
  staleTime: 0,
});
