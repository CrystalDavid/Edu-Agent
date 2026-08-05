import { useEffect, useMemo, useState } from "react";

import type {
  LessonBriefCandidateItem,
  LessonBriefSnapshot
} from "@edu-agent/contracts";
import { Button, Input, Tag, Typography } from "antd";

import { WorkspaceIcon } from "../WorkspaceIcon";

const { Paragraph, Text, Title } = Typography;

export function LessonBriefPanel(props: {
  brief: LessonBriefSnapshot | null;
  loading: boolean;
  onGenerate: () => void;
  onAdjust: (adjustment: string) => void;
  onAdopt: (candidateIds: string[]) => void;
  onDefer: () => void;
}) {
  const [adjusting, setAdjusting] = useState(false);
  const [adjustment, setAdjustment] = useState("");
  const candidates = useMemo(
    () => props.brief
      ? [
          ...props.brief.teachingFocusCandidates,
          ...props.brief.difficultyCandidates,
          ...props.brief.suggestedAttentionPoints
        ]
      : [],
    [props.brief]
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    setSelected(new Set(candidates.map((item) => item.candidateId)));
  }, [props.brief?.contentHash]);

  if (!props.brief || props.brief.status === "deferred") {
    return (
      <section className="lesson-brief-panel is-empty" id="lesson-brief" data-testid="lesson-brief-panel">
        <div className="lesson-brief-panel__intro">
          <span className="lesson-brief-panel__icon"><WorkspaceIcon name="insight" /></span>
          <div>
            <Text className="section-kicker">教学洞察</Text>
            <Title level={3}>让系统先帮你看懂这节课</Title>
            <Paragraph>
              基于当前课时目标、已授权 Evidence、已批准方案和已确认偏好，整理重点、难点与关注候选。
            </Paragraph>
          </div>
        </div>
        <div className="lesson-brief-panel__gaps">
          <Tag>尚未接入教材知识源</Tag>
          <Tag>尚未接入课程标准知识源</Tag>
          <Tag>尚未接入考点知识源</Tag>
        </div>
        <Button type="primary" loading={props.loading} onClick={props.onGenerate}>
          生成教学洞察
        </Button>
      </section>
    );
  }

  const readOnly = props.brief.status === "adopted";
  return (
    <section className="lesson-brief-panel" id="lesson-brief" data-testid="lesson-brief-panel">
      <header className="lesson-brief-panel__header">
        <div>
          <Text className="section-kicker">教学洞察候选</Text>
          <Title level={3}>先判断，再进入备课方案</Title>
          <Paragraph>
            当前建议基于 Lesson 目标、已授权 Evidence、current approved TeachingPlan 和已确认偏好。
          </Paragraph>
        </div>
        <Tag color={readOnly ? "success" : "processing"}>
          {readOnly ? "已采用" : "待教师判断"}
        </Tag>
      </header>

      <BriefGroup
        title="教学重点候选"
        items={props.brief.teachingFocusCandidates}
        selected={selected}
        disabled={readOnly}
        onToggle={(id) => toggle(setSelected, selected, id)}
      />
      <BriefGroup
        title="教学难点候选"
        items={props.brief.difficultyCandidates}
        selected={selected}
        disabled={readOnly}
        onToggle={(id) => toggle(setSelected, selected, id)}
      />

      {props.brief.classEvidenceSummary.length > 0 ? (
        <div className="lesson-brief-evidence">
          <strong>班级 Evidence 摘要</strong>
          {props.brief.classEvidenceSummary.map((item) => (
            <p key={item.evidenceRef}>{item.summary}</p>
          ))}
        </div>
      ) : (
        <div className="lesson-brief-evidence is-missing">
          当前没有已授权且可追溯的班级 Evidence，难点候选仅供教师确认。
        </div>
      )}

      <details className="lesson-brief-sources">
        <summary>查看来源与信息缺口</summary>
        <div>
          <strong>实际使用来源</strong>
          <p>{props.brief.sourceRefs.filter((source) => source.included).map((source) => source.ref).join("、")}</p>
          <strong>当前缺口</strong>
          <ul>{props.brief.knownGaps.map((gap) => <li key={gap}>{gap}</li>)}</ul>
        </div>
      </details>

      {!readOnly ? (
        <div className="lesson-brief-actions">
          {adjusting ? (
            <div className="lesson-brief-adjustment">
              <Input.TextArea
                value={adjustment}
                maxLength={500}
                autoSize={{ minRows: 2, maxRows: 4 }}
                placeholder="例如：我们班基础比较弱，降低难度，多用具体例子"
                onChange={(event) => setAdjustment(event.target.value)}
              />
              <Button
                type="primary"
                disabled={!adjustment.trim()}
                loading={props.loading}
                onClick={() => props.onAdjust(adjustment.trim())}
              >
                按这句话重新生成
              </Button>
              <Button onClick={() => setAdjusting(false)}>取消</Button>
            </div>
          ) : (
            <>
              <Button
                type="primary"
                loading={props.loading}
                disabled={selected.size === 0}
                onClick={() => props.onAdopt([...selected])}
              >
                采用所选洞察
              </Button>
              <Button onClick={() => setAdjusting(true)}>说一句话调整</Button>
              <Button type="text" onClick={props.onDefer}>暂不采用</Button>
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}

function BriefGroup(props: {
  title: string;
  items: LessonBriefCandidateItem[];
  selected: Set<string>;
  disabled: boolean;
  onToggle: (id: string) => void;
}) {
  return (
    <div className="lesson-brief-group">
      <strong>{props.title}</strong>
      <div className="lesson-brief-candidates">
        {props.items.map((item) => (
          <button
            type="button"
            key={item.candidateId}
            className={props.selected.has(item.candidateId) ? "is-selected" : ""}
            aria-pressed={props.selected.has(item.candidateId)}
            disabled={props.disabled}
            onClick={() => props.onToggle(item.candidateId)}
          >
            <span className="lesson-brief-candidate__check">
              {props.selected.has(item.candidateId) ? <WorkspaceIcon name="check" /> : null}
            </span>
            <span>
              <b>{item.title}</b>
              <small>{item.explanation}</small>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function toggle(
  setSelected: (next: Set<string>) => void,
  current: Set<string>,
  id: string
) {
  const next = new Set(current);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  setSelected(next);
}
