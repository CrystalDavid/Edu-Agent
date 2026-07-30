export type PortalRoute =
  | "/overview"
  | "/schedule"
  | "/teaching"
  | "/students"
  | "/files"
  | "/agent"
  | "/settings";

export type CourseCard = {
  id: string;
  time: string;
  className: string;
  subject: string;
  topic: string;
  room: string;
  preparation: string;
  slides: string;
  homework: string;
};

export type TeacherTodo = {
  id: string;
  title: string;
  kind: string;
  due: string;
  status: "待处理" | "进行中" | "等待他人" | "已延期" | "已完成";
  priority: "普通" | "重要";
  context: string;
};

export type ScheduleEvent = {
  id: string;
  date: string;
  start: string;
  end: string;
  kind: "课程" | "会议" | "教研" | "备课" | "批改";
  title: string;
  location: string;
};

export type TeachingFile = {
  id: string;
  name: string;
  purpose: "教案" | "作业" | "课件" | "测评" | "讲义" | "报告" | "其他";
  fileType: "PPT" | "Word" | "Excel" | "PDF" | "图片" | "文本";
  course: string;
  className: string;
  modifiedAt: string;
  modifiedBy: string;
  version: string;
  status: "草稿" | "待审核" | "已就绪" | "已归档";
  size: string;
  preview: string;
};

export type CourseChapter = {
  id: string;
  title: string;
  objective: string;
  progress: number;
  fileIds: string[];
};

export type CourseUnit = {
  id: string;
  title: string;
  subtitle: string;
  chapters: CourseChapter[];
};

export type HomeworkStudent = {
  id: string;
  name: string;
  submitted: boolean;
  accuracy: number | null;
  score: number | null;
  duration: string;
  late: boolean;
  issue: string;
};

export type HomeworkRecord = {
  id: string;
  title: string;
  className: string;
  publishedAt: string;
  dueAt: string;
  status: string;
  metrics: {
    submitted: number;
    completed: number;
    accuracy: number;
    averageMinutes: number;
    late: number;
    missing: number;
  };
  knowledge: Array<{ label: string; value: number }>;
  questions: number[];
  trend: number[];
  students: HomeworkStudent[];
};

export type ExamRecord = {
  id: string;
  title: string;
  className: string;
  date: string;
  kind: string;
  status: string;
  metrics: {
    average: number;
    median: number;
    highest: number;
    lowest: number;
    deviation: number;
    excellentRate: number;
    passRate: number;
    gradeAverage?: number;
    gradePercentile?: number;
  };
  scoreBands: Array<{ label: string; value: number }>;
  knowledge: Array<{ label: string; value: number }>;
  comparison: number[];
};

export type StudentRecord = {
  id: string;
  name: string;
  className: string;
  status: string;
  change: string;
  followUp: boolean;
  homework: Array<{
    title: string;
    submitted: boolean;
    score: number | null;
    accuracy: number | null;
    duration: string;
    assistance: string;
    issue: string;
  }>;
  exams: Array<{
    title: string;
    score: number;
    change: string;
    knowledge: string;
    error: string;
  }>;
  attention: string[];
};

export type AgentConversation = {
  id: string;
  title: string;
  group: "今天" | "昨天" | "最近 7 天" | "更早";
  updatedAt: string;
  scope: string;
  favorite?: boolean;
  messages: Array<{
    id: string;
    role: "teacher" | "assistant";
    content: string;
    sources?: string[];
    steps?: string[];
  }>;
};

export type AgentContextItem = {
  id: string;
  kind: "课程" | "班级" | "学生" | "文件" | "目标" | "待办";
  title: string;
  reason: string;
};

export const todayCourses: CourseCard[] = [
  {
    id: "course-0800",
    time: "08:00–08:45",
    className: "八年级 3 班",
    subject: "数学",
    topic: "一次函数：斜率与图像",
    room: "教学楼 302",
    preparation: "教案已准备",
    slides: "课件待完成",
    homework: "作业待确认"
  },
  {
    id: "course-1010",
    time: "10:10–10:55",
    className: "八年级 1 班",
    subject: "数学",
    topic: "一次函数复习",
    room: "教学楼 305",
    preparation: "已准备",
    slides: "已就绪",
    homework: "已布置"
  },
  {
    id: "course-1400",
    time: "14:00–14:45",
    className: "八年级 2 班",
    subject: "数学",
    topic: "函数图像综合练习",
    room: "教学楼 304",
    preparation: "已准备",
    slides: "已就绪",
    homework: "课堂确认"
  }
];
export const teacherTodos: TeacherTodo[] = [
  {
    id: "todo-slides",
    title: "完成一次函数课件",
    kind: "课件",
    due: "今天 17:30",
    status: "进行中",
    priority: "重要",
    context: "八年级 3 班 · 一次函数"
  },
  {
    id: "todo-grade",
    title: "批改斜率与截距课后作业",
    kind: "批改",
    due: "今天 18:00",
    status: "待处理",
    priority: "重要",
    context: "八年级 3 班 · 38 份已交"
  },
  {
    id: "todo-student",
    title: "与学生 14 确认解题思路",
    kind: "学生",
    due: "明天课前",
    status: "待处理",
    priority: "普通",
    context: "需要补充独立解释的观察"
  },
  {
    id: "todo-meeting",
    title: "准备数学备课组教研材料",
    kind: "教研",
    due: "今天 16:10",
    status: "等待他人",
    priority: "普通",
    context: "等待王老师共享统计表"
  },
  {
    id: "todo-review",
    title: "复评一次函数教学目标",
    kind: "课程",
    due: "本周五",
    status: "待处理",
    priority: "普通",
    context: "八年级 3 班"
  },
  {
    id: "todo-overdue",
    title: "整理上周单元测验反馈",
    kind: "测评",
    due: "昨天",
    status: "已延期",
    priority: "普通",
    context: "八年级 1 班"
  },
  {
    id: "todo-done",
    title: "确认今日三节课教室",
    kind: "日程",
    due: "今天 07:20",
    status: "已完成",
    priority: "普通",
    context: "今日课程"
  }
];

export const scheduleEvents: ScheduleEvent[] = [
  { id: "event-1", date: "2026-07-30", start: "08:00", end: "08:45", kind: "课程", title: "八年级 3 班 · 一次函数", location: "教学楼 302" },
  { id: "event-2", date: "2026-07-30", start: "09:10", end: "09:50", kind: "备课", title: "完善一次函数课件", location: "数学组办公室" },
  { id: "event-3", date: "2026-07-30", start: "10:10", end: "10:55", kind: "课程", title: "八年级 1 班 · 一次函数复习", location: "教学楼 305" },
  { id: "event-4", date: "2026-07-30", start: "12:40", end: "13:20", kind: "批改", title: "八年级 3 班作业", location: "数学组办公室" },
  { id: "event-5", date: "2026-07-30", start: "14:00", end: "14:45", kind: "课程", title: "八年级 2 班 · 综合练习", location: "教学楼 304" },
  { id: "event-6", date: "2026-07-30", start: "16:20", end: "17:10", kind: "会议", title: "数学备课组碰头", location: "教研室 2" },
  { id: "event-7", date: "2026-07-31", start: "09:00", end: "09:45", kind: "教研", title: "一次函数单元复盘", location: "教研室 2" },
  { id: "event-8", date: "2026-08-01", start: "10:00", end: "11:00", kind: "备课", title: "下周课程规划", location: "线上" }
];

export const teachingFiles: TeachingFile[] = [
  { id: "file-ppt-1", name: "一次函数：斜率与图像", purpose: "课件", fileType: "PPT", course: "八年级数学下册", className: "八年级 3 班", modifiedAt: "今天 10:24", modifiedBy: "林老师", version: "版本 3", status: "草稿", size: "4.8 MB", preview: "共 18 页。以三个坐标系中的直线变化为主线，包含课堂追问和即时练习。" },
  { id: "file-plan-1", name: "一次函数斜率与图像教案", purpose: "教案", fileType: "Word", course: "八年级数学下册", className: "八年级 3 班", modifiedAt: "昨天 16:45", modifiedBy: "林老师", version: "版本 2", status: "待审核", size: "680 KB", preview: "教学目标：从变化率解释图像倾斜程度，并区分斜率与截距。" },
  { id: "file-practice-1", name: "斜率与截距课堂练习", purpose: "讲义", fileType: "PDF", course: "八年级数学下册", className: "八年级 3 班", modifiedAt: "昨天 15:10", modifiedBy: "林老师", version: "版本 1", status: "已就绪", size: "1.2 MB", preview: "6 道课堂练习，覆盖图像判断、变化率解释和新情境迁移。" },
  { id: "file-homework-1", name: "一次函数课后作业", purpose: "作业", fileType: "Word", course: "八年级数学下册", className: "八年级 3 班", modifiedAt: "7 月 29 日", modifiedBy: "林老师", version: "版本 2", status: "草稿", size: "420 KB", preview: "8 道基础题与 2 道解释题，尚未发布。" },
  { id: "file-preview-1", name: "第一节预习材料", purpose: "讲义", fileType: "PDF", course: "八年级数学下册", className: "八年级 3 班", modifiedAt: "7 月 28 日", modifiedBy: "备课组", version: "版本 1", status: "已就绪", size: "900 KB", preview: "函数概念、变量关系与坐标系基础回顾。" },
  { id: "file-assess-1", name: "一次函数课堂测评", purpose: "测评", fileType: "Excel", course: "八年级数学下册", className: "八年级 3 班", modifiedAt: "7 月 28 日", modifiedBy: "林老师", version: "版本 1", status: "已就绪", size: "82 KB", preview: "共 5 题，包含题号、目标、参考答案与评分点。" },
  { id: "file-reflect-1", name: "一次函数教学反思", purpose: "报告", fileType: "文本", course: "八年级数学下册", className: "八年级 1 班", modifiedAt: "7 月 27 日", modifiedBy: "林老师", version: "版本 1", status: "草稿", size: "18 KB", preview: "学生能判断趋势，但在解释变化率时仍倾向引用截距位置。" },
  { id: "file-chart-1", name: "八年级作业完成情况", purpose: "报告", fileType: "Excel", course: "八年级数学下册", className: "三个任教班级", modifiedAt: "7 月 27 日", modifiedBy: "系统整理", version: "版本 4", status: "已就绪", size: "130 KB", preview: "按班级汇总最近三次作业提交率、正确率与平均用时。" },
  { id: "file-image-1", name: "斜率变化示意图", purpose: "其他", fileType: "图片", course: "八年级数学下册", className: "通用", modifiedAt: "7 月 26 日", modifiedBy: "林老师", version: "版本 1", status: "已归档", size: "560 KB", preview: "三条经过同一点、斜率不同的直线示意图。" },
  { id: "file-exam-1", name: "一次函数单元测试卷", purpose: "测评", fileType: "PDF", course: "八年级数学下册", className: "八年级 3 班", modifiedAt: "7 月 25 日", modifiedBy: "备课组", version: "版本 2", status: "已就绪", size: "2.1 MB", preview: "单元测试卷，共 100 分，含选择、填空与综合题。" }
];

const chapterFiles = ["file-preview-1", "file-plan-1", "file-ppt-1", "file-practice-1", "file-assess-1", "file-homework-1", "file-reflect-1"];

export const courseUnits: CourseUnit[] = [
  {
    id: "unit-1",
    title: "第一单元",
    subtitle: "一次函数",
    chapters: [
      { id: "chapter-1-1", title: "第一节 函数与变量", objective: "理解函数关系及其表示方式", progress: 100, fileIds: ["file-preview-1", "file-plan-1"] },
      { id: "chapter-1-2", title: "第二节 一次函数的图像", objective: "从图像理解一次函数的基本特征", progress: 85, fileIds: ["file-ppt-1", "file-practice-1"] },
      { id: "chapter-1-3", title: "第三节 斜率与图像", objective: "用变化率解释直线的倾斜方向和程度", progress: 68, fileIds: chapterFiles },
      { id: "chapter-1-4", title: "第四节 截距与平移", objective: "区分斜率和截距对图像的影响", progress: 40, fileIds: ["file-plan-1", "file-assess-1"] },
      { id: "chapter-1-5", title: "第五节 一次函数应用", objective: "在真实情境中建立一次函数模型", progress: 20, fileIds: ["file-homework-1"] }
    ]
  },
  {
    id: "unit-2",
    title: "第二单元",
    subtitle: "数据分析",
    chapters: [
      { id: "chapter-2-1", title: "第一节 数据的收集", objective: "选择合适的方法收集数据", progress: 0, fileIds: ["file-chart-1"] },
      { id: "chapter-2-2", title: "第二节 数据的表示", objective: "使用统计图表表达数据", progress: 0, fileIds: ["file-chart-1"] },
      { id: "chapter-2-3", title: "第三节 数据的比较", objective: "根据统计量比较两组数据", progress: 0, fileIds: ["file-chart-1"] }
    ]
  },
  {
    id: "unit-3",
    title: "第三单元",
    subtitle: "全等三角形",
    chapters: [
      { id: "chapter-3-1", title: "第一节 全等图形", objective: "理解全等关系", progress: 0, fileIds: [] },
      { id: "chapter-3-2", title: "第二节 判定方法", objective: "使用条件判定三角形全等", progress: 0, fileIds: [] },
      { id: "chapter-3-3", title: "第三节 综合应用", objective: "解决几何证明问题", progress: 0, fileIds: [] }
    ]
  },
  {
    id: "unit-4",
    title: "第四单元",
    subtitle: "轴对称",
    chapters: [
      { id: "chapter-4-1", title: "第一节 轴对称图形", objective: "识别轴对称特征", progress: 0, fileIds: [] },
      { id: "chapter-4-2", title: "第二节 等腰三角形", objective: "理解等腰三角形性质", progress: 0, fileIds: [] },
      { id: "chapter-4-3", title: "第三节 最短路径", objective: "利用对称解决路径问题", progress: 0, fileIds: [] }
    ]
  },
  {
    id: "unit-5",
    title: "第五单元",
    subtitle: "整式乘除",
    chapters: [
      { id: "chapter-5-1", title: "第一节 幂的运算", objective: "掌握幂的运算法则", progress: 0, fileIds: [] },
      { id: "chapter-5-2", title: "第二节 乘法公式", objective: "理解并应用乘法公式", progress: 0, fileIds: [] },
      { id: "chapter-5-3", title: "第三节 因式分解", objective: "使用合适方法分解因式", progress: 0, fileIds: [] }
    ]
  },
  {
    id: "unit-6",
    title: "第六单元",
    subtitle: "分式",
    chapters: [
      { id: "chapter-6-1", title: "第一节 分式概念", objective: "理解分式及基本性质", progress: 0, fileIds: [] },
      { id: "chapter-6-2", title: "第二节 分式运算", objective: "完成分式四则运算", progress: 0, fileIds: [] },
      { id: "chapter-6-3", title: "第三节 分式方程", objective: "建立并求解分式方程", progress: 0, fileIds: [] }
    ]
  }
];

const homeworkStudents: HomeworkStudent[] = [
  { id: "01", name: "学生 01", submitted: true, accuracy: 92, score: 46, duration: "22 分钟", late: false, issue: "暂无明显共性问题" },
  { id: "02", name: "学生 02", submitted: true, accuracy: 84, score: 42, duration: "28 分钟", late: false, issue: "截距符号有一次错误" },
  { id: "03", name: "学生 03", submitted: true, accuracy: 88, score: 44, duration: "25 分钟", late: false, issue: "暂无明显共性问题" },
  { id: "04", name: "学生 04", submitted: true, accuracy: 76, score: 38, duration: "35 分钟", late: true, issue: "图像平移解释不完整" },
  { id: "05", name: "学生 05", submitted: true, accuracy: 80, score: 40, duration: "31 分钟", late: false, issue: "变化率单位遗漏" },
  { id: "06", name: "学生 06", submitted: false, accuracy: null, score: null, duration: "—", late: false, issue: "未交" },
  { id: "07", name: "学生 07", submitted: true, accuracy: 90, score: 45, duration: "24 分钟", late: false, issue: "暂无明显共性问题" },
  { id: "08", name: "学生 08", submitted: true, accuracy: 72, score: 36, duration: "39 分钟", late: false, issue: "斜率与截距混淆" },
  { id: "09", name: "学生 09", submitted: false, accuracy: null, score: null, duration: "—", late: false, issue: "未交" },
  { id: "10", name: "学生 10", submitted: true, accuracy: 86, score: 43, duration: "27 分钟", late: false, issue: "暂无明显共性问题" },
  { id: "11", name: "学生 11", submitted: false, accuracy: null, score: null, duration: "—", late: false, issue: "未交" },
  { id: "12", name: "学生 12", submitted: false, accuracy: null, score: null, duration: "—", late: false, issue: "未交" }
];

export const homeworkRecords: HomeworkRecord[] = [
  {
    id: "homework-1",
    title: "斜率与图像课后练习",
    className: "八年级 3 班",
    publishedAt: "7 月 29 日 16:30",
    dueAt: "今天 18:00",
    status: "收集中",
    metrics: { submitted: 90, completed: 86, accuracy: 82, averageMinutes: 29, late: 2, missing: 4 },
    knowledge: [{ label: "判断趋势", value: 91 }, { label: "计算斜率", value: 84 }, { label: "解释变化率", value: 68 }, { label: "区分截距", value: 61 }],
    questions: [96, 89, 84, 78, 70, 66, 82, 75, 64, 58],
    trend: [71, 75, 79, 82],
    students: homeworkStudents
  },
  {
    id: "homework-2",
    title: "一次函数图像判断",
    className: "八年级 1 班",
    publishedAt: "7 月 27 日 15:10",
    dueAt: "7 月 28 日 18:00",
    status: "已完成",
    metrics: { submitted: 100, completed: 100, accuracy: 86, averageMinutes: 25, late: 1, missing: 0 },
    knowledge: [{ label: "判断趋势", value: 94 }, { label: "计算斜率", value: 88 }, { label: "解释变化率", value: 76 }, { label: "区分截距", value: 72 }],
    questions: [98, 94, 91, 88, 84, 79, 76, 82],
    trend: [72, 78, 82, 86],
    students: homeworkStudents.map((student) => ({ ...student, submitted: true, accuracy: student.accuracy ?? 78, score: student.score ?? 39, issue: student.issue === "未交" ? "补交后已复核" : student.issue }))
  },
  {
    id: "homework-3",
    title: "函数图像综合练习",
    className: "八年级 2 班",
    publishedAt: "今天 09:00",
    dueAt: "本周五 18:00",
    status: "草稿",
    metrics: { submitted: 0, completed: 0, accuracy: 0, averageMinutes: 0, late: 0, missing: 0 },
    knowledge: [{ label: "图像判断", value: 0 }, { label: "关系表达", value: 0 }, { label: "情境建模", value: 0 }],
    questions: [0, 0, 0, 0, 0, 0],
    trend: [0, 0, 0, 0],
    students: homeworkStudents.map((student) => ({ ...student, submitted: false, accuracy: null, score: null, duration: "—", late: false, issue: "尚未发布" }))
  }
];

export const examRecords: ExamRecord[] = [
  {
    id: "exam-1",
    title: "一次函数单元测试",
    className: "八年级 3 班",
    date: "7 月 24 日",
    kind: "单元测试",
    status: "已分析",
    metrics: { average: 78.6, median: 80, highest: 98, lowest: 43, deviation: 11.8, excellentRate: 24, passRate: 88, gradeAverage: 76.9, gradePercentile: 68 },
    scoreBands: [{ label: "90–100", value: 10 }, { label: "80–89", value: 13 }, { label: "70–79", value: 9 }, { label: "60–69", value: 5 }, { label: "60 以下", value: 5 }],
    knowledge: [{ label: "函数概念", value: 88 }, { label: "图像特征", value: 82 }, { label: "斜率解释", value: 65 }, { label: "情境应用", value: 71 }],
    comparison: [72, 74, 76, 78.6]
  },
  {
    id: "exam-2",
    title: "期中阶段测评",
    className: "八年级 3 班",
    date: "6 月 28 日",
    kind: "阶段测评",
    status: "已归档",
    metrics: { average: 76.2, median: 77, highest: 96, lowest: 40, deviation: 12.4, excellentRate: 19, passRate: 84 },
    scoreBands: [{ label: "90–100", value: 8 }, { label: "80–89", value: 12 }, { label: "70–79", value: 10 }, { label: "60–69", value: 5 }, { label: "60 以下", value: 7 }],
    knowledge: [{ label: "整式运算", value: 80 }, { label: "几何推理", value: 73 }, { label: "数据分析", value: 76 }],
    comparison: [70, 73, 75, 76.2]
  }
];

const studentAttention = [
  ["斜率和截距的解释仍容易混淆", "在获得提示后可以完成，独立解释证据仍不足", "建议在 8 月 3 日前安排一次新情境复评"],
  ["程序计算正确，但变化率单位的解释需要补充", "最近一次作业用时明显增加", "建议先核实题目阅读过程"],
  ["最近两次作业均有迟交", "提交后的正确率保持稳定", "需要与学生确认时间安排，而非推断学习态度"],
  ["图像判断稳定", "复杂情境中的文字说明较短", "当前不需要额外干预"]
];

export const students: StudentRecord[] = Array.from({ length: 12 }, (_, index) => {
  const id = String(index + 1).padStart(2, "0");
  const profile = studentAttention[index % studentAttention.length]!;
  const followUp = [1, 3, 7, 10].includes(index);
  return {
    id,
    name: `学生 ${id}`,
    className: "八年级 3 班",
    status: followUp ? "需要跟进" : index % 3 === 0 ? "近期有变化" : "暂无紧急事项",
    change: index % 2 === 0 ? "最近两次练习解释更完整" : "近期表现基本稳定",
    followUp,
    homework: [
      { title: "斜率与图像课后练习", submitted: index !== 5, score: index === 5 ? null : 35 + (index % 6) * 2, accuracy: index === 5 ? null : 70 + (index % 6) * 4, duration: index === 5 ? "—" : `${24 + index} 分钟`, assistance: index % 3 === 0 ? "使用一级提示" : "独立完成", issue: profile[0]! },
      { title: "一次函数图像判断", submitted: true, score: 38 + (index % 5) * 2, accuracy: 76 + (index % 5) * 4, duration: `${20 + index} 分钟`, assistance: "独立完成", issue: index % 2 === 0 ? "暂无明显共性问题" : "解释较简短" }
    ],
    exams: [
      { title: "一次函数单元测试", score: 68 + (index % 7) * 4, change: index % 2 === 0 ? "较上次 +4" : "与上次接近", knowledge: "图像特征较稳定", error: profile[0]! },
      { title: "期中阶段测评", score: 65 + (index % 6) * 4, change: "历史记录", knowledge: "整式运算", error: "查看具体错题后再判断" }
    ],
    attention: profile
  };
});

export const preparationGroupUpdates = [
  { title: "王老师共享了《一次函数课堂提问清单》", time: "35 分钟前", action: "查看文件" },
  { title: "周五集体备课需要补充一份学生解释样例", time: "今天 09:20", action: "加入待办" },
  { title: "单元测试讲评材料等待两位教师复核", time: "昨天 17:45", action: "查看材料" }
];

export const schoolUpdates = [
  { title: "周五教研活动调整至 15:30", meta: "教务处 · 今天 08:10" },
  { title: "八年级阶段测评材料提交截止", meta: "截止 8 月 3 日" },
  { title: "多媒体教室设备维护安排", meta: "本周六 09:00–12:00" }
];

export const agentConversations: AgentConversation[] = [
  {
    id: "conversation-1",
    title: "完善一次函数课件",
    group: "今天",
    updatedAt: "10:32",
    scope: "八年级 3 班",
    favorite: true,
    messages: [
      { id: "m1", role: "teacher", content: "帮我把斜率为什么改变图像这一段讲得更直观。" },
      { id: "m2", role: "assistant", content: "可以从“每向右走 1 格，向上或向下走多少格”开始，再用同一截距的三条直线做比较。我已经整理了两种课堂活动草稿。", sources: ["一次函数教案 · 版本 2", "最近作业分析"], steps: ["读取当前课程与教学目标", "对照最近作业中的解释缺口", "生成可比较的课堂活动草稿"] }
    ]
  },
  {
    id: "conversation-2",
    title: "分析最近作业",
    group: "今天",
    updatedAt: "09:18",
    scope: "八年级 3 班",
    messages: [
      { id: "m3", role: "teacher", content: "最近作业最值得在课堂上处理的共性问题是什么？" },
      { id: "m4", role: "assistant", content: "最需要复核的是：部分学生能判断图像趋势，但解释时仍引用截距位置。这个结论只基于当前两次直接观察，建议用一个新情境追问确认。", sources: ["斜率与图像课后练习", "课堂直接观察"] }
    ]
  },
  { id: "conversation-3", title: "生成单元复习练习", group: "昨天", updatedAt: "昨天 17:20", scope: "八年级 1 班", messages: [] },
  { id: "conversation-4", title: "安排本周备课时间", group: "最近 7 天", updatedAt: "周一", scope: "个人日程", messages: [] },
  { id: "conversation-5", title: "期中测试讲评思路", group: "更早", updatedAt: "6 月 29 日", scope: "八年级 3 班", messages: [] }
];

export const initialAgentContext: AgentContextItem[] = [
  { id: "context-course", kind: "课程", title: "一次函数：斜率与图像", reason: "当前对话关联的课程" },
  { id: "context-class", kind: "班级", title: "八年级 3 班", reason: "任务明确指定的班级" },
  { id: "context-plan", kind: "文件", title: "一次函数斜率与图像教案 · 版本 2", reason: "最近编辑且与课程匹配" },
  { id: "context-goal", kind: "目标", title: "用变化率解释图像倾斜程度", reason: "当前章节的教学目标" }
];

export const agentQuickTasks = [
  "制作 PPT",
  "准备教案",
  "生成练习",
  "分析作业",
  "生成考试讲评",
  "策划课堂活动",
  "查看学生情况",
  "安排日程"
];
