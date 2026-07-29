import { useMemo, useState } from "react";

import { Button, Input, Select, Table } from "antd";

import { students, type StudentRecord } from "../../teacher-portal-data";
import { WorkspaceIcon } from "../WorkspaceIcon";
import {
  BarChart,
  ChartCard,
  DonutChart,
  MetricCard,
  MiniLineChart,
  ModuleCard,
  StatusPill
} from "./PortalPrimitives";

export function StudentPriorityList(props: {
  selectedId: string | null;
  onSelect: (student: StudentRecord | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("全部");
  const filtered = useMemo(() => {
    return students
      .filter((student) => student.name.includes(query.trim()))
      .filter((student) => filter === "全部" || (filter === "需要跟进" ? student.followUp : student.status === filter))
      .sort((a, b) => Number(b.followUp) - Number(a.followUp));
  }, [filter, query]);
  return (
    <aside className="student-priority-list" data-testid="student-priority-list">
      <header>
        <h2>八年级 3 班</h2>
        <span>{students.length} 名演示学生</span>
      </header>
      <Input
        prefix={<WorkspaceIcon name="search" />}
        placeholder="搜索学生编号"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        allowClear
      />
      <div className="student-filter-row">
        <Select
          aria-label="班级筛选"
          defaultValue="八年级 3 班"
          options={[{ value: "八年级 3 班", label: "八年级 3 班" }]}
        />
        <Select
          aria-label="状态筛选"
          value={filter}
          onChange={setFilter}
          options={["全部", "需要跟进", "近期有变化", "暂无紧急事项"].map((value) => ({ value, label: value }))}
        />
      </div>
      <button
        type="button"
        className={`class-overview-trigger${props.selectedId === null ? " is-active" : ""}`}
        onClick={() => props.onSelect(null)}
      >
        <span className="student-avatar student-avatar--class"><WorkspaceIcon name="students" /></span>
        <span><strong>班级概览</strong><small>整体趋势与需要关注的范围</small></span>
      </button>
      <div className="student-list-scroll">
        {filtered.map((student) => (
          <button
            type="button"
            key={student.id}
            className={props.selectedId === student.id ? "is-active" : ""}
            onClick={() => props.onSelect(student)}
          >
            <span className="student-avatar">{student.id}</span>
            <span>
              <strong>{student.name}</strong>
              <small>{student.change}</small>
            </span>
            {student.followUp ? <i aria-label="待跟进" title="待跟进" /> : null}
          </button>
        ))}
      </div>
    </aside>
  );
}
export function ClassOverview(props: {
  onSelectStudent: (student: StudentRecord) => void;
}) {
  const followUps = students.filter((student) => student.followUp);
  return (
    <div className="class-overview" data-testid="class-overview">
      <header className="student-content-header">
        <div>
          <span>八年级 3 班 · 数学</span>
          <h2>班级学习情况</h2>
          <p>只呈现当前证据支持的变化，不生成固定能力标签。</p>
        </div>
        <StatusPill tone="blue">更新于今天 10:40</StatusPill>
      </header>
      <div className="metric-grid metric-grid--four">
        <MetricCard label="最近作业提交" value="38 / 42" note="4 人未交" />
        <MetricCard label="平均正确率" value="82%" note="较上次 +3%" />
        <MetricCard label="需要跟进" value={followUps.length} note="需教师核实" tone="attention" />
        <MetricCard label="证据不足" value="2 个范围" note="新情境迁移、独立解释" />
      </div>
      <div className="chart-grid">
        <ChartCard title="知识点整体情况" caption="最近作业与课堂观察">
          <BarChart items={[
            { label: "判断图像趋势", value: 88 },
            { label: "计算斜率", value: 82 },
            { label: "解释变化率", value: 67 },
            { label: "区分截距", value: 61 }
          ]} />
        </ChartCard>
        <ChartCard title="作业上交情况" caption="本次课后练习">
          <div className="dual-donut">
            <DonutChart value={90} label="已提交" />
            <DonutChart value={86} label="已完成" />
          </div>
        </ChartCard>
        <ChartCard title="近期作业表现" caption="班级平均正确率">
          <MiniLineChart values={[72, 75, 79, 82]} label="班级最近四次作业表现趋势" />
        </ChartCard>
        <ChartCard title="独立与受助完成" caption="仅统计已记录辅助情况的任务">
          <BarChart items={[
            { label: "独立完成", value: 68 },
            { label: "一级提示", value: 21 },
            { label: "教师示范后", value: 11 }
          ]} />
        </ChartCard>
      </div>
      <ModuleCard title="证据覆盖" description="深色表示当前观察较充分，浅色表示仍需补充">
        <div className="evidence-heatmap" role="img" aria-label="班级知识点证据覆盖热力图">
          <div />
          {["判断趋势", "计算斜率", "解释变化率", "新情境迁移"].map((label) => <strong key={label}>{label}</strong>)}
          {["直接观察", "独立作答", "受助表现"].map((row, rowIndex) => (
            <div className="evidence-heatmap__row" key={row}>
              <span>{row}</span>
              {[82, 76, 58, 32].map((value, index) => (
                <i key={`${row}:${index}`} style={{ opacity: Math.max(0.14, (value - rowIndex * 12) / 100) }} title={`${value - rowIndex * 12}% 覆盖`} />
              ))}
            </div>
          ))}
        </div>
      </ModuleCard>
      <ModuleCard title="需要跟进" description="这些是待核实事项，不是学生标签">
        <div className="priority-student-cards">
          {followUps.map((student) => (
            <button type="button" key={student.id} onClick={() => props.onSelectStudent(student)}>
              <span className="student-avatar">{student.id}</span>
              <span>
                <strong>{student.name}</strong>
                <small>{student.attention[0]}</small>
              </span>
              <WorkspaceIcon name="arrowRight" />
            </button>
          ))}
        </div>
      </ModuleCard>
    </div>
  );
}

export function StudentDetail(props: {
  student: StudentRecord;
  onAction: (action: string) => void;
}) {
  const [adviceExpanded, setAdviceExpanded] = useState(false);
  return (
    <div className="student-detail" data-testid="student-detail">
      <header className="student-content-header">
        <div className="student-detail__identity">
          <span className="student-avatar student-avatar--large">{props.student.id}</span>
          <div>
            <span>{props.student.className} · 一次函数</span>
            <h2>{props.student.name}</h2>
            <p>{props.student.change}</p>
          </div>
        </div>
        <StatusPill tone={props.student.followUp ? "warning" : "neutral"}>{props.student.status}</StatusPill>
      </header>
      <div className="student-goal-strip">
        <span>当前目标</span>
        <strong>在新情境中独立解释斜率变化如何影响图像</strong>
        <small>待复评 · 建议 8 月 3 日前补充一次直接观察</small>
      </div>
      <div className="student-detail-grid">
        <ModuleCard title="最近作业">
          <Table
            size="small"
            pagination={false}
            rowKey="title"
            dataSource={props.student.homework}
            columns={[
              { title: "作业", dataIndex: "title" },
              { title: "提交", render: (_, row) => row.submitted ? "已交" : <strong className="missing-value">未交</strong> },
              { title: "得分", render: (_, row) => row.score === null ? "—" : row.score },
              { title: "正确率", render: (_, row) => row.accuracy === null ? "—" : `${row.accuracy}%` },
              { title: "用时", dataIndex: "duration" },
              { title: "辅助情况", dataIndex: "assistance" },
              { title: "主要情况", dataIndex: "issue" }
            ]}
          />
        </ModuleCard>
        <ModuleCard title="最近测试">
          <div className="student-exam-list">
            {props.student.exams.map((exam) => (
              <article key={exam.title}>
                <div><strong>{exam.score}</strong><span>分</span></div>
                <span><strong>{exam.title}</strong><small>{exam.change} · {exam.knowledge}</small></span>
                <p>{exam.error}</p>
              </article>
            ))}
          </div>
        </ModuleCard>
      </div>
      <ModuleCard title="当前需要留意" description="使用中性、可修正的描述">
        <div className="attention-notes">
          {props.student.attention.map((item, index) => (
            <article key={item}>
              <span>{index + 1}</span>
              <p>{item}</p>
            </article>
          ))}
        </div>
      </ModuleCard>
      <ModuleCard
        title="Agent 指导建议"
        description="教学建议草稿，需要教师判断和修改"
        action={<StatusPill tone="blue">建议草稿</StatusPill>}
        className="agent-advice-card"
      >
        <div className="agent-advice-summary">
          <div><span>建议目标</span><p>帮助学生区分“倾斜程度”和“与纵轴交点的位置”。</p></div>
          <div><span>可采用的方法</span><p>固定截距，只改变斜率；请学生先预测，再解释每向右 1 格的变化。</p></div>
          <div><span>适用依据</span><p>最近作业的判断题正确，但解释中两次引用截距位置。</p></div>
          <div><span>证据缺口</span><p>尚无新情境下的独立口头解释记录。</p></div>
          {adviceExpanded ? (
            <>
              <div><span>不适用条件</span><p>若学生不能稳定识别坐标轴与点的位置，应先回到图像基础。</p></div>
              <div><span>建议复评</span><p>8 月 3 日前，使用一条陌生直线进行 3 分钟口头解释。</p></div>
            </>
          ) : null}
        </div>
        <div className="agent-advice-actions">
          <Button type="primary" onClick={() => props.onAction("修改建议")}>修改建议</Button>
          <Button onClick={() => props.onAction("创建待办")}>创建待办</Button>
          <Button onClick={() => props.onAction("创建辅导计划草稿")}>创建辅导计划草稿</Button>
          <Button onClick={() => props.onAction("交给 Agent 深入分析")}>深入分析</Button>
          <button type="button" className="text-action" onClick={() => setAdviceExpanded((value) => !value)}>
            {adviceExpanded ? "收起分析依据" : "查看分析依据"}
          </button>
        </div>
      </ModuleCard>
    </div>
  );
}
