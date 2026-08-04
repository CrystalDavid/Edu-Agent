import { useEffect, useState } from "react";

import type {
  MemoryCandidateView,
  TeacherPersonalizationState
} from "@edu-agent/contracts";
import { Alert, Button, Empty, Input, Space, Tag, Typography } from "antd";

import {
  createMemoryCandidate,
  loadTeacherPersonalization,
  reviewMemoryCandidate,
  revokeTeacherPreference,
  updateTeacherPreference
} from "../../api";

const preferenceLabels: Record<string, string> = {
  lesson_plan_detail: "教案详细程度",
  lesson_plan_style: "教案表达风格",
  example_preference: "案例偏好",
  response_length: "建议篇幅"
};

export function TeacherPreferenceSettings(props: {
  onAction: (message: string) => void;
}) {
  const [state, setState] = useState<TeacherPersonalizationState>({
    candidates: [],
    preferences: []
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draftKey, setDraftKey] = useState("lesson_plan_detail");
  const [draftValue, setDraftValue] = useState("");
  const [draftSummary, setDraftSummary] = useState("");
  const [editing, setEditing] = useState<Record<string, string>>({});

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      setState(await loadTeacherPersonalization());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "无法读取教师偏好。");
    } finally {
      setLoading(false);
    }
  };

  const execute = async (action: () => Promise<void>) => {
    setError(null);
    try {
      await action();
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "偏好操作失败，请刷新后重试。");
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const draftCandidates = state.candidates.filter(
    (candidate) => candidate.status === "draft"
  );
  const activePreferences = state.preferences.filter(
    (preference) => preference.status === "active"
  );
  const revokedPreferences = state.preferences.filter(
    (preference) => preference.status === "revoked"
  );

  return (
    <div className="teacher-preference-settings" data-testid="teacher-preference-settings">
      {error ? <Alert type="error" showIcon message={error} /> : null}
      <Alert
        type="info"
        showIcon
        message="由您决定 Agent 可以长期使用哪些偏好"
        description="候选偏好在确认前不会进入模型上下文；撤销后会立即停止使用，同时保留必要的审计历史。"
      />

      <section>
        <h3>待您确认</h3>
        {draftCandidates.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={loading ? "加载中" : "暂无待确认偏好"} />
        ) : (
          <div className="settings-list">
            {draftCandidates.map((candidate) => (
              <CandidateRow
                key={candidate.candidateRef}
                candidate={candidate}
                onConfirm={() => void execute(async () => {
                  await reviewMemoryCandidate(candidate.candidateRef, "confirm", {
                    expectedVersion: candidate.version,
                    purpose: "personalization.candidate.confirm",
                    idempotencyKey: `ui-preference-confirm-${crypto.randomUUID()}`
                  });
                  props.onAction("偏好已确认，后续备课可按此调整表达方式。");
                })}
                onReject={() => void execute(async () => {
                  await reviewMemoryCandidate(candidate.candidateRef, "reject", {
                    expectedVersion: candidate.version,
                    purpose: "personalization.candidate.reject",
                    idempotencyKey: `ui-preference-reject-${crypto.randomUUID()}`
                  });
                  props.onAction("偏好候选已忽略，不会进入 Agent 上下文。");
                })}
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <h3>已确认偏好</h3>
        {activePreferences.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="尚未确认长期偏好" />
        ) : (
          <div className="settings-list">
            {activePreferences.map((preference) => {
              const value = editing[preference.preferenceRef] ?? preference.preferenceValue;
              return (
                <article className="settings-row" key={preference.preferenceRef} data-testid={`preference-${preference.preferenceRef}`}>
                  <span>
                    <strong>{preferenceLabel(preference.preferenceKey)}</strong>
                    <small>确认后可用于备课建议 · 版本 {preference.version}</small>
                  </span>
                  <Space wrap>
                    <Input
                      aria-label={`${preferenceLabel(preference.preferenceKey)}的值`}
                      value={value}
                      onChange={(event) => setEditing((current) => ({
                        ...current,
                        [preference.preferenceRef]: event.target.value
                      }))}
                    />
                    <Button
                      disabled={!value.trim() || value.trim() === preference.preferenceValue}
                      onClick={() => void execute(async () => {
                        await updateTeacherPreference(preference.preferenceRef, {
                          preferenceValue: value.trim(),
                          expectedVersion: preference.version,
                          purpose: "personalization.preference.update",
                          idempotencyKey: `ui-preference-update-${crypto.randomUUID()}`
                        });
                        setEditing((current) => {
                          const next = { ...current };
                          delete next[preference.preferenceRef];
                          return next;
                        });
                        props.onAction("偏好已更新。");
                      })}
                    >保存修改</Button>
                    <Button
                      danger
                      data-testid={`revoke-preference-${preference.preferenceRef}`}
                      onClick={() => void execute(async () => {
                        await revokeTeacherPreference(preference.preferenceRef, {
                          expectedVersion: preference.version,
                          purpose: "personalization.preference.revoke",
                          idempotencyKey: `ui-preference-revoke-${crypto.randomUUID()}`
                        });
                        props.onAction("偏好已撤销，Agent 将不再使用它。");
                      })}
                    >删除并撤销</Button>
                  </Space>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <h3>手动记录偏好</h3>
        <Typography.Paragraph type="secondary">
          手动记录也先形成候选，仍需您再次确认后才会用于 Agent。
        </Typography.Paragraph>
        <Space direction="vertical" style={{ width: "100%" }}>
          <Input value={draftKey} onChange={(event) => setDraftKey(event.target.value)} placeholder="偏好类型，例如 lesson_plan_detail" />
          <Input value={draftValue} onChange={(event) => setDraftValue(event.target.value)} placeholder="偏好内容，例如 简洁、突出课堂案例" />
          <Input.TextArea value={draftSummary} onChange={(event) => setDraftSummary(event.target.value)} placeholder="为什么记录这条偏好" autoSize={{ minRows: 2, maxRows: 4 }} />
          <Button
            type="primary"
            data-testid="create-preference-candidate"
            disabled={!draftKey.trim() || !draftValue.trim() || !draftSummary.trim()}
            onClick={() => void execute(async () => {
              await createMemoryCandidate({
                summary: draftSummary.trim(),
                preferenceKey: draftKey.trim(),
                preferenceValue: draftValue.trim(),
                purpose: "personalization.candidate.create",
                idempotencyKey: `ui-preference-create-${crypto.randomUUID()}`
              });
              setDraftValue("");
              setDraftSummary("");
              props.onAction("偏好候选已记录，请确认后再启用。");
            })}
          >记录候选</Button>
        </Space>
      </section>

      {revokedPreferences.length > 0 ? (
        <section>
          <h3>已撤销</h3>
          <Space wrap>
            {revokedPreferences.map((preference) => (
              <Tag key={preference.preferenceRef}>{preferenceLabel(preference.preferenceKey)}：{preference.preferenceValue}</Tag>
            ))}
          </Space>
        </section>
      ) : null}
    </div>
  );
}

function CandidateRow(props: {
  candidate: MemoryCandidateView;
  onConfirm: () => void;
  onReject: () => void;
}) {
  return (
    <article className="settings-row" data-testid={`memory-candidate-${props.candidate.candidateRef}`}>
      <span>
        <strong>{preferenceLabel(props.candidate.preferenceKey ?? "preference")}</strong>
        <small>{props.candidate.preferenceValue} · {props.candidate.summary}</small>
      </span>
      <Space>
        <Button type="primary" onClick={props.onConfirm}>确认</Button>
        <Button onClick={props.onReject}>忽略</Button>
      </Space>
    </article>
  );
}

function preferenceLabel(key: string): string {
  return preferenceLabels[key] ?? key.replaceAll("_", " ");
}
