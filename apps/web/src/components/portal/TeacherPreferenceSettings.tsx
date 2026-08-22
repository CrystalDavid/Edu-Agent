import { useEffect, useState } from "react";

import type {
  MemoryCandidateView,
  TeacherPersonalizationState
} from "@edu-agent/contracts";
import { Alert, Button, Empty, Input, Select, Space, Tag } from "antd";

import {
  createMemoryCandidate,
  loadTeacherPersonalization,
  reviewMemoryCandidate,
  revokeTeacherPreference,
  updateTeacherPreference
} from "../../api";
import { teacherPreferenceLabel } from "../../presentation";

const preferenceKeys = [
  "lesson_plan_detail",
  "lesson_plan_style",
  "example_preference",
  "response_length"
] as const;

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
      <section>
        <h3>需要确认</h3>
        {draftCandidates.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={loading ? "加载中" : "暂无记录"} />
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
                  props.onAction("偏好候选已忽略，不会影响后续建议。");
                })}
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <h3>已保存</h3>
        {activePreferences.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无记录" />
        ) : (
          <div className="settings-list">
            {activePreferences.map((preference) => {
              const value = editing[preference.preferenceRef] ?? preference.preferenceValue;
              return (
                <article className="settings-row" key={preference.preferenceRef} data-testid={`preference-${preference.preferenceRef}`}>
                  <span>
                    <strong>{teacherPreferenceLabel(preference.preferenceKey)}</strong>
                  </span>
                  <Space wrap>
                    <Input
                      aria-label={`${teacherPreferenceLabel(preference.preferenceKey)}的值`}
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
                        props.onAction("偏好已撤销，助手将不再使用它。");
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
        <h3>添加偏好</h3>
        <Space direction="vertical" style={{ width: "100%" }}>
          <Select
            aria-label="偏好类型"
            value={draftKey}
            onChange={setDraftKey}
            options={preferenceKeys.map((value) => ({
              value,
              label: teacherPreferenceLabel(value)
            }))}
          />
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
          >添加</Button>
        </Space>
      </section>

      {revokedPreferences.length > 0 ? (
        <section>
          <h3>已删除</h3>
          <Space wrap>
            {revokedPreferences.map((preference) => (
              <Tag key={preference.preferenceRef}>{teacherPreferenceLabel(preference.preferenceKey)}：{preference.preferenceValue}</Tag>
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
        <strong>{teacherPreferenceLabel(props.candidate.preferenceKey ?? "preference")}</strong>
        <small>{props.candidate.preferenceValue} · {props.candidate.summary}</small>
      </span>
      <Space>
        <Button type="primary" onClick={props.onConfirm}>确认</Button>
        <Button onClick={props.onReject}>忽略</Button>
      </Space>
    </article>
  );
}
