import { mkdir } from "node:fs/promises";

import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { apiRoutes } from "@edu-agent/contracts";

import { playwrightArtifactPath } from "../config/test-artifacts.js";

const screenshotRoot = playwrightArtifactPath("evidence", "gate-2-10a");

test.beforeAll(async () => {
  await mkdir(screenshotRoot, { recursive: true });
});

async function freshContext(
  browser: Browser,
  baseURL: string | undefined
): Promise<BrowserContext> {
  if (!baseURL) throw new Error("Identity Playwright tests require a baseURL.");
  return browser.newContext({
    baseURL,
    storageState: { cookies: [], origins: [] }
  });
}

async function login(page: Page, profile: "teacher" | "admin" | "multi_school" | "school_b_teacher") {
  await page.goto("/overview");
  await expect(page.getByTestId("login-page")).toBeVisible();
  await page.getByTestId(`login-profile-${profile}`).click();
}

test.describe("Gate 2.10A formal identity and organization", () => {
  test("logs in with a server session, restores on refresh, and logs out", async ({ browser, baseURL }) => {
    const context = await freshContext(browser, baseURL);
    const page = await context.newPage();
    try {
      await login(page, "teacher");
      await expect(page.getByTestId("overview-page")).toBeVisible();
      await page.reload();
      await expect(page.getByTestId("overview-page")).toBeVisible();

      const session = await page.evaluate(async () => {
        const response = await fetch("/api/v1/auth/session", { credentials: "include" });
        return response.json();
      });
      expect(session).toMatchObject({
        authenticated: true,
        authenticationMethod: "local-identity",
        currentWorkspace: { organizationRef: "tenant:demo-school" }
      });
      const browserStorage = await page.evaluate(() => ({
        local: Object.entries(localStorage),
        session: Object.entries(sessionStorage)
      }));
      expect(JSON.stringify(browserStorage)).not.toMatch(/token|actorRef|tenantRef|roleRefs/i);

      await page.screenshot({
        path: `${screenshotRoot}/01-local-session-overview.png`,
        fullPage: true,
        animations: "disabled"
      });

      await page.getByTestId("teacher-profile-trigger").click();
      await page.getByTestId("profile-logout").click();
      await expect(page.getByTestId("login-page")).toBeVisible();
      const denied = await page.evaluate(async () =>
        (await fetch("/api/v1/teacher/course-runs", { credentials: "include" })).status
      );
      expect(denied).toBe(401);
    } finally {
      await context.close();
    }
  });

  test("selects School B and prevents School A resource leakage", async ({ browser, baseURL }) => {
    const context = await freshContext(browser, baseURL);
    const page = await context.newPage();
    try {
      await login(page, "multi_school");
      await expect(page.getByTestId("workspace-selection-page")).toBeVisible();
      await page.getByTestId("workspace-tenant:demo-school-b").click();
      await expect(page.getByTestId("overview-page")).toBeVisible();

      const result = await page.evaluate(async () => {
        const [session, courses, denied] = await Promise.all([
          fetch("/api/v1/auth/session", { credentials: "include" }).then((value) => value.json()),
          fetch("/api/v1/teacher/course-runs", { credentials: "include" }).then((value) => value.json()),
          fetch("/api/v1/teacher/course-runs/course-run%3Agrade8-math-class3-2026-fall", {
            credentials: "include"
          })
        ]);
        return { session, courses, deniedStatus: denied.status };
      });
      expect(result.session.currentWorkspace.organizationRef).toBe("tenant:demo-school-b");
      expect(result.courses.items).toEqual([
        expect.objectContaining({
          courseRunRef: "course-run:school-b-grade8-math-2026-fall"
        })
      ]);
      expect(result.deniedStatus).toBe(404);

      await page.reload();
      await expect(page.getByTestId("overview-page")).toBeVisible();
      const restored = await page.evaluate(async () =>
        fetch("/api/v1/auth/session", { credentials: "include" }).then((value) => value.json())
      );
      expect(restored.currentWorkspace.organizationRef).toBe("tenant:demo-school-b");
      await page.screenshot({
        path: `${screenshotRoot}/02-school-b-workspace-isolation.png`,
        fullPage: true,
        animations: "disabled"
      });
    } finally {
      await context.close();
    }
  });

  test("lets a School Admin preconfigure, suspend, and reactivate a teacher", async ({ browser, baseURL }) => {
    const teacherContext = await freshContext(browser, baseURL);
    const teacherPage = await teacherContext.newPage();
    const adminContext = await freshContext(browser, baseURL);
    const adminPage = await adminContext.newPage();
    try {
      await login(teacherPage, "multi_school");
      await expect(teacherPage.getByTestId("workspace-selection-page")).toBeVisible();
      await teacherPage.getByTestId("workspace-tenant:demo-school").click();
      await expect(teacherPage.getByTestId("overview-page")).toBeVisible();
      await login(adminPage, "admin");
      await expect(adminPage.getByTestId("overview-page")).toBeVisible();
      await adminPage.goto("/settings");
      await expect(adminPage.getByTestId("school-admin-panel")).toBeVisible();

      const uniqueSubject = `playwright-subject-${Date.now()}`;
      await adminPage.getByTestId("admin-new-member-name").fill("Playwright Synthetic Teacher");
      await adminPage.getByTestId("admin-new-member-subject").fill(uniqueSubject);
      await adminPage.getByTestId("admin-create-member").click();
      await expect(adminPage.getByText("Playwright Synthetic Teacher")).toBeVisible();
      await adminPage.screenshot({
        path: `${screenshotRoot}/03-school-admin-member-management.png`,
        fullPage: true,
        animations: "disabled"
      });

      const teacherMembership = await adminPage.evaluate(async (membersRoute) => {
        const response = await fetch(membersRoute, {
          credentials: "include"
        });
        const body = await response.json();
        return body.items.find((item: { userRef: string }) => item.userRef === "user:multi-school-001");
      }, apiRoutes.organization.members) as { membershipRef: string };
      await adminPage.getByTestId(`member-status-${teacherMembership.membershipRef}`).click();
      await expect.poll(async () => teacherPage.evaluate(async () =>
        (await fetch("/api/v1/teacher/course-runs", { credentials: "include" })).status
      )).toBe(401);

      await expect(adminPage.getByTestId(`member-status-${teacherMembership.membershipRef}`)).toBeVisible();
      await adminPage.getByTestId(`member-status-${teacherMembership.membershipRef}`).click();
      const relogin = await freshContext(browser, baseURL);
      const reloginPage = await relogin.newPage();
      try {
        await login(reloginPage, "multi_school");
        await expect(reloginPage.getByTestId("workspace-selection-page")).toBeVisible();
        await reloginPage.getByTestId("workspace-tenant:demo-school").click();
        await expect(reloginPage.getByTestId("overview-page")).toBeVisible();
      } finally {
        await relogin.close();
      }
    } finally {
      await Promise.all([teacherContext.close(), adminContext.close()]);
    }
  });
});
