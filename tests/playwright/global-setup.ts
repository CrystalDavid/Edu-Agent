import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { request, type FullConfig } from "@playwright/test";

export const teacherAuthenticationStatePath = resolve(
  "test-results/playwright/.auth/teacher.json"
);

export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0]?.use.baseURL;
  if (typeof baseURL !== "string") {
    throw new Error("Playwright identity setup requires a Web baseURL.");
  }
  await mkdir(dirname(teacherAuthenticationStatePath), { recursive: true });
  const api = await request.newContext({ baseURL });
  try {
    const response = await api.post("/api/v1/auth/local-login", {
      data: { profile: "teacher", returnTo: "/overview" }
    });
    if (response.status() !== 201) {
      throw new Error(
        `Local identity login failed during Playwright setup: HTTP ${response.status()}.`
      );
    }
    const status = (await response.json()) as {
      authenticated?: boolean;
      authenticationMethod?: string;
      currentWorkspace?: { organizationRef?: string } | null;
    };
    if (
      status.authenticated !== true ||
      status.authenticationMethod !== "local-identity" ||
      status.currentWorkspace?.organizationRef !== "tenant:demo-school"
    ) {
      throw new Error("Playwright setup did not receive the expected server session.");
    }
    await api.storageState({ path: teacherAuthenticationStatePath });
  } finally {
    await api.dispose();
  }
}
