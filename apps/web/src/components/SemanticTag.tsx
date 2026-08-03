import { Tag } from "antd";

export type SemanticKind =
  | "fact"
  | "observation"
  | "claim"
  | "estimate"
  | "suggestion"
  | "artifact"
  | "mock";

const labels: Record<SemanticKind, string> = {
  fact: "正式事实",
  observation: "直接观察",
  claim: "待复核解释",
  estimate: "状态估计",
  suggestion: "建议草稿",
  artifact: "内容版本",
  mock: "教学助手"
};

export function SemanticTag(props: {
  kind: SemanticKind;
  children?: string;
}) {
  return (
    <Tag className={`semantic-tag semantic-tag--${props.kind}`}>
      {props.children ?? labels[props.kind]}
    </Tag>
  );
}
