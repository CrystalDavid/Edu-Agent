import { useEffect, useState } from "react";

export const appRoutes = [
  "/",
  "/overview",
  "/schedule",
  "/teaching",
  "/courses",
  "/students",
  "/assignments",
  "/files",
  "/agent",
  "/settings",
  "/goals",
  "/evidence",
  "/copilot",
  "/teaching-plan",
  "/runs",
  "/style-guide"
] as const;

export type AppRoute = (typeof appRoutes)[number];

const defaultRoute: AppRoute = "/overview";

interface ParsedRoute {
  route: AppRoute;
  proposalRevisionRef: string | null;
  canonicalPath: string;
}

function parseRoute(pathname: string): ParsedRoute {
  const proposalMatch = pathname.match(
    /^\/copilot\/proposals\/([^/]+)$/
  );
  if (proposalMatch?.[1]) {
    try {
      return {
        route: "/copilot",
        proposalRevisionRef: decodeURIComponent(proposalMatch[1]),
        canonicalPath: pathname
      };
    } catch {
      return {
        route: defaultRoute,
        proposalRevisionRef: null,
        canonicalPath: defaultRoute
      };
    }
  }
  const route = appRoutes.includes(pathname as AppRoute)
    ? (pathname as AppRoute)
    : defaultRoute;
  return {
    route,
    proposalRevisionRef: null,
    canonicalPath:
      pathname === "/" || pathname !== route ? defaultRoute : route
  };
}

export function useAppRoute(): {
  route: AppRoute;
  navigate: (route: AppRoute) => void;
  proposalRevisionRef: string | null;
  navigateProposal: (proposalRevisionRef: string) => void;
} {
  const [location, setLocation] = useState<ParsedRoute>(() =>
    parseRoute(window.location.pathname)
  );

  useEffect(() => {
    const initial = parseRoute(window.location.pathname);
    if (window.location.pathname !== initial.canonicalPath) {
      window.history.replaceState({}, "", initial.canonicalPath);
      setLocation(initial);
    }
    const onPopState = () => {
      const next = parseRoute(window.location.pathname);
      if (window.location.pathname !== next.canonicalPath) {
        window.history.replaceState({}, "", next.canonicalPath);
      }
      setLocation(next);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  return {
    route: location.route,
    proposalRevisionRef: location.proposalRevisionRef,
    navigate(nextRoute) {
      if (
        nextRoute === location.route &&
        location.proposalRevisionRef === null
      ) {
        return;
      }
      window.history.pushState({}, "", nextRoute);
      setLocation({
        route: nextRoute,
        proposalRevisionRef: null,
        canonicalPath: nextRoute
      });
      window.scrollTo({ top: 0, behavior: "instant" });
    },
    navigateProposal(proposalRevisionRef) {
      const path =
        `/copilot/proposals/${encodeURIComponent(
          proposalRevisionRef
        )}`;
      if (
        location.route === "/copilot" &&
        location.proposalRevisionRef === proposalRevisionRef
      ) {
        return;
      }
      window.history.pushState({}, "", path);
      setLocation({
        route: "/copilot",
        proposalRevisionRef,
        canonicalPath: path
      });
      window.scrollTo({ top: 0, behavior: "instant" });
    }
  };
}
