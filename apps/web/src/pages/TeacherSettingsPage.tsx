import { useEffect, useState } from "react";

import { Avatar, Button, Input, Select, Switch } from "antd";
import type { AuthenticationSessionStatus } from "@edu-agent/contracts";

import type { AppRoute } from "../route";
import { WorkspaceIcon } from "../components/WorkspaceIcon";
import {
  SettingsRow,
  SettingsSection
} from "../components/portal/SettingsSection";
import { PageHeader, StatusPill } from "../components/portal/PortalPrimitives";
import { IdentityOrganizationSettings } from "../components/portal/IdentityOrganizationSettings";

type AuthenticatedSession = Extract<
  AuthenticationSessionStatus,
  { authenticated: true }
>;

const sectionLinks = [
  ["profile", "个人信息"],
  ["identity", "账号和身份"],
  ["workspace", "角色与工作空间"],
  ["appearance", "外观和字体"],
  ["notifications", "通知设置"],
  ["memory", "上下文和记忆"],
  ["skills", "个人方法和 Skill"],
  ["automation", "自动化授权"],
  ["privacy", "隐私与数据"],
  ["system", "系统信息"]
] as const;

export function TeacherSettingsPage(props: {
  navigate: (route: AppRoute) => void;
  onAction: (message: string) => void;
  authSession: AuthenticatedSession;
}) {
  const [personalization, setPersonalization] = useState(true);
  const [memoryItems, setMemoryItems] = useState([
    { id: "memory-1", type: "用户保存", text: "备课时先看最近作业的共性问题，再调整课堂活动。", source: "林老师于 7 月 25 日保存", usage: "仅用于个人备课建议" },
    { id: "memory-2", type: "明确偏好", text: "课件正文尽量简洁，每页只讲一个核心问题。", source: "个人设置", usage: "内容格式与表达" },
    { id: "memory-3", type: "候选推断", text: "可能偏好在周四下午集中准备下周课程。", source: "最近 4 周日程模式", usage: "尚未生效，需要确认" }
  ]);
  const [activeSection, setActiveSection] = useState("profile");

  useEffect(() => {
    const requested = window.sessionStorage.getItem("teacher-settings-section");
    if (requested) {
      setActiveSection(requested);
      window.sessionStorage.removeItem("teacher-settings-section");
      window.setTimeout(() => document.getElementById(`settings-${requested}`)?.scrollIntoView({ block: "start" }), 50);
    }
  }, []);

  const chooseSection = (section: string) => {
    setActiveSection(section);
    document.getElementById(`settings-${section}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="portal-page settings-page-v1" data-testid="settings-page">
      <PageHeader title="设置" subtitle="管理身份、偏好、记忆、个人方法和自动化边界" />
      <div className="settings-layout">
        <nav className="settings-nav" aria-label="设置分区">
          {sectionLinks.map(([id, label]) => (
            <button type="button" key={id} className={activeSection === id ? "is-active" : ""} onClick={() => chooseSection(id)}>
              {label}
            </button>
          ))}
        </nav>
        <main className="settings-content">
          <SettingsSection id="profile" title="个人信息" description="这些信息只用于你的教师工作空间。">
            <div className="profile-form">
              <div className="profile-avatar-field">
                <Avatar size={72} className="teacher-avatar">{props.authSession.user.displayName.trim().slice(0, 1) || "师"}</Avatar>
                <Button onClick={() => props.onAction("更换头像：当前仅预览，不上传图片。")}>更换头像</Button>
              </div>
              <label>姓名<Input value={props.authSession.user.displayName} readOnly /></label>
              <label>学科<Input defaultValue="数学" /></label>
              <label>任教年级<Input defaultValue="八年级" /></label>
              <label className="profile-bio">个人简介<Input.TextArea defaultValue="关注学生如何解释数学概念，而不只看答案是否正确。" rows={3} /></label>
              <label>联系方式<Input value={props.authSession.user.email ?? "未提供"} readOnly /></label>
            </div>
          </SettingsSection>

          <SettingsSection id="identity" title="账号和身份" description="服务端会话、学校成员关系与数据治理请求。">
            <IdentityOrganizationSettings
              session={props.authSession}
              onAction={props.onAction}
            />
          </SettingsSection>

          <SettingsSection id="workspace" title="角色与工作空间" description="角色决定可见职责，不替代具体数据权限检查。">
            <SettingsRow label="当前角色" description={props.authSession.currentWorkspace?.roles.join(" / ") ?? "未选择"} control={<StatusPill tone="success">服务端会话</StatusPill>} />
            <SettingsRow label="当前学校" description={props.authSession.currentWorkspace?.organizationName ?? "未选择"} control={<StatusPill tone="blue">活动</StatusPill>} />
            <SettingsRow label="授权课程" description={(props.authSession.currentWorkspace?.courseRunRefs ?? []).join("、") || "尚未授权"} control={<span>{props.authSession.currentWorkspace?.courseRunRefs.length ?? 0} 个</span>} />
            <div className="future-role-note">班主任和科组长角色保留扩展位置，本轮没有启用专属功能。</div>
          </SettingsSection>

          <SettingsSection
            id="appearance"
            title="外观和字体"
            description="HarmonyOS Sans SC 由本地静态资源加载，失败时使用系统简体中文字体。"
            action={<Button onClick={() => props.navigate("/style-guide")}>打开样式指南</Button>}
          >
            <SettingsRow label="语言" control={<Select defaultValue="简体中文" options={[{ value: "简体中文", label: "简体中文" }]} />} />
            <SettingsRow label="字体大小" control={<Select defaultValue="标准" options={["紧凑", "标准", "较大"].map((value) => ({ value, label: value }))} />} />
            <SettingsRow label="显示密度" control={<Select defaultValue="舒适" options={["紧凑", "舒适"].map((value) => ({ value, label: value }))} />} />
            <SettingsRow label="默认首页" control={<Select defaultValue="概览" options={["概览", "日程", "教学", "Agent"].map((value) => ({ value, label: value }))} />} />
            <SettingsRow label="日期格式" control={<Select defaultValue="2026 年 7 月 30 日" options={[{ value: "2026 年 7 月 30 日", label: "2026 年 7 月 30 日" }]} />} />
          </SettingsSection>

          <SettingsSection id="notifications" title="通知设置" description="控制提醒方式，而不是改变任务本身。">
            <SettingsRow label="课程前提醒" description="开课前 20 分钟" control={<Switch defaultChecked />} />
            <SettingsRow label="待办到期提醒" description="重要待办到期前 1 小时" control={<Switch defaultChecked />} />
            <SettingsRow label="备课组动态" description="每天汇总一次" control={<Switch defaultChecked />} />
          </SettingsSection>

          <SettingsSection
            id="memory"
            title="上下文和记忆"
            description="你可以查看来源、用途并逐条修改或删除。候选推断不会自动生效。"
            action={<Switch checked={personalization} onChange={setPersonalization} checkedChildren="个性化开启" unCheckedChildren="已暂停" />}
          >
            <div className="memory-list">
              {memoryItems.map((memory) => (
                <article key={memory.id}>
                  <header><StatusPill tone={memory.type === "候选推断" ? "warning" : "blue"}>{memory.type}</StatusPill><span>{memory.source}</span></header>
                  <p>{memory.text}</p>
                  <small>允许用途：{memory.usage}</small>
                  <footer>
                    <button type="button" onClick={() => {
                      const next = window.prompt("修改记忆", memory.text);
                      if (next?.trim()) setMemoryItems((items) => items.map((item) => item.id === memory.id ? { ...item, text: next.trim() } : item));
                    }}>修改</button>
                    {memory.type === "候选推断" ? <button type="button" onClick={() => setMemoryItems((items) => items.map((item) => item.id === memory.id ? { ...item, type: "用户保存", source: "林老师刚刚确认" } : item))}>确认保存</button> : null}
                    <button type="button" className="danger-text" onClick={() => setMemoryItems((items) => items.filter((item) => item.id !== memory.id))}>删除</button>
                  </footer>
                </article>
              ))}
            </div>
          </SettingsSection>

          <SettingsSection id="skills" title="个人方法和 Skill" description="个人方法是可审查、可试用和可回滚的执行建议，不拥有权限。">
            <div className="skill-list">
              <article><div><StatusPill tone="success">已发布</StatusPill><strong>先看作业共性问题再备课</strong><p>版本 3 · 最近验证 7 月 28 日</p></div><Button onClick={() => props.onAction("查看个人方法版本 3")}>查看版本</Button></article>
              <article><div><StatusPill tone="blue">正在试用</StatusPill><strong>课件先搭问题链再补素材</strong><p>试用 2 / 5 次 · 可随时停用</p></div><Button onClick={() => props.onAction("已暂停本地演示中的方法试用")}>停用</Button></article>
              <article><div><StatusPill tone="warning">候选方法</StatusPill><strong>周四集中准备下周课程</strong><p>来自近期日程模式，尚未生效</p></div><Button onClick={() => props.onAction("候选依据：最近 4 周日程模式；尚未生效。")}>查看证据</Button></article>
            </div>
          </SettingsSection>

          <SettingsSection id="automation" title="自动化授权" description="授权绑定动作、范围和有效期，不设置全局自治等级。">
            <div className="automation-table">
              <div><strong>课前 20 分钟提醒</strong><span>个人日程 · 仅通知</span><span>长期有效</span><Button onClick={() => props.onAction("撤销预览：没有修改正式授权。")}>撤销</Button></div>
              <div><strong>每天汇总未交作业</strong><span>三个任教班级 · 只读</span><span>至本学期末</span><Button onClick={() => props.onAction("撤销预览：没有修改正式授权。")}>撤销</Button></div>
            </div>
          </SettingsSection>

          <SettingsSection id="privacy" title="隐私与数据" description="演示环境只允许合成数据；启用 Ark 时，仅发送每次重新授权并封存的最小上下文。">
            <SettingsRow label="导出个人数据" description="登记受控导出请求，不在浏览器拼装业务数据" control={<Button onClick={() => chooseSection("identity")}>前往身份与数据治理</Button>} />
            <SettingsRow label="删除或去标识" description="先登记人工审核请求，不直接破坏教学与审计历史" control={<Button danger onClick={() => chooseSection("identity")}>查看治理范围</Button>} />
            <SettingsRow label="模型数据外发" description="真实模型默认关闭" control={<StatusPill tone="success">未外发</StatusPill>} />
            <SettingsRow label="权限和日志" description="查看可理解的操作记录" control={<Button onClick={() => props.navigate("/runs")}>打开系统记录</Button>} />
          </SettingsSection>

          <SettingsSection id="system" title="系统信息" description="技术详情只在这里按需查看。">
            <SettingsRow label="当前模式" control={<StatusPill tone="blue">本地演示</StatusPill>} />
            <SettingsRow label="版本" control={<span>Teacher Portal UI v1</span>} />
            <SettingsRow label="API 服务" control={<StatusPill tone="success">运行正常</StatusPill>} />
            <SettingsRow label="真实模型" control={<span>关闭</span>} />
            <SettingsRow label="操作记录" control={<Button icon={<WorkspaceIcon name="clock" />} onClick={() => props.navigate("/runs")}>查看记录</Button>} />
          </SettingsSection>
        </main>
      </div>
    </div>
  );
}
