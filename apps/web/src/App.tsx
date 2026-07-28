import { useState } from "react";

interface WalkingResult {
  replayed: boolean;
  taskRef: string;
  taskRunRef: string;
  agentRunRef: string;
  artifactRef: string;
  artifactRevisionRef: string;
  modelProvider: "mock";
  toolName: "fake.echo";
}

const command = {
  kind: "Command",
  envelopeId: "envelope:web:gate1a",
  tenantRef: "tenant:demo-school",
  actorRef: "user:teacher-001",
  purpose: "gate1a.walking-skeleton",
  idempotencyKey: "idem:web:gate1a:0001",
  occurredAt: "2026-07-28T08:00:00.000Z",
  commandName: "CreateWalkingSkeletonArtifact",
  payload: {
    title: "Gate 1A 无 LLM 骨架",
    body: "本次执行只使用 MockModelProvider、FakeTool 和合成数据。"
  }
};

export function App() {
  const [result, setResult] = useState<WalkingResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  async function runSkeleton() {
    setRunning(true);
    setError(null);
    try {
      const response = await fetch(
        "/api/v1/commands/walking-skeleton",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-demo-tenant": "tenant:demo-school",
            "x-demo-actor": "user:teacher-001"
          },
          body: JSON.stringify(command)
        }
      );
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      setResult((await response.json()) as WalkingResult);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unknown error"
      );
    } finally {
      setRunning(false);
    }
  }

  return (
    <main>
      <section className="hero">
        <p className="eyebrow">教育智能体平台 · Gate 1A</p>
        <h1>无 LLM Walking Skeleton</h1>
        <p className="lede">
          验证五类 Ingress、Run 归属、正式写入治理、Outbox、
          Audit、MockModelProvider 与 FakeTool。当前不包含真实模型和教育领域推断。
        </p>
        <button type="button" onClick={runSkeleton} disabled={running}>
          {running ? "执行中…" : "运行确定性闭环"}
        </button>
      </section>

      <section className="status" aria-live="polite">
        {error ? <p className="error">执行失败：{error}</p> : null}
        {!result ? (
          <p>尚未执行。服务端不会访问任何外部模型。</p>
        ) : (
          <>
            <div className="badge">完成 · {result.modelProvider}</div>
            <dl>
              <div>
                <dt>TaskRun</dt>
                <dd>{result.taskRunRef}</dd>
              </div>
              <div>
                <dt>AgentRun</dt>
                <dd>{result.agentRunRef}</dd>
              </div>
              <div>
                <dt>ArtifactRevision</dt>
                <dd>{result.artifactRevisionRef}</dd>
              </div>
              <div>
                <dt>Tool</dt>
                <dd>{result.toolName}</dd>
              </div>
            </dl>
          </>
        )}
      </section>
    </main>
  );
}
