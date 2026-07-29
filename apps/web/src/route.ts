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

function normalizeRoute(pathname: string): AppRoute {
  return appRoutes.includes(pathname as AppRoute)
    ? (pathname as AppRoute)
    : defaultRoute;
}

export function useAppRoute(): {
  route: AppRoute;
  navigate: (route: AppRoute) => void;
} {
  const [route, setRoute] = useState<AppRoute>(() =>
    normalizeRoute(window.location.pathname)
  );

  useEffect(() => {
    const initial = normalizeRoute(window.location.pathname);
    if (window.location.pathname === "/" || window.location.pathname !== initial) {
      window.history.replaceState({}, "", defaultRoute);
      setRoute(defaultRoute);
    }
    const onPopState = () => {
      const next = normalizeRoute(window.location.pathname);
      if (window.location.pathname === "/" || window.location.pathname !== next) {
        window.history.replaceState({}, "", defaultRoute);
        setRoute(defaultRoute);
        return;
      }
      setRoute(next);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  return {
    route,
    navigate(nextRoute) {
      if (nextRoute === route) return;
      window.history.pushState({}, "", nextRoute);
      setRoute(nextRoute);
      window.scrollTo({ top: 0, behavior: "instant" });
    }
  };
}
