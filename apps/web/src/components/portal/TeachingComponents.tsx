import { useMemo, useState } from "react";

import { Button, Input, Select, Table } from "antd";

import {
  courseUnits,
  examRecords,
  homeworkRecords,
  students,
  teachingFiles,
  type CourseChapter,
  type CourseUnit,
  type ExamRecord,
  type HomeworkRecord,
  type TeachingFile
} from "../../teacher-portal-data";
import { WorkspaceIcon } from "../WorkspaceIcon";
import {
  BarChart,
  ChartCard,
  DonutChart,
  EmptyNotice,
  MetricCard,
  MiniLineChart,
  ModuleCard,
  StatusPill
} from "./PortalPrimitives";

export function CourseTree(props: {
  selectedUnitId: string;
  selectedChapterId: string;
  onSelectUnit: (unit: CourseUnit) => void;
  onSelectChapter: (chapter: CourseChapter) => void;
}) {
  return (
    <nav className="course-tree" aria-label="课程目录" data-testid="course-tree">
      <header>
        <span>当前课程</span>
        <strong>八年级数学下册</strong>
      </header>
      <div className="course-tree__units">
        {courseUnits.map((unit) => {
          const selected = props.selectedUnitId === unit.id;
          return (
            <section key={unit.id} className={selected ? "is-selected" : "is-dimmed"}>
              <button type="button" onClick={() => props.onSelectUnit(unit)}>
                <span>
                  <strong>{unit.title}</strong>
                  <small>{unit.subtitle}</small>
                </span>
                <WorkspaceIcon name={selected ? "arrowRight" : "chevron"} />
              </button>
              {selected ? (
                <div className="course-tree__chapters">
                  {unit.chapters.map((chapter) => (
                    <button
                      type="button"
                      key={chapter.id}
                      className={props.selectedChapterId === chapter.id ? "is-active" : ""}
                      onClick={() => props.onSelectChapter(chapter)}
                    >
                      <span>{chapter.title}</span>
                      <small>{chapter.progress}%</small>
                    </button>
                  ))}
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
    </nav>
  );
}

export function CourseFileList(props: {
  chapter: CourseChapter;
  selectedFileId: string | null;
  onSelect: (file: TeachingFile) => void;
}) {
  const files = props.chapter.fileIds
    .map((id) => teachingFiles.find((file) => file.id === id))
    .filter((file): file is TeachingFile => Boolean(file));
  return (
    <section className="course-file-list" data-testid="course-file-list">
      <header>
        <div>
          <span>当前章节</span>
          <h2>{props.chapter.title}</h2>
          <p>{props.chapter.objective}</p>
        </div>
        <div className="chapter-progress" aria-label={`准备进度 ${props.chapter.progress}%`}>
          <span>准备进度</span>
          <strong>{props.chapter.progress}%</strong>
          <i><b style={{ width: `${props.chapter.progress}%` }} /></i>
        </div>
      </header>
      <div className="course-file-list__items">
        {files.map((file) => (
          <button
            type="button"
            key={file.id}
            className={props.selectedFileId === file.id ? "is-active" : ""}
            onClick={() => props.onSelect(file)}
          >
            <span className="file-type-icon">
              <WorkspaceIcon name={file.fileType === "PPT" ? "slides" : "document"} />
            </span>
            <span>
              <strong>{file.name}</strong>
              <small>{file.purpose} · {file.fileType} · {file.modifiedAt}</small>
            </span>
            <StatusPill tone={file.status === "待审核" ? "warning" : file.status === "已就绪" ? "success" : "neutral"}>
              {file.status}
            </StatusPill>
          </button>
        ))}
        {files.length === 0 ? (
          <EmptyNotice title="本章节尚无文件" description="可以从文件库关联已有材料，或交给 Agent 创建草稿。" />
        ) : null}
      </div>
    </section>
  );
}

export function FilePreview(props: {
  file: TeachingFile | null;
  onAction: (action: string) => void;
}) {
  if (!props.file) {
    return (
      <aside className="file-preview">
        <EmptyNotice title="选择一个文件" description="在中间列表选择文件后，这里会显示内容摘要和版本信息。" />
      </aside>
    );
  }
  const file = props.file;
  return (
    <aside className="file-preview" data-testid="file-preview">
      <header>
        <span className="file-type-icon file-type-icon--large">
          <WorkspaceIcon name={file.fileType === "PPT" ? "slides" : "document"} />
        </span>
        <div>
          <StatusPill tone="blue">{file.fileType}</StatusPill>
          <h2>{file.name}</h2>
          <p>{file.version} · {file.modifiedAt}</p>
        </div>
      </header>
      <div className={`document-preview document-preview--${file.fileType.toLowerCase()}`}>
        {file.fileType === "PPT" ? (
          <>
            <span>第 6 页 / 18 页</span>
            <strong>斜率如何改变图像？</strong>
            <div className="slope-preview" aria-label="斜率直线示意">
              <i /><i /><i />
            </div>
          </>
        ) : file.fileType === "Excel" ? (
          <div className="sheet-preview">
            {["题号", "教学目标", "正确率", "备注", "1", "判断趋势", "91%", "已复核", "2", "解释变化率", "68%", "待复核"].map((cell, index) => <span key={`${cell}:${index}`}>{cell}</span>)}
          </div>
        ) : (
          <>
            <span>{file.purpose}预览</span>
            <strong>{file.name}</strong>
            <p>{file.preview}</p>
            <p>该预览使用演示摘要，不代表完整文件内容。</p>
          </>
        )}
      </div>
      <dl className="file-metadata">
        <div><dt>状态</dt><dd>{file.status}</dd></div>
        <div><dt>大小</dt><dd>{file.size}</dd></div>
        <div><dt>修改人</dt><dd>{file.modifiedBy}</dd></div>
        <div><dt>所属班级</dt><dd>{file.className}</dd></div>
      </dl>
      <div className="file-preview__actions">
        {[
          ["编辑", "edit"],
          ["下载", "download"],
          ["生成新版本", "plus"],
          ["查看历史", "clock"]
        ].map(([label, icon]) => (
          <Button key={label} icon={<WorkspaceIcon name={icon as "edit" | "download" | "plus" | "clock"} />} onClick={() => props.onAction(label!)}>
            {label}
          </Button>
        ))}
      </div>
    </aside>
  );
}

export function HomeworkList(props: {
  selectedId: string;
  onSelect: (homework: HomeworkRecord) => void;
  onCreate: () => void;
}) {
  return (
    <aside className="record-list" aria-label="作业列表" data-testid="homework-list">
      <header>
        <h2>作业</h2>
        <button type="button" aria-label="新建作业" onClick={props.onCreate}><WorkspaceIcon name="plus" /></button>
      </header>
      {homeworkRecords.map((record) => (
        <button
          type="button"
          key={record.id}
          className={record.id === props.selectedId ? "is-active" : ""}
          onClick={() => props.onSelect(record)}
        >
          <span>
            <strong>{record.title}</strong>
            <small>{record.className}</small>
          </span>
          <StatusPill tone={record.status === "收集中" ? "blue" : "neutral"}>{record.status}</StatusPill>
          <dl>
            <div><dt>发布</dt><dd>{record.publishedAt}</dd></div>
            <div><dt>截止</dt><dd>{record.dueAt}</dd></div>
            <div><dt>提交</dt><dd>{record.metrics.submitted}%</dd></div>
          </dl>
        </button>
      ))}
    </aside>
  );
}

export function HomeworkDashboard(props: {
  homework: HomeworkRecord;
  onAction: (action: string) => void;
}) {
  const [studentFilter, setStudentFilter] = useState<"all" | "missing" | "low">("all");
  const studentsToShow = props.homework.students.filter((student) => {
    if (studentFilter === "missing") return !student.submitted;
    if (studentFilter === "low") return student.accuracy !== null && student.accuracy < 75;
    return true;
  });
  return (
    <div className="analysis-dashboard" data-testid="homework-dashboard">
      <header className="analysis-dashboard__header">
        <div>
          <span>{props.homework.className} · {props.homework.status}</span>
          <h2>{props.homework.title}</h2>
          <p>发布 {props.homework.publishedAt} · 截止 {props.homework.dueAt}</p>
        </div>
        <Button type="primary" icon={<WorkspaceIcon name="agent" />} onClick={() => props.onAction("交给 Agent 分析")}>
          交给 Agent 分析
        </Button>
      </header>
      <div className="metric-grid metric-grid--six">
        <MetricCard label="提交率" value={`${props.homework.metrics.submitted}%`} />
        <MetricCard label="完成率" value={`${props.homework.metrics.completed}%`} />
        <MetricCard label="平均正确率" value={`${props.homework.metrics.accuracy}%`} />
        <MetricCard label="平均用时" value={`${props.homework.metrics.averageMinutes} 分钟`} />
        <MetricCard label="迟交" value={props.homework.metrics.late} tone={props.homework.metrics.late ? "attention" : "neutral"} />
        <MetricCard label="未交" value={props.homework.metrics.missing} tone={props.homework.metrics.missing ? "attention" : "neutral"} />
      </div>
      <div className="chart-grid">
        <ChartCard title="整体正确率" caption="已提交学生">
          <DonutChart value={props.homework.metrics.accuracy} label="平均正确率" />
        </ChartCard>
        <ChartCard title="知识点表现" caption="按当前评分规则">
          <BarChart items={props.homework.knowledge} />
        </ChartCard>
        <ChartCard title="题目正确率" caption="第 1–10 题">
          <div className="question-bars">
            {props.homework.questions.map((value, index) => (
              <span key={`${value}:${index}`} title={`第 ${index + 1} 题 ${value}%`}>
                <i style={{ height: `${Math.max(value, 4)}%` }} />
                <small>{index + 1}</small>
              </span>
            ))}
          </div>
        </ChartCard>
        <ChartCard title="最近四次完成趋势" caption="班级平均正确率">
          <MiniLineChart values={props.homework.trend} label="最近四次作业平均正确率趋势" />
        </ChartCard>
      </div>
      <ModuleCard
        title="学生明细"
        action={
          <div className="table-filters">
            <button type="button" className={studentFilter === "all" ? "is-active" : ""} onClick={() => setStudentFilter("all")}>全部</button>
            <button type="button" className={studentFilter === "missing" ? "is-active" : ""} onClick={() => setStudentFilter("missing")}>仅看未交</button>
            <button type="button" className={studentFilter === "low" ? "is-active" : ""} onClick={() => setStudentFilter("low")}>低于 75%</button>
          </div>
        }
      >
        <Table
          size="small"
          pagination={false}
          rowKey="id"
          dataSource={studentsToShow}
          columns={[
            { title: "学生", dataIndex: "name" },
            { title: "提交", render: (_, item) => item.submitted ? (item.late ? "已交 · 迟交" : "已交") : <strong className="missing-value">未交</strong> },
            { title: "正确率", render: (_, item) => item.accuracy === null ? "—" : `${item.accuracy}%` },
            { title: "得分", render: (_, item) => item.score === null ? "—" : `${item.score} / 50` },
            { title: "用时", dataIndex: "duration" },
            { title: "主要情况", dataIndex: "issue" },
            { title: "操作", render: () => <button type="button" className="text-action" onClick={() => props.onAction("查看学生作业详情")}>查看</button> }
          ]}
        />
      </ModuleCard>
      <div className="analysis-actions">
        {["查看错题", "生成讲评材料", "调整下一课", "创建补救练习"].map((action) => (
          <Button key={action} onClick={() => props.onAction(action)}>{action}</Button>
        ))}
      </div>
    </div>
  );
}

export function ExamList(props: {
  selectedId: string;
  onSelect: (exam: ExamRecord) => void;
  onCreate: () => void;
}) {
  return (
    <aside className="record-list" aria-label="测试列表" data-testid="exam-list">
      <header><h2>测试</h2><button type="button" aria-label="新建测试" onClick={props.onCreate}><WorkspaceIcon name="plus" /></button></header>
      {examRecords.map((record) => (
        <button type="button" key={record.id} className={record.id === props.selectedId ? "is-active" : ""} onClick={() => props.onSelect(record)}>
          <span><strong>{record.title}</strong><small>{record.className}</small></span>
          <StatusPill tone={record.status === "已分析" ? "blue" : "neutral"}>{record.status}</StatusPill>
          <dl>
            <div><dt>时间</dt><dd>{record.date}</dd></div>
            <div><dt>类型</dt><dd>{record.kind}</dd></div>
          </dl>
        </button>
      ))}
    </aside>
  );
}

export function ExamDashboard(props: {
  exam: ExamRecord;
  onAction: (action: string) => void;
}) {
  const metrics = props.exam.metrics;
  const rows = students.map((student, index) => ({
    id: student.id,
    name: student.name,
    score: Math.min(98, Math.round(metrics.average - 14 + (index % 7) * 5)),
    classRank: index + 3,
    gradeRank: metrics.gradePercentile ? 28 + index * 4 : null,
    knowledge: index % 2 === 0 ? "图像判断较稳定" : "解释变化率待复核",
    change: index % 3 === 0 ? "较上次 +4" : "与上次接近",
    attention: student.followUp ? "建议查看错题与作答过程" : "暂无紧急事项"
  }));
  return (
    <div className="analysis-dashboard" data-testid="exam-dashboard">
      <header className="analysis-dashboard__header">
        <div>
          <span>{props.exam.className} · {props.exam.kind}</span>
          <h2>{props.exam.title}</h2>
          <p>{props.exam.date} · {props.exam.status}</p>
        </div>
        <Button type="primary" icon={<WorkspaceIcon name="agent" />} onClick={() => props.onAction("交给 Agent 分析")}>交给 Agent 分析</Button>
      </header>
      <div className="metric-grid metric-grid--five">
        <MetricCard label="班级平均分" value={metrics.average} />
        <MetricCard label="中位数" value={metrics.median} />
        <MetricCard label="最高 / 最低" value={`${metrics.highest} / ${metrics.lowest}`} />
        <MetricCard label="标准差" value={metrics.deviation} />
        <MetricCard label="优秀 / 及格" value={`${metrics.excellentRate}% / ${metrics.passRate}%`} />
        {metrics.gradeAverage !== undefined ? <MetricCard label="年级平均分" value={metrics.gradeAverage} /> : null}
        {metrics.gradePercentile !== undefined ? <MetricCard label="年级百分位" value={`前 ${100 - metrics.gradePercentile}%`} note="有年级比较数据" /> : null}
      </div>
      <div className="chart-grid">
        <ChartCard title="分数段人数" caption="不等同于能力标签">
          <BarChart items={props.exam.scoreBands} suffix=" 人" />
        </ChartCard>
        <ChartCard title="知识点表现" caption="按本次测试评分点">
          <BarChart items={props.exam.knowledge} />
        </ChartCard>
        <ChartCard title="最近四次测评" caption="班级平均分">
          <MiniLineChart values={props.exam.comparison} label="最近四次测试平均分趋势" />
        </ChartCard>
        <ChartCard title="班级与年级" caption={metrics.gradeAverage === undefined ? "本次无年级比较数据" : "仅比较同次测试"}>
          {metrics.gradeAverage === undefined ? (
            <EmptyNotice title="暂无年级比较" description="没有可靠的年级同卷数据，因此不显示班级位置。" />
          ) : (
            <div className="comparison-bars">
              <span><strong>{metrics.average}</strong><i style={{ height: `${metrics.average}%` }} /><small>本班</small></span>
              <span><strong>{metrics.gradeAverage}</strong><i style={{ height: `${metrics.gradeAverage}%` }} /><small>年级</small></span>
            </div>
          )}
        </ChartCard>
      </div>
      <ModuleCard title="学生明细">
        <Table
          size="small"
          pagination={{ pageSize: 8, size: "small" }}
          rowKey="id"
          dataSource={rows}
          columns={[
            { title: "学生", dataIndex: "name" },
            { title: "总分", dataIndex: "score", sorter: (a, b) => a.score - b.score },
            { title: "班级位置", render: (_, item) => `第 ${item.classRank}` },
            ...(metrics.gradePercentile !== undefined ? [{ title: "年级位置", render: (_: unknown, item: typeof rows[number]) => `第 ${item.gradeRank}` }] : []),
            { title: "知识点情况", dataIndex: "knowledge" },
            { title: "最近变化", dataIndex: "change" },
            { title: "需要留意", dataIndex: "attention" }
          ]}
        />
      </ModuleCard>
      <div className="analysis-actions">
        {["查看试卷", "查看错题", "生成讲评课", "生成个别指导建议", "导出报告"].map((action) => (
          <Button key={action} onClick={() => props.onAction(action)}>{action}</Button>
        ))}
      </div>
    </div>
  );
}

export function CourseWorkspace(props: {
  onAction: (action: string) => void;
}) {
  const firstUnit = courseUnits[0]!;
  const firstChapter = firstUnit.chapters[2]!;
  const [unit, setUnit] = useState(firstUnit);
  const [chapter, setChapter] = useState(firstChapter);
  const [file, setFile] = useState<TeachingFile | null>(() => teachingFiles.find((item) => item.id === firstChapter.fileIds[0]) ?? null);

  const selectUnit = (nextUnit: CourseUnit) => {
    setUnit(nextUnit);
    const nextChapter = nextUnit.chapters[0]!;
    setChapter(nextChapter);
    setFile(teachingFiles.find((item) => item.id === nextChapter.fileIds[0]) ?? null);
  };
  const selectChapter = (nextChapter: CourseChapter) => {
    setChapter(nextChapter);
    setFile(teachingFiles.find((item) => item.id === nextChapter.fileIds[0]) ?? null);
  };

  return (
    <div className="course-workspace">
      <CourseTree
        selectedUnitId={unit.id}
        selectedChapterId={chapter.id}
        onSelectUnit={selectUnit}
        onSelectChapter={selectChapter}
      />
      <CourseFileList chapter={chapter} selectedFileId={file?.id ?? null} onSelect={setFile} />
      <FilePreview file={file} onAction={props.onAction} />
    </div>
  );
}

export function HomeworkWorkspace(props: { onAction: (action: string) => void }) {
  const [record, setRecord] = useState(homeworkRecords[0]!);
  return <div className="record-workspace"><HomeworkList selectedId={record.id} onSelect={setRecord} onCreate={() => props.onAction("新建作业")} /><HomeworkDashboard homework={record} onAction={props.onAction} /></div>;
}

export function ExamWorkspace(props: { onAction: (action: string) => void }) {
  const [record, setRecord] = useState(examRecords[0]!);
  return <div className="record-workspace"><ExamList selectedId={record.id} onSelect={setRecord} onCreate={() => props.onAction("新建测试")} /><ExamDashboard exam={record} onAction={props.onAction} /></div>;
}
