import { useQuery } from "@tanstack/react-query";
import { customFetch } from "./custom-fetch";

export const UNREVIEWED_WIDGET_COUNT_KEY = ["/api/calls/unreviewed-widget-count"] as const;

export function useUnreviewedWidgetCount() {
  return useQuery({
    queryKey: UNREVIEWED_WIDGET_COUNT_KEY,
    queryFn: () => customFetch<{ count: number }>("/api/calls/unreviewed-widget-count", { method: "GET" }),
    refetchInterval: 30_000,
    staleTime: 20_000,
  });
}
