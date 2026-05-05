import { ExpoRouterAdapterOptions, NavigationAdapter, TourRouteRef } from "./types";

const normalizeParams = (
  params?: Record<string, string | number | boolean | null | undefined>,
) => {
  if (!params) return undefined;
  const entries = Object.entries(params).filter(([, value]) => value !== undefined);
  if (!entries.length) return undefined;
  return Object.fromEntries(entries) as Record<
    string,
    string | number | boolean | null | undefined
  >;
};

const routeKey = (route: TourRouteRef | null | undefined) => {
  if (!route) return "";
  if (typeof route === "string") return route;

  const params = normalizeParams(route.params) ?? {};
  const sorted = Object.keys(params)
    .sort()
    .reduce<Record<string, string | number | boolean | null | undefined>>((acc, key) => {
      acc[key] = params[key];
      return acc;
    }, {});

  return `${route.pathname}:${JSON.stringify(sorted)}`;
};

export const createExpoRouterAdapter = (args: {
  push: (href: TourRouteRef) => void;
  replace: (href: TourRouteRef) => void;
  back: () => void;
  getPathname: () => string;
  getParams?: () => Record<string, string | number | boolean | null | undefined>;
  options?: ExpoRouterAdapterOptions;
}): NavigationAdapter => {
  const compare =
    args.options?.compare ??
    ((current: TourRouteRef | null, target: TourRouteRef) => routeKey(current) === routeKey(target));

  return {
    getCurrentRoute: () => {
      const pathname = args.getPathname();
      const params = normalizeParams(args.getParams?.());
      if (!params) return pathname;
      return {
        pathname,
        params,
      };
    },
    navigate: ({ to, mode }) => {
      if (mode === "replace") {
        args.replace(to);
        return;
      }
      if (mode === "back") {
        args.back();
        return;
      }
      args.push(to);
    },
    back: () => {
      args.back();
    },
    waitForRoute: async (to, signal) => {
      const timeoutMs = args.options?.waitForRouteTimeoutMs ?? 10_000;
      const startedAt = Date.now();

      while (true) {
        if (signal.aborted) {
          throw new Error("aborted");
        }

        const pathname = args.getPathname();
        const params = normalizeParams(args.getParams?.());
        const current = (params
          ? {
              pathname,
              params,
            }
          : pathname) as TourRouteRef;

        if (compare(current, to)) return;

        if (Date.now() - startedAt >= timeoutMs) {
          throw new Error("route_mismatch");
        }

        await new Promise<void>((resolve) => setTimeout(resolve, 50));
      }
    },
  };
};
