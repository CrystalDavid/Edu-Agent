import { useMemo, useState } from "react";

import { Button, Input, Select } from "antd";

import {
  agentQuickTasks,
  type AgentContextItem,
  type AgentConversation,
  teacherTodos,
  type TeacherTodo
} from "../../teacher-portal-data";
import { WorkspaceIcon } from "../WorkspaceIcon";
import { StatusPill } from "./PortalPrimitives";

const conversationGroups = ["今天", "昨天", "最近 7 天", "更早"] as const;

export function AgentConversationList(props: {
  conversations: AgentConversation[];
  selectedId: string | null;
  onSelect: (conversation: AgentConversation) => void;
  onNew: () => void;
  onUpdate: (conversation: AgentConversation) => void;
  onDelete: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [menuId, setMenuId] = useState<string | null>(null);
  const filtered = props.conversations.filter((conversation) => conversation.title.includes(query.trim()));
  return (
    <aside className="agent-history" data-testid="agent-conversation-list">
      <Button type="primary" block icon={<WorkspaceIcon name="plus" />} onClick={props.onNew}>
        新建对话
      </Button>
      <Input
        prefix={<WorkspaceIcon name="search" />}
        placeholder="搜索对话"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        allowClear
      />
      <div className="agent-history__scroll">
        {conversationGroups.map((group) => {
          const items = filtered.filter((conversation) => conversation.group === group);
          if (items.length === 0) return null;
          return (
            <section key={group}>
              <h2>{group}</h2>
              {items.map((conversation) => (
                <div className="conversation-row" key={conversation.id}>
                  <button
                    type="button"
                    className={props.selectedId === conversation.id ? "is-active" : ""}
                    onClick={() => props.onSelect(conversation)}
                  >
                    <WorkspaceIcon name="message" />
                    <span>
                      <strong>{conversation.title}</strong>
                      <small>{conversation.scope} · {conversation.updatedAt}</small>
                    </span>
                    {conversation.favorite ? <WorkspaceIcon name="star" /> : null}
                  </button>
                  <button type="button" className="conversation-more" aria-label={`管理 ${conversation.title}`} onClick={() => setMenuId(menuId === conversation.id ? null : conversation.id)}>
                    <WorkspaceIcon name="more" />
                  </button>
                  {menuId === conversation.id ? (
                    <div className="conversation-menu" role="menu">
                      <button type="button" onClick={() => {
                        const title = window.prompt("重命名对话", conversation.title);
                        if (title?.trim()) props.onUpdate({ ...conversation, title: title.trim() });
                        setMenuId(null);
                      }}>重命名</button>
                      <button type="button" onClick={() => {
                        props.onUpdate({ ...conversation, favorite: !conversation.favorite });
                        setMenuId(null);
                      }}>{conversation.favorite ? "取消收藏" : "收藏"}</button>
                      <button type="button" onClick={() => {
                        props.onUpdate({ ...conversation, scope: "一次函数项目" });
                        setMenuId(null);
                      }}>移动到项目</button>
                      <button type="button" onClick={() => {
                        props.onSelect(conversation);
                        setMenuId(null);
                      }}>查看使用的上下文</button>
                      <button type="button" className="danger-text" onClick={() => {
                        props.onDelete(conversation.id);
                        setMenuId(null);
                      }}>删除</button>
                    </div>
                  ) : null}
                </div>
              ))}
            </section>
          );
        })}
      </div>
    </aside>
  );
}
export function AgentChat(props: {
  conversation: AgentConversation | null;
  onSend: (message: string) => void;
  onQuickTask: (task: string) => void;
  onAction: (action: string) => void;
}) {
  const [message, setMessage] = useState("");
  const [attachmentOpen, setAttachmentOpen] = useState(false);
  const send = () => {
    if (!message.trim()) return;
    props.onSend(message.trim());
    setMessage("");
  };
  return (
    <main className="agent-chat" data-testid="agent-chat">
      <header>
        <div>
          <span>{props.conversation?.scope ?? "个人工作空间"}</span>
          <h1>{props.conversation?.title ?? "新对话"}</h1>
        </div>
        <StatusPill tone="blue">演示助手</StatusPill>
      </header>
      <div className="agent-chat__messages">
        {!props.conversation || props.conversation.messages.length === 0 ? (
          <div className="agent-empty-state">
            <span className="agent-orb"><WorkspaceIcon name="agent" /></span>
            <h2>有什么可以帮你？</h2>
            <p>选择一个常用任务，或直接描述你今天想完成的教学工作。</p>
            <div className="agent-quick-tasks">
              {agentQuickTasks.map((task) => (
                <button type="button" key={task} onClick={() => props.onQuickTask(task)}>
                  <WorkspaceIcon name={task.includes("PPT") ? "slides" : task.includes("日程") ? "calendar" : "lesson"} />
                  <span>{task}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="message-thread">
            {props.conversation.messages.map((item) => (
              <article className={`chat-message chat-message--${item.role}`} key={item.id}>
                <span className="chat-message__avatar">
                  {item.role === "teacher" ? "林" : <WorkspaceIcon name="agent" />}
                </span>
                <div>
                  <strong>{item.role === "teacher" ? "林老师" : "Edu Agent"}</strong>
                  <p>{item.content}</p>
                  {item.sources?.length ? (
                    <div className="message-sources">
                      <span>引用来源</span>
                      {item.sources.map((source) => <button type="button" key={source} onClick={() => props.onAction(`查看来源：${source}`)}>{source}</button>)}
                    </div>
                  ) : null}
                  {item.steps?.length ? (
                    <details>
                      <summary>查看执行步骤</summary>
                      <ol>{item.steps.map((step) => <li key={step}>{step}</li>)}</ol>
                      <p>这里只显示可审计步骤，不显示隐藏思维链。</p>
                    </details>
                  ) : null}
                  {item.role === "assistant" ? (
                    <div className="message-actions">
                      {["继续修改", "保存到文件", "创建待办", "创建教学任务"].map((action) => (
                        <button type="button" key={action} onClick={() => props.onAction(action)}>{action}</button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
      <div className="agent-composer">
        {attachmentOpen ? (
          <div className="composer-picker" role="dialog" aria-label="添加上下文">
            {["上传文件", "选择图片", "选择课程", "选择班级", "选择学生", "选择现有文件", "选择待办"].map((item) => (
              <button type="button" key={item} onClick={() => {
                props.onAction(item);
                setAttachmentOpen(false);
              }}>{item}</button>
            ))}
          </div>
        ) : null}
        <div className="agent-composer__context">
          <button type="button" onClick={() => props.onAction("更换课程")}><WorkspaceIcon name="course" />一次函数</button>
          <button type="button" onClick={() => props.onAction("更换班级")}><WorkspaceIcon name="students" />八年级 3 班</button>
        </div>
        <div className="agent-composer__input">
          <button type="button" aria-label="添加文件或上下文" onClick={() => setAttachmentOpen((value) => !value)}><WorkspaceIcon name="plus" /></button>
          <Input.TextArea
            autoSize={{ minRows: 1, maxRows: 5 }}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="描述你想完成的教学任务"
            onPressEnter={(event) => {
              if (!event.shiftKey) {
                event.preventDefault();
                send();
              }
            }}
          />
          <button type="button" className="composer-send" aria-label="发送" disabled={!message.trim()} onClick={send}><WorkspaceIcon name="send" /></button>
        </div>
        <small>当前使用本地演示助手，不调用外部模型。生成内容需要教师判断。</small>
      </div>
    </main>
  );
}

export function AgentContextPanel(props: {
  context: AgentContextItem[];
  onAddTodo: (todo: TeacherTodo) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  onAction: (action: string) => void;
}) {
  const [section, setSection] = useState<"context" | "todos">("context");
  const selectedIds = useMemo(() => new Set(props.context.map((item) => item.id)), [props.context]);
  return (
    <aside className="agent-context-panel" data-testid="agent-context-panel">
      <header>
        <div className="segmented-control">
          <button type="button" className={section === "context" ? "is-active" : ""} onClick={() => setSection("context")}>上下文</button>
          <button type="button" className={section === "todos" ? "is-active" : ""} onClick={() => setSection("todos")}>待办</button>
        </div>
      </header>
      {section === "context" ? (
        <>
          <div className="context-summary">
            <div><span>当前课程</span><strong>一次函数：斜率与图像</strong></div>
            <div><span>当前班级</span><strong>八年级 3 班</strong></div>
          </div>
          <div className="selected-context">
            <header><h2>已添加的上下文</h2><button type="button" onClick={props.onClear}>清空</button></header>
            {props.context.map((item) => (
              <article key={item.id}>
                <span><WorkspaceIcon name={item.kind === "文件" ? "document" : item.kind === "学生" ? "students" : item.kind === "待办" ? "check" : "course"} /></span>
                <div><strong>{item.title}</strong><small>{item.kind} · {item.reason}</small></div>
                <button type="button" aria-label={`移除 ${item.title}`} onClick={() => props.onRemove(item.id)}><WorkspaceIcon name="close" /></button>
              </article>
            ))}
            {props.context.length === 0 ? <p className="empty-copy">尚未选择上下文。Agent 不会自动读取其他数据。</p> : null}
          </div>
          <div className="context-controls">
            <Button onClick={() => props.onAction("更换课程")}>更换课程</Button>
            <Button onClick={() => props.onAction("选择文件")}>添加文件</Button>
            <Button onClick={() => props.onAction("选择学生")}>添加学生</Button>
          </div>
          <details className="context-explanation">
            <summary>为什么使用这些数据？</summary>
            <p>课程和班级来自当前任务；教案是最近编辑且与课程匹配的文件；教学目标来自当前章节。你可以逐项移除。</p>
          </details>
        </>
      ) : (
        <div className="context-todos">
          <h2>今日待办</h2>
          {teacherTodos.filter((todo) => todo.status !== "已完成").slice(0, 5).map((todo) => (
            <button
              type="button"
              key={todo.id}
              disabled={selectedIds.has(`context-${todo.id}`)}
              onClick={() => props.onAddTodo(todo)}
            >
              <span><strong>{todo.title}</strong><small>{todo.due} · {todo.context}</small></span>
              <WorkspaceIcon name="plus" />
            </button>
          ))}
          <p>加入待办时会同时建议相关课程、最近教案和教学目标；每一项都可移除。</p>
        </div>
      )}
    </aside>
  );
}
