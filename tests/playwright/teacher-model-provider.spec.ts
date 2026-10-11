import { mkdir } from "node:fs/promises";

import { apiRoutes } from "@edu-agent/contracts";
import {
  expect,
  test,
  type APIRequestContext,
  type Page
} from "@playwright/test";

import { playwrightArtifactPath } from "../config/test-artifacts.js";

const headers = {
  "x-demo-tenant": "tenant:demo-school",
  "x-demo-actor": "user:teacher-001"
};
const screenshotRoot = playwrightArtifactPath("evidence", "gate-2-6a");
const fakeArkPort = Number(process.env.E2E_FAKE_ARK_PORT);
const fakeArkControlOrigin =
  `http://127.0.0.1:${fakeArkPort}/__fake_ark`;

test.beforeAll(async () => {
  expect(Number.isInteger(fakeArkPort)).toBe(true);
  await mkdir(screenshotRoot, { recursive: true });
});

test("Fake Ark remains recoverable across timeout, retry, 429, repair failure and cancellation", async ({
  page,
  request
}) => {
  const monitor = monitorPage(page);
  await setFakeArkScenario(request, "timeout");
  await page.goto("/teaching");
  await expect(page.getByTestId("lesson-list")).toBeVisible();
  await page.getByTestId("lesson-3").click();
  await page.getByTestId("start-lesson-preparation").click();
  await expect(page).toHaveURL(/\/agent\/tasks\//);
  await expect(
    page.getByTestId("model-provider-availability")
  ).toContainText("Synthetic Ark Model");

  const first = await submitModelRequest(
    page,
    "请生成一条用于验证超时恢复的备课建议。"
  );
  const taskRef = first.execution.taskRef as string;
  await expect(page.getByTestId("generate-copilot")).toBeDisabled();
  await expect(page.getByTestId("generation-disabled-reason")).toContainText(
    "已有模型执行正在进行"
  );
  await expect(
    page.getByTestId("model-execution-status")
  ).toContainText(/等待生成|正在生成|正在重试/u);
  await page.reload();
  await expect(page).toHaveURL(/modelExecution=/u);
  await expect(
    page.getByTestId("model-execution-status")
  ).toContainText(/等待生成|正在生成|正在重试|生成超时/u);
  await expect(
    page.getByTestId("model-execution-status")
  ).toContainText("生成超时", { timeout: 15_000 });

  await setFakeArkScenario(request, "success");
  await page.getByTestId("retry-model-execution").click();
  await expect(
    page.getByRole("heading", { name: "比较教学策略" })
  ).toBeVisible({ timeout: 20_000 });
  await page.screenshot({
    path: `${screenshotRoot}/01-ark_provider_recovered_proposal.png`,
    fullPage: true,
    animations: "disabled"
  });

  await page.getByTestId("reject-suggestion").click();
  await expect(page.getByText("已拒绝")).toBeVisible({
    timeout: 10_000
  });
  await page.getByRole("button", { name: "查看运行依据" }).click();
  await expect(page).toHaveURL(/\/runs\/tasks\//);
  await page.getByText("查看可审计技术详情").click();
  await page.getByText("模型执行安全摘要").click();
  await expect(
    page
      .getByText("Volcengine Ark · Synthetic Ark Model", {
        exact: true
      })
      .first()
  ).toBeVisible();
  await expect(page.getByText("模型用量")).toBeVisible();
  await expect(page.getByText("估算费用")).toBeVisible();
  await expect(page.getByText("尝试次数")).toBeVisible();
  await expect(page.getByText("服务请求标识")).toBeVisible();
  await expect(page.locator("body")).not.toContainText(
    "placeholder-for-local-fake"
  );
  await expect(page.locator("body")).not.toContainText(
    "ARK_API_KEY"
  );

  await page.goto(
    `/agent/tasks/${encodeURIComponent(taskRef)}`
  );
  await setFakeArkScenario(request, "rate-limit-once");
  await submitModelRequest(
    page,
    "请验证限流后有限重试可以形成同一条教学建议。"
  );
  await expect(
    page.getByRole("heading", { name: "比较教学策略" })
  ).toBeVisible({ timeout: 20_000 });
  await expect
    .poll(async () => await fakeArkCallCount(request))
    .toBe(2);

  await page.goto(
    `/agent/tasks/${encodeURIComponent(taskRef)}`
  );
  const pendingBefore = await pendingProposalCount(request);
  await setFakeArkScenario(request, "repair-fail");
  await submitModelRequest(
    page,
    "请验证两次结构错误后不会创建空 Proposal。"
  );
  await expect(
    page.getByTestId("model-execution-status")
  ).toContainText("验证失败", { timeout: 20_000 });
  expect(await pendingProposalCount(request)).toBe(
    pendingBefore
  );

  await page.goto(
    `/agent/tasks/${encodeURIComponent(taskRef)}`
  );
  await setFakeArkScenario(request, "timeout");
  const cancelled = await submitModelRequest(
    page,
    "请验证运行中的教学建议生成可以取消。"
  );
  await expect(
    page.getByTestId("model-execution-status")
  ).toContainText("正在生成", { timeout: 5_000 });
  await page.getByTestId("cancel-model-execution").click();
  await expect(
    page.getByTestId("model-execution-status")
  ).toContainText("已取消", { timeout: 10_000 });
  const cancelledDetail = await request.get(
    apiRoutes.teacher.modelInvocation(
      cancelled.execution.modelExecutionRef as string
    ),
    { headers }
  );
  expect(cancelledDetail.status()).toBe(200);
  await expect(cancelledDetail.json()).resolves.toMatchObject({
    status: "cancelled",
    proposalRevisionRef: null
  });
  await page.screenshot({
    path: `${screenshotRoot}/02-ark_provider_cancelled.png`,
    fullPage: true,
    animations: "disabled"
  });

  expect(monitor.errors).toEqual([]);
  expect(monitor.warnings).toEqual([]);
  expect(monitor.nonLocalRequests).toEqual([]);
});

async function submitModelRequest(
  page: Page,
  requestText: string
) {
  const input = page.getByRole("textbox", {
    name: "告诉 Agent 你想完成什么"
  });
  await input.fill(requestText);
  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith(
        apiRoutes.teacher.modelInvocations
      ) && response.request().method() === "POST"
  );
  await page.getByTestId("generate-copilot").click();
  const response = await responsePromise;
  expect(response.status()).toBe(202);
  return (await response.json()) as {
    execution: Record<string, unknown>;
  };
}

async function setFakeArkScenario(
  request: APIRequestContext,
  scenario: string
) {
  const response = await request.post(
    `${fakeArkControlOrigin}/scenario`,
    { data: { scenario } }
  );
  expect(response.status()).toBe(200);
}

async function fakeArkCallCount(
  request: APIRequestContext
) {
  const response = await request.get(
    `${fakeArkControlOrigin}/status`
  );
  expect(response.status()).toBe(200);
  const body = (await response.json()) as {
    callCount: number;
  };
  return body.callCount;
}

async function pendingProposalCount(
  request: APIRequestContext
) {
  const response = await request.get(
    apiRoutes.demo.pendingProposals,
    { headers }
  );
  expect(response.status()).toBe(200);
  const body = (await response.json()) as {
    items: unknown[];
  };
  return body.items.length;
}

function monitorPage(page: Page) {
  const errors: string[] = [];
  const warnings: string[] = [];
  const nonLocalRequests: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
    if (message.type() === "warning") warnings.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (webRequest) => {
    const url = new URL(webRequest.url());
    if (!["localhost", "127.0.0.1"].includes(url.hostname)) {
      nonLocalRequests.push(webRequest.url());
    }
  });
  return { errors, warnings, nonLocalRequests };
}
