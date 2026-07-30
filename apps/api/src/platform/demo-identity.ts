export type ApplicationEnvironment =
  | "local"
  | "demo"
  | "test"
  | "production";

export interface DemoIdentityPolicy {
  applicationEnvironment: ApplicationEnvironment;
  allowBypass: boolean;
}

const validEnvironments = new Set<ApplicationEnvironment>([
  "local",
  "demo",
  "test",
  "production"
]);

export function createDemoIdentityPolicy(
  environment: NodeJS.ProcessEnv = process.env
): DemoIdentityPolicy {
  const configured =
    environment.APP_ENV ??
    (environment.NODE_ENV === "production"
      ? "production"
      : "test");
  if (
    !validEnvironments.has(
      configured as ApplicationEnvironment
    )
  ) {
    throw new Error(
      "APP_ENV must be local, demo, test, or production."
    );
  }
  const applicationEnvironment =
    configured as ApplicationEnvironment;
  const allowBypass =
    environment.DEMO_AUTH_BYPASS === "true";

  if (
    allowBypass &&
    (environment.NODE_ENV === "production" ||
      applicationEnvironment === "production")
  ) {
    throw new Error(
      "DEMO_AUTH_BYPASS is forbidden in production."
    );
  }
  if (
    allowBypass &&
    applicationEnvironment !== "local" &&
    applicationEnvironment !== "demo"
  ) {
    throw new Error(
      "DEMO_AUTH_BYPASS requires APP_ENV=local or APP_ENV=demo."
    );
  }

  return {
    applicationEnvironment,
    allowBypass
  };
}

export const strictDemoIdentityPolicy: DemoIdentityPolicy = {
  applicationEnvironment: "test",
  allowBypass: false
};
