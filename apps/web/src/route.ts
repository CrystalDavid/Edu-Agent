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
  reflectionRef: string | null;
  lessonRef: string | null;
  fileAssetRef: string | null;
  fileLessonRef: string | null;
  canonicalPath: string;
}

export function parseAppRoute(
  pathname: string,
  search = ""
): ParsedRoute {
  const emptyFileContext = {
    fileAssetRef: null,
    fileLessonRef: null
  };
  const reflectionMatch = pathname.match(
    /^\/agent\/reflections\/([^/]+)$/
  );
  if (reflectionMatch?.[1]) {
    try {
      return {
        route: "/agent",
        proposalRevisionRef: null,
        preparationTaskRef: null,
        reflectionRef: decodeURIComponent(reflectionMatch[1]),
        lessonRef: null,
        ...emptyFileContext,
        canonicalPath: pathname
      };
    } catch {
      return {
        route: defaultRoute,
        proposalRevisionRef: null,
        preparationTaskRef: null,
        reflectionRef: null,
        lessonRef: null,
        ...emptyFileContext,
        canonicalPath: defaultRoute
      };
    }
  }
  const proposalMatch = pathname.match(
    /^\/copilot\/proposals\/([^/]+)$/
  );
  if (proposalMatch?.[1]) {
    try {
      return {
        route: "/copilot",
        proposalRevisionRef: decodeURIComponent(proposalMatch[1]),
        preparationTaskRef: null,
        reflectionRef: null,
        lessonRef: null,
        ...emptyFileContext,
        canonicalPath: pathname
      };
    } catch {
      return {
        route: defaultRoute,
        proposalRevisionRef: null,
        preparationTaskRef: null,
        reflectionRef: null,
        lessonRef: null,
        ...emptyFileContext,
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
        reflectionRef: null,
        lessonRef: null,
        ...emptyFileContext,
        canonicalPath: pathname
      };
    } catch {
      return {
        route: defaultRoute,
        proposalRevisionRef: null,
        preparationTaskRef: null,
        reflectionRef: null,
        lessonRef: null,
        ...emptyFileContext,
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
        reflectionRef: null,
        lessonRef: decodeURIComponent(lessonMatch[1]),
        ...emptyFileContext,
        canonicalPath: pathname
      };
    } catch {
      return {
        route: defaultRoute,
        proposalRevisionRef: null,
        preparationTaskRef: null,
        reflectionRef: null,
        lessonRef: null,
        ...emptyFileContext,
        canonicalPath: defaultRoute
      };
    }
  }
  const route = appRoutes.includes(pathname as AppRoute)
    ? (pathname as AppRoute)
    : defaultRoute;
  const fileParameters =
    route === "/files" ? new URLSearchParams(search) : null;
  return {
    route,
    proposalRevisionRef: null,
    preparationTaskRef: null,
    reflectionRef: null,
    lessonRef: null,
    fileAssetRef: fileParameters?.get("asset") || null,
    fileLessonRef: fileParameters?.get("lesson") || null,
    canonicalPath:
      pathname === "/" || pathname !== route ? defaultRoute : route
  };
}

export function useAppRoute(): {
  route: AppRoute;
  navigate: (route: AppRoute) => void;
  proposalRevisionRef: string | null;
  preparationTaskRef: string | null;
  reflectionRef: string | null;
  lessonRef: string | null;
  fileAssetRef: string | null;
  fileLessonRef: string | null;
  navigateProposal: (proposalRevisionRef: string) => void;
  navigateLesson: (lessonRef: string) => void;
  navigateReflection: (reflectionRef: string) => void;
  navigateFiles: (context?: {
    assetRef?: string;
    lessonRef?: string;
  }) => void;
  navigatePreparation: (
    preparationTaskRef: string,
    destination?: "/agent" | "/copilot" | "/teaching-plan" | "/runs"
  ) => void;
} {
  const [location, setLocation] = useState<ParsedRoute>(() =>
    parseAppRoute(window.location.pathname, window.location.search)
  );

  useEffect(() => {
    const initial = parseAppRoute(
      window.location.pathname,
      window.location.search
    );
    if (window.location.pathname !== initial.canonicalPath) {
      window.history.replaceState({}, "", initial.canonicalPath);
      setLocation(initial);
    }
    const onPopState = () => {
      const next = parseAppRoute(
        window.location.pathname,
        window.location.search
      );
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
    reflectionRef: location.reflectionRef,
    lessonRef: location.lessonRef,
    fileAssetRef: location.fileAssetRef,
    fileLessonRef: location.fileLessonRef,
    navigate(nextRoute) {
      if (
        nextRoute === location.route &&
        location.proposalRevisionRef === null &&
        location.preparationTaskRef === null &&
        location.reflectionRef === null &&
        location.lessonRef === null &&
        location.fileAssetRef === null &&
        location.fileLessonRef === null
      ) {
        return;
      }
      window.history.pushState({}, "", nextRoute);
      setLocation({
        route: nextRoute,
        proposalRevisionRef: null,
        preparationTaskRef: null,
        reflectionRef: null,
        lessonRef: null,
        fileAssetRef: null,
        fileLessonRef: null,
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
        reflectionRef: null,
        lessonRef: null,
        fileAssetRef: null,
        fileLessonRef: null,
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
        reflectionRef: null,
        lessonRef,
        fileAssetRef: null,
        fileLessonRef: null,
        canonicalPath: path
      });
      window.scrollTo({ top: 0, behavior: "instant" });
    },
    navigateReflection(reflectionRef) {
      const path = `/agent/reflections/${encodeURIComponent(reflectionRef)}`;
      window.history.pushState({}, "", path);
      setLocation({
        route: "/agent",
        proposalRevisionRef: null,
        preparationTaskRef: null,
        reflectionRef,
        lessonRef: null,
        fileAssetRef: null,
        fileLessonRef: null,
        canonicalPath: path
      });
      window.scrollTo({ top: 0, behavior: "instant" });
    },
    navigateFiles(context = {}) {
      const search = new URLSearchParams();
      if (context.assetRef) search.set("asset", context.assetRef);
      if (context.lessonRef) search.set("lesson", context.lessonRef);
      const path = `/files${search.size > 0 ? `?${search.toString()}` : ""}`;
      window.history.pushState({}, "", path);
      setLocation({
        route: "/files",
        proposalRevisionRef: null,
        preparationTaskRef: null,
        reflectionRef: null,
        lessonRef: null,
        fileAssetRef: context.assetRef ?? null,
        fileLessonRef: context.lessonRef ?? null,
        canonicalPath: "/files"
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
        reflectionRef: null,
        lessonRef: null,
        fileAssetRef: null,
        fileLessonRef: null,
        canonicalPath: path
      });
      window.scrollTo({ top: 0, behavior: "instant" });
    }
  };
}
