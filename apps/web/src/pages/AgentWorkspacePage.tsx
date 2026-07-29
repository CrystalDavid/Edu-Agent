import { useEffect, useMemo, useState } from "react";

import { Button, Drawer } from "antd";

import type { AppRoute } from "../route";
import {
  agentConversations,
  initialAgentContext,
  type AgentContextItem,
  type AgentConversation,
  teacherTodos,
  type TeacherTodo
} from "../teacher-portal-data";
import {
  AgentChat,
  AgentContextPanel,
  AgentConversationList
} from "../components/portal/AgentComponents";
import { WorkspaceIcon } from "../components/WorkspaceIcon";

function responseFor(message: string): string {
  if (message.includes("PPT") || message.includes("课件")) {
    return "我可以基于当前教案，先生成一份 12 页的课件结构草稿：情境导入、斜率比较、课堂追问、即时练习和退出卡。开始前请确认是否继续使用八年级 3 班的当前教学目标。";
  }
  if (message.includes("作业")) {
    return "最近作业最值得复核的是：部分学生能判断图像趋势，但解释时仍引用截距位置。这个结论只基于现有观察，建议加入一个新情境追问后再调整教学。";
  }
  if (message.includes("日程")) {
    return "我找到了今天 15:00–16:00 的空闲时段，可以将“完善一次函数课件”安排进去。当前只是日程草稿，需要你确认后才会保存。";
  }
  return "我已经读取你明确选择的课程、班级和文件。可以先整理目标、现有材料与缺口，再给出一份可修改的任务草稿。";
}

export function AgentWorkspacePage(props: {
  navigate: (route: AppRoute) => void;
  onAction: (message: string) => void;
}) {
  const [conversations, setConversations] = useState(agentConversations);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [context, setContext] = useState<AgentContextItem[]>(initialAgentContext);
  const [contextDrawerOpen, setContextDrawerOpen] = useState(false);
  const selected = useMemo(
    () => conversations.find((conversation) => conversation.id === selectedId) ?? null,
    [conversations, selectedId]
  );

  useEffect(() => {
    const todoId = window.sessionStorage.getItem("agent-todo-context");
    if (todoId) {
      const todo = teacherTodos.find((item) => item.id === todoId);
      if (todo) addTodoContext(todo);
      window.sessionStorage.removeItem("agent-todo-context");
    }
    const prefill = window.sessionStorage.getItem("agent-prefill");
    if (prefill) {
      startQuickTask(prefill);
      window.sessionStorage.removeItem("agent-prefill");
    }
    // Intentional one-time import from navigation context.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateConversation = (next: AgentConversation) => {
    setConversations((items) => items.map((item) => item.id === next.id ? next : item));
  };
  const createConversation = (title = "新对话") => {
    const next: AgentConversation = {
      id: `conversation-local-${Date.now()}`,
      title,
      group: "今天",
      updatedAt: "刚刚",
      scope: "八年级 3 班",
      messages: []
    };
    setConversations((items) => [next, ...items]);
    setSelectedId(next.id);
    return next;
  };
  const send = (message: string) => {
    const current = selected ?? createConversation(message.slice(0, 18));
    const next: AgentConversation = {
      ...current,
      title: current.title === "新对话" ? message.slice(0, 18) : current.title,
      updatedAt: "刚刚",
      messages: [
        ...current.messages,
        { id: `teacher-${Date.now()}`, role: "teacher", content: message },
        {
          id: `assistant-${Date.now() + 1}`,
          role: "assistant",
          content: responseFor(message),
          sources: context.slice(0, 3).map((item) => item.title),
          steps: ["确认用户目标与当前工作空间", "读取教师明确选择的上下文", "生成可编辑的演示草稿"]
        }
      ]
    };
    setConversations((items) => items.some((item) => item.id === next.id)
      ? items.map((item) => item.id === next.id ? next : item)
      : [next, ...items]);
    setSelectedId(next.id);
  };
  const startQuickTask = (task: string) => {
    const conversation = createConversation(task);
    const next = {
      ...conversation,
      messages: [
        { id: `teacher-${Date.now()}`, role: "teacher" as const, content: task },
        {
          id: `assistant-${Date.now() + 1}`,
          role: "assistant" as const,
          content: responseFor(task),
          sources: context.slice(0, 3).map((item) => item.title),
          steps: ["识别任务类型", "确认课程与文件范围", "准备可编辑的演示草稿"]
        }
      ]
    };
    setConversations((items) => items.map((item) => item.id === next.id ? next : item));
  };
  const addTodoContext = (todo: TeacherTodo) => {
    const additions: AgentContextItem[] = [
      { id: `context-${todo.id}`, kind: "待办", title: todo.title, reason: "你选择了这条待办" },
      ...initialAgentContext
    ];
    setContext((items) => {
      const byId = new Map([...items, ...additions].map((item) => [item.id, item]));
      return [...byId.values()];
    });
  };
  const handleAction = (action: string) => {
    if (action === "创建教学任务") {
      props.navigate("/copilot");
      return;
    }
    props.onAction(`${action}：当前为演示交互，正式写入需要后续业务能力。`);
  };

  return (
    <div className="agent-workspace" data-testid="agent-page">
      <AgentConversationList
        conversations={conversations}
        selectedId={selectedId}
        onSelect={(conversation) => setSelectedId(conversation.id)}
        onNew={() => createConversation()}
        onUpdate={updateConversation}
        onDelete={(id) => {
          setConversations((items) => items.filter((item) => item.id !== id));
          if (selectedId === id) setSelectedId(null);
        }}
      />
      <AgentChat
        conversation={selected}
        onSend={send}
        onQuickTask={startQuickTask}
        onAction={handleAction}
      />
      <Button
        className="agent-context-drawer-trigger"
        icon={<WorkspaceIcon name="memory" />}
        onClick={() => setContextDrawerOpen(true)}
      >
        待办与上下文
      </Button>
      <AgentContextPanel
        context={context}
        onAddTodo={addTodoContext}
        onRemove={(id) => setContext((items) => items.filter((item) => item.id !== id))}
        onClear={() => setContext([])}
        onAction={handleAction}
      />
      <Drawer
        title="待办与上下文"
        size="default"
        open={contextDrawerOpen}
        onClose={() => setContextDrawerOpen(false)}
        className="agent-context-drawer"
      >
        <AgentContextPanel
          context={context}
          onAddTodo={addTodoContext}
          onRemove={(id) => setContext((items) => items.filter((item) => item.id !== id))}
          onClear={() => setContext([])}
          onAction={handleAction}
        />
      </Drawer>
    </div>
  );
}
