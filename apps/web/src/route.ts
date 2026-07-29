import { useEffect, useState } from "react";

export const appRoutes = [
  "/",
  "/schedule",
  "/courses",
  "/students",
  "/assignments",
  "/files",
  "/settings",
  "/goals",
  "/evidence",
  "/copilot",
  "/teaching-plan",
  "/runs",
  "/style-guide"
] as const;

export type AppRoute = (typeof appRoutes)[number];

function normalizeRoute(pathname: string): AppRoute {
  return appRoutes.includes(pathname as AppRoute)
    ? (pathname as AppRoute)
    : "/";
}

export function useAppRoute(): {
  route: AppRoute;
  navigate: (route: AppRoute) => void;
} {
  const [route, setRoute] = useState<AppRoute>(() =>
    normalizeRoute(window.location.pathname)
  );

  useEffect(() => {
    const onPopState = () => {
      setRoute(normalizeRoute(window.location.pathname));
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
