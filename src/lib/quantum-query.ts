import { queryOptions } from "@tanstack/react-query";
import { readStudio } from "./quantum.functions";
export const studioQuery = queryOptions({ queryKey: ["studio-private"], queryFn: () => readStudio(), staleTime: 0 });