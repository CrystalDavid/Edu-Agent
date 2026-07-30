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
  preparationTaskRef: string | null;
  lessonRef: string | null;
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
        preparationTaskRef: null,
        lessonRef: null,
        canonicalPath: pathname
      };
    } catch {
      return {
        route: defaultRoute,
        proposalRevisionRef: null,
        preparationTaskRef: null,
        lessonRef: null,
        canonicalPath: defaultRoute
      };
    }
  }
  const preparationMatch = pathname.match(
    /^\/(agent|copilot|teaching-plan|runs)\/tasks\/([^/]+)$/
  );
  if (preparationMatch?.[1] && preparationMatch[2]) {
    try {
      return {
        route: `/${preparationMatch[1]}` as AppRoute,
        proposalRevisionRef: null,
        preparationTaskRef: decodeURIComponent(
          preparationMatch[2]
        ),
        lessonRef: null,
        canonicalPath: pathname
      };
    } catch {
      return {
        route: defaultRoute,
        proposalRevisionRef: null,
        preparationTaskRef: null,
        lessonRef: null,
        canonicalPath: defaultRoute
      };
    }
  }
  const lessonMatch = pathname.match(
    /^\/teaching\/lessons\/([^/]+)$/
  );
  if (lessonMatch?.[1]) {
    try {
      return {
        route: "/teaching",
        proposalRevisionRef: null,
        preparationTaskRef: null,
        lessonRef: decodeURIComponent(lessonMatch[1]),
        canonicalPath: pathname
      };
    } catch {
      return {
        route: defaultRoute,
        proposalRevisionRef: null,
        preparationTaskRef: null,
        lessonRef: null,
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
    preparationTaskRef: null,
    lessonRef: null,
    canonicalPath:
      pathname === "/" || pathname !== route ? defaultRoute : route
  };
}

export function useAppRoute(): {
  route: AppRoute;
  navigate: (route: AppRoute) => void;
  proposalRevisionRef: string | null;
  preparationTaskRef: string | null;
  lessonRef: string | null;
  navigateProposal: (proposalRevisionRef: string) => void;
  navigateLesson: (lessonRef: string) => void;
  navigatePreparation: (
    preparationTaskRef: string,
    destination?: "/agent" | "/copilot" | "/teaching-plan" | "/runs"
  ) => void;
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
    preparationTaskRef: location.preparationTaskRef,
    lessonRef: location.lessonRef,
    navigate(nextRoute) {
      if (
        nextRoute === location.route &&
        location.proposalRevisionRef === null &&
        location.preparationTaskRef === null &&
        location.lessonRef === null
      ) {
        return;
      }
      window.history.pushState({}, "", nextRoute);
      setLocation({
        route: nextRoute,
        proposalRevisionRef: null,
        preparationTaskRef: null,
        lessonRef: null,
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
        preparationTaskRef: null,
        lessonRef: null,
        canonicalPath: path
      });
      window.scrollTo({ top: 0, behavior: "instant" });
    },
    navigateLesson(lessonRef) {
      const path = `/teaching/lessons/${encodeURIComponent(
        lessonRef
      )}`;
      window.history.pushState({}, "", path);
      setLocation({
        route: "/teaching",
        proposalRevisionRef: null,
        preparationTaskRef: null,
        lessonRef,
        canonicalPath: path
      });
      window.scrollTo({ top: 0, behavior: "instant" });
    },
    navigatePreparation(
      preparationTaskRef,
      destination = "/agent"
    ) {
      const path = `${destination}/tasks/${encodeURIComponent(
        preparationTaskRef
      )}`;
      window.history.pushState({}, "", path);
      setLocation({
        route: destination,
        proposalRevisionRef: null,
        preparationTaskRef,
        lessonRef: null,
        canonicalPath: path
      });
      window.scrollTo({ top: 0, behavior: "instant" });
    }
  };
}
