import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse
} from "node:http";

export type FakeArkScenario =
  | "success"
  | "rate-limit-once"
  | "server-error"
  | "timeout"
  | "disconnect"
  | "non-json"
  | "schema-error"
  | "repair-success"
  | "repair-fail";

export interface FakeArkServer {
  baseUrl: string;
  controlUrl: string;
  requests: readonly {
    path: string;
    body: Record<string, unknown>;
  }[];
  setScenario(scenario: FakeArkScenario): void;
  close(): Promise<void>;
}

export async function startFakeArkServer(input: {
  scenario?: FakeArkScenario;
  timeoutMilliseconds?: number;
  port?: number;
} = {}): Promise<FakeArkServer> {
  let scenario = input.scenario ?? "success";
  let callCount = 0;
  const requests: {
    path: string;
    body: Record<string, unknown>;
  }[] = [];
  const server = createServer(
    async (
      request: IncomingMessage,
      response: ServerResponse
    ) => {
      if (
        request.method === "GET" &&
        request.url === "/__fake_ark/status"
      ) {
        respondJson(response, 200, {
          provider: "fake-volcengine-ark",
          scenario,
          callCount
        });
        return;
      }
      if (
        request.method === "POST" &&
        request.url === "/__fake_ark/scenario"
      ) {
        const control = await readJson(request);
        if (
          typeof control["scenario"] !== "string" ||
          !isFakeArkScenario(control["scenario"])
        ) {
          respondJson(response, 400, {
            error: { message: "unknown synthetic scenario" }
          });
          return;
        }
        scenario = control["scenario"];
        callCount = 0;
        respondJson(response, 200, {
          provider: "fake-volcengine-ark",
          scenario
        });
        return;
      }
      if (
        request.method !== "POST" ||
        request.url !== "/api/v3/chat/completions"
      ) {
        respondJson(response, 404, {
          error: { message: "not found" }
        });
        return;
      }
      const body = await readJson(request);
      requests.push({
        path: request.url,
        body
      });
      callCount += 1;
      if (body["stream"] === true) {
        response.writeHead(200, {
          "content-type": "text/event-stream"
        });
        response.write(
          `data: ${JSON.stringify({
            id: "fake-stream",
            object: "chat.completion.chunk",
            model: String(body["model"] ?? "fake-model"),
            choices: [
              {
                index: 0,
                delta: { content: "好" },
                finish_reason: null
              }
            ]
          })}\n\n`
        );
        response.end("data: [DONE]\n\n");
        return;
      }
      if (
        scenario === "rate-limit-once" &&
        callCount === 1
      ) {
        response.setHeader("retry-after", "0");
        respondJson(response, 429, {
          error: {
            message: "synthetic rate limit",
            type: "rate_limit_error"
          }
        });
        return;
      }
      if (scenario === "server-error") {
        respondJson(response, 500, {
          error: {
            message: "synthetic temporary failure",
            type: "server_error"
          }
        });
        return;
      }
      if (scenario === "timeout") {
        setTimeout(
          () =>
            respondJson(response, 200, completion(body)),
          input.timeoutMilliseconds ?? 500
        );
        return;
      }
      if (scenario === "disconnect") {
        request.socket.destroy();
        return;
      }
      if (scenario === "non-json") {
        response.writeHead(200, {
          "content-type": "text/plain"
        });
        response.end("not-json");
        return;
      }

      const isRepair = JSON.stringify(body).includes(
        "唯一一次受控修复"
      );
      if (
        scenario === "schema-error" ||
        (scenario === "repair-success" && !isRepair) ||
        scenario === "repair-fail"
      ) {
        respondJson(
          response,
          200,
          completion(body, '{"schemaVersion":"wrong"}')
        );
        return;
      }
      respondJson(response, 200, completion(body));
    }
  );
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(input.port ?? 0, "127.0.0.1", () =>
      resolve()
    );
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Fake Ark server did not bind a TCP port.");
  }
  return {
    baseUrl: `http://127.0.0.1:${address.port}/api/v3`,
    controlUrl: `http://127.0.0.1:${address.port}/__fake_ark`,
    get requests() {
      return requests;
    },
    setScenario(value) {
      scenario = value;
      callCount = 0;
    },
    close: () => closeServer(server)
  };
}

function isFakeArkScenario(
  value: string
): value is FakeArkScenario {
  return [
    "success",
    "rate-limit-once",
    "server-error",
    "timeout",
    "disconnect",
    "non-json",
    "schema-error",
    "repair-success",
    "repair-fail"
  ].includes(value);
}

function completion(
  body: Record<string, unknown>,
  content?: string
) {
  const tools = Array.isArray(body["tools"])
    ? body["tools"]
    : [];
  const isFunctionProbe = tools.length > 0;
  const serialized = JSON.stringify(body["messages"] ?? []);
  const responseContent =
    content ??
    (serialized.includes("中文文本能力")
      ? "中文文本能力正常"
      : serialized.includes("JSON Object Probe") ||
          serialized.includes("JSON Schema Probe")
        ? '{"ok":true}'
        : serialized.includes("Image URL Probe")
          ? '{"description":"公开合成测试图片"}'
          : JSON.stringify(validSuggestion(body)));
  return {
    id: "chatcmpl_fake_request_1234567890",
    object: "chat.completion",
    created: 1_785_427_200,
    model: String(body["model"] ?? "fake-model"),
    choices: [
      {
        index: 0,
        message: isFunctionProbe
          ? {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: "call_fake_probe",
                  type: "function",
                  function: {
                    name: "report_probe",
                    arguments: '{"ok":true}'
                  }
                }
              ]
            }
          : {
              role: "assistant",
              content: responseContent
            },
        finish_reason: isFunctionProbe
          ? "tool_calls"
          : "stop"
      }
    ],
    usage: {
      prompt_tokens: 120,
      completion_tokens: 240,
      total_tokens: 360
    }
  };
}

function validSuggestion(body: Record<string, unknown>) {
  const scope = extractScope(body);
  const evidenceRefs =
    scope.evidenceRefs.length > 0
      ? scope.evidenceRefs
      : ["evidence:synthetic"];
  return {
    schemaVersion: "teacher-copilot-suggestions@1",
    suggestions: [
      {
        strategyId: "strategy:fake-ark-contrast",
        title: "合成对比任务",
        summary: "比较同截距直线并形成可审阅的解释建议。",
        rationale:
          "授权的合成证据显示需要连接变化率与图像陡峭程度。",
        evidenceRefs,
        knownGaps: ["尚缺少课堂实施后的独立迁移证据"],
        applicability: "适用于当前合成八年级一次函数课时。",
        unsuitableConditions: ["尚未理解坐标系基本读法"],
        teachingMoves: [
          "比较同截距不同斜率的合成直线",
          "用单位变化率解释图像变化"
        ],
        proposedPlanChanges: {
          objective: "解释斜率与一次函数图像变化的关系",
          lessonFocus: "斜率、方向与陡峭程度",
          openingActivity: "比较三条同截距合成直线",
          teacherQuestions: [
            "横坐标增加 1 时纵坐标怎样变化？"
          ],
          studentActivity:
            "完成图像、表格和语言描述的合成配对任务",
          supportStrategy:
            "提供单位变化率句式支架，不直接给答案",
          independentCheck:
            "独立解释一条新直线的方向和陡峭程度",
          followUp: "收集解释并标记未知项",
          evidenceRefs
        },
        followUpEvidence: ["收集一条独立解释"],
        uncertaintyNote:
          "仅基于合成证据，仍需教师审阅并观察课堂表现。",
        courseRunRef: scope.courseRunRef,
        lessonRef: scope.lessonRef,
        learningObjectiveRefs:
          scope.learningObjectiveRefs
      }
    ]
  };
}

function extractScope(body: Record<string, unknown>): {
  courseRunRef: string;
  lessonRef: string;
  learningObjectiveRefs: string[];
  evidenceRefs: string[];
} {
  const messages = Array.isArray(body["messages"])
    ? body["messages"]
    : [];
  for (const rawMessage of messages) {
    if (
      typeof rawMessage !== "object" ||
      rawMessage === null
    ) {
      continue;
    }
    const content = (rawMessage as { content?: unknown })
      .content;
    if (typeof content !== "string") continue;
    try {
      const parsed = JSON.parse(content) as {
        courseRun?: { courseRunRef?: string };
        lesson?: { lessonRef?: string };
        learningObjectives?: {
          objectiveRef?: string;
        }[];
        authorizedEvidence?: {
          evidenceRef?: string;
        }[];
        requiredScope?: {
          courseRunRef?: string;
          lessonRef?: string;
          learningObjectiveRefs?: string[];
          evidenceRefs?: string[];
        };
      };
      if (parsed.requiredScope) {
        return {
          courseRunRef:
            parsed.requiredScope.courseRunRef ??
            "course-run:synthetic",
          lessonRef:
            parsed.requiredScope.lessonRef ??
            "lesson:synthetic",
          learningObjectiveRefs:
            parsed.requiredScope.learningObjectiveRefs ?? [
              "objective:synthetic"
            ],
          evidenceRefs:
            parsed.requiredScope.evidenceRefs ?? [
              "evidence:synthetic"
            ]
        };
      }
      if (parsed.courseRun && parsed.lesson) {
        return {
          courseRunRef:
            parsed.courseRun.courseRunRef ??
            "course-run:synthetic",
          lessonRef:
            parsed.lesson.lessonRef ?? "lesson:synthetic",
          learningObjectiveRefs: (
            parsed.learningObjectives ?? []
          )
            .map((item) => item.objectiveRef)
            .filter(
              (value): value is string =>
                typeof value === "string"
            ),
          evidenceRefs: (
            parsed.authorizedEvidence ?? []
          )
            .map((item) => item.evidenceRef)
            .filter(
              (value): value is string =>
                typeof value === "string"
            )
        };
      }
    } catch {
      // Probe messages are not structured lesson requests.
    }
  }
  return {
    courseRunRef: "course-run:synthetic",
    lessonRef: "lesson:synthetic",
    learningObjectiveRefs: ["objective:synthetic"],
    evidenceRefs: ["evidence:synthetic"]
  };
}

async function readJson(
  request: IncomingMessage
): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(
      Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    );
  }
  const text = Buffer.concat(chunks).toString("utf8");
  const value: unknown = JSON.parse(text);
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new Error("Expected a JSON object request.");
  }
  return value as Record<string, unknown>;
}

function respondJson(
  response: ServerResponse,
  status: number,
  value: unknown
): void {
  if (response.destroyed) return;
  response.writeHead(status, {
    "content-type": "application/json",
    "x-request-id": "req_fake_safe_1234567890"
  });
  response.end(JSON.stringify(value));
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) =>
      error ? reject(error) : resolve()
    );
  });
}
