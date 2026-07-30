import { useEffect, useState } from "react";

import { Button, Table } from "antd";

import { designTokens } from "../design-tokens";
import { WorkspaceIcon } from "../components/WorkspaceIcon";
import {
  BarChart,
  ChartCard,
  MetricCard,
  ModuleCard,
  PageHeader,
  StatusPill
} from "../components/portal/PortalPrimitives";

export function TeacherStyleGuidePage() {
  const [fontAvailable, setFontAvailable] = useState<boolean | null>(null);
  const [lastAction, setLastAction] = useState("尚未触发组件");
  useEffect(() => {
    setFontAvailable(document.fonts.check('14px "HarmonyOS Sans SC"'));
  }, []);
  return (
    <div className="portal-page style-guide-v1" data-testid="style-guide-page">
      <PageHeader title="样式指南" subtitle="普通教师端 UI v1 的字体、颜色、组件和数据可视化基线" />
      <ModuleCard title="字体" description="使用随应用分发的官方原始 HarmonyOS Sans SC 2.040 可变字体；加载失败时回退到系统简体中文字体。">
        <div className="font-status">
          <StatusPill tone={fontAvailable ? "success" : "warning"}>
            {fontAvailable === null ? "检测中" : fontAvailable ? "HarmonyOS Sans 已加载" : "当前使用系统回退"}
          </StatusPill>
          <span>字体栈：HarmonyOS Sans SC → Microsoft YaHei UI → PingFang SC → Microsoft YaHei</span>
        </div>
        <div className="type-scale">
          <article className="type-page-title"><span>页面大标题 · 28 / 700</span><strong>一次函数教学工作台</strong></article>
          <article className="type-module-title"><span>主要模块标题 · 22 / 700</span><strong>今天需要做什么</strong></article>
          <article className="type-card-title"><span>卡片标题 · 17 / 600</span><strong>斜率与图像课后练习</strong></article>
          <article className="type-body"><span>正文 · 14 / 400</span><p>学生能判断图像趋势，但对斜率与截距的解释仍需复核。</p></article>
          <article className="type-caption"><span>辅助信息 · 12 / 400</span><p>今天 10:24 · 林老师 · 版本 3</p></article>
          <article className="type-number"><span>重要数字 · 32 / 700</span><strong>82%</strong></article>
        </div>
      </ModuleCard>
      <ModuleCard title="Design Token">
        <div className="token-grid-v1">
          {Object.entries(designTokens).filter(([key]) => key.startsWith("color")).map(([key, value]) => (
            <article key={key}>
              <i style={{ background: value }} />
              <strong>{key}</strong>
              <span>{value}</span>
            </article>
          ))}
        </div>
      </ModuleCard>
      <ModuleCard title="按钮、图标与状态">
        <div className="component-showcase">
          <Button type="primary" icon={<WorkspaceIcon name="plus" />} onClick={() => setLastAction("主要操作")}>主要操作</Button>
          <Button icon={<WorkspaceIcon name="edit" />} onClick={() => setLastAction("次要操作")}>次要操作</Button>
          <Button type="text" onClick={() => setLastAction("文字操作")}>文字操作</Button>
          <StatusPill tone="blue">进行中</StatusPill>
          <StatusPill tone="success">已验证</StatusPill>
          <StatusPill tone="warning">需要复核</StatusPill>
          <StatusPill>草稿</StatusPill>
          <span className="showcase-action-status" role="status">最近操作：{lastAction}</span>
        </div>
        <div className="icon-showcase">
          {(["workspace", "schedule", "course", "students", "files", "agent", "settings", "search", "edit", "download"] as const).map((icon) => (
            <span key={icon}><WorkspaceIcon name={icon} /><small>{icon}</small></span>
          ))}
        </div>
      </ModuleCard>
      <div className="style-guide-grid">
        <ModuleCard title="卡片与重要数字">
          <div className="metric-grid metric-grid--three">
            <MetricCard label="提交率" value="90%" />
            <MetricCard label="未交" value="4" tone="attention" />
            <MetricCard label="平均用时" value="29 分钟" />
          </div>
        </ModuleCard>
        <ChartCard title="图表" caption="统一蓝色数据图">
          <BarChart items={[{ label: "判断趋势", value: 88 }, { label: "解释变化率", value: 67 }, { label: "区分截距", value: 61 }]} />
        </ChartCard>
      </div>
      <ModuleCard title="表格">
        <Table
          size="small"
          pagination={false}
          rowKey="name"
          dataSource={[
            { name: "斜率与图像课后练习", status: "收集中", updated: "今天 10:24" },
            { name: "一次函数单元测试", status: "已分析", updated: "7 月 24 日" }
          ]}
          columns={[
            { title: "名称", dataIndex: "name" },
            { title: "状态", dataIndex: "status" },
            { title: "更新时间", dataIndex: "updated" }
          ]}
        />
      </ModuleCard>
    </div>
  );
}
