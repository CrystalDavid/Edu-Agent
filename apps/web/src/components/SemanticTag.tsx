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
  observation: "证据观察",
  claim: "候选主张",
  estimate: "状态估计",
  suggestion: "建议草稿",
  artifact: "Artifact",
  mock: "Mock"
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
