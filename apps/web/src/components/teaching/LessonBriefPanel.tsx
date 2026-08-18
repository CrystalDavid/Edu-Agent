import { useEffect, useMemo, useState } from "react";

import type {
  LessonBriefCandidateItem,
  LessonBriefSnapshot
} from "@edu-agent/contracts";
import { Button, Input, Tag, Typography } from "antd";

import { WorkspaceIcon } from "../WorkspaceIcon";

const { Title } = Typography;

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
        <Title level={3}>教学洞察</Title>
        <Button type="primary" loading={props.loading} onClick={props.onGenerate}>
          准备教学洞察
        </Button>
      </section>
    );
  }

  const readOnly = props.brief.status === "adopted";
  return (
    <section className="lesson-brief-panel" id="lesson-brief" data-testid="lesson-brief-panel">
      <header className="lesson-brief-panel__header">
        <Title level={3}>教学洞察</Title>
        <Tag color={readOnly ? "success" : "warning"}>
          {readOnly ? "已完成" : "进行中"}
        </Tag>
      </header>

      <BriefGroup
        title="本课重点"
        items={props.brief.teachingFocusCandidates}
        selected={selected}
        disabled={readOnly}
        onToggle={(id) => toggle(setSelected, selected, id)}
      />
      <BriefGroup
        title="提醒"
        items={props.brief.difficultyCandidates}
        selected={selected}
        disabled={readOnly}
        onToggle={(id) => toggle(setSelected, selected, id)}
      />

      {!readOnly ? (
        <div className="lesson-brief-actions">
          {adjusting ? (
            <div className="lesson-brief-adjustment ai-task-composer">
              <Input.TextArea
                className="ai-task-input"
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
                确认
              </Button>
              <Button onClick={() => setAdjusting(true)}>交给助手调整</Button>
              <Button type="text" onClick={props.onDefer}>暂不使用</Button>
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
