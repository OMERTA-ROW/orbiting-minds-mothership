import { queryOptions } from "@tanstack/react-query";
import { readSocialDrafts } from "./omni-social.functions";
export const socialDraftQuery = queryOptions({
  queryKey: ["omni-social-private"],
  queryFn: () => readSocialDrafts(),
  staleTime: 0,
});
