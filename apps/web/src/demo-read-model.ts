import type {
  WorkspaceIconName
} from "./components/WorkspaceIcon";

export const todayCourses = [
  {
    id: "course-3",
    time: "08:00–08:45",
    className: "八年级 3 班",
    subject: "数学",
    topic: "一次函数：斜率与图像",
    status: "课件待完成",
    primaryAction: "继续备课",
    secondaryAction: "打开课件"
  },
  {
    id: "course-1",
    time: "10:10–10:55",
    className: "八年级 1 班",
    subject: "数学",
    topic: "一次函数复习",
    status: "教学计划已准备",
    primaryAction: "查看教学计划",
    secondaryAction: "查看课程"
  },
  {
    id: "course-2",
    time: "14:00–14:45",
    className: "八年级 2 班",
    subject: "数学",
    topic: "函数图像综合练习",
    status: "课堂练习待确认",
    primaryAction: "查看课程",
    secondaryAction: "打开练习"
  }
] as const;

export const quickActions: Array<{
  label: string;
  icon: WorkspaceIconName;
  command: string;
}> = [
  {
    label: "开始备课",
    icon: "lesson",
    command: "准备明天的课程"
  },
  {
    label: "制作课件",
    icon: "slides",
    command: "制作一次函数课件"
  },
  {
    label: "布置作业",
    icon: "assignment",
    command: "布置一次函数课后作业"
  },
  {
    label: "查看学情",
    icon: "insight",
    command: "查看需要关注的学生"
  },
  {
    label: "安排日程",
    icon: "calendar",
    command: "安排本周备课时间"
  },
  {
    label: "打开文件",
    icon: "files",
    command: "打开最近使用的文件"
  }
];

export const attentionItems = [
  {
    type: "课件",
    count: "1",
    title: "一次函数课件待完成",
    due: "今天 17:30",
    action: "继续制作",
    route: "/files"
  },
  {
    type: "作业",
    count: "4",
    title: "八年级 3 班有学生未交作业",
    due: "今天 18:00",
    action: "查看名单",
    route: "/assignments"
  },
  {
    type: "学生",
    count: "2",
    title: "两名学生的解释需要关注",
    due: "明天上课前",
    action: "查看情况",
    route: "/students"
  },
  {
    type: "课程",
    count: "1",
    title: "一个教学目标即将复评",
    due: "本周五",
    action: "查看目标",
    route: "/courses"
  }
] as const;

export const teachingAssets = [
  {
    type: "课件",
    name: "一次函数：斜率与图像",
    updatedAt: "今天 10:24",
    status: "待完成",
    action: "继续编辑"
  },
  {
    type: "教案",
    name: "一次函数斜率与图像关系",
    updatedAt: "昨天 16:45",
    status: "待审核",
    action: "查看变更"
  },
  {
    type: "练习",
    name: "斜率与截距课堂练习",
    updatedAt: "昨天 15:10",
    status: "已准备",
    action: "查看"
  },
  {
    type: "作业",
    name: "一次函数课后作业",
    updatedAt: "7 月 27 日",
    status: "草稿",
    action: "继续编辑"
  }
] as const;

export const focusStudents = [
  {
    id: "14",
    summary: "能判断结果，但解释依据不足",
    assistance: "使用一级提示"
  },
  {
    id: "21",
    summary: "程序计算正确，单位变化解释不足",
    assistance: "独立作答"
  }
] as const;

export const todaySchedule = [
  {
    time: "08:00",
    kind: "上课",
    title: "八年级 3 班 · 一次函数"
  },
  {
    time: "09:10",
    kind: "备课",
    title: "完成明日一次函数课件"
  },
  {
    time: "10:10",
    kind: "上课",
    title: "八年级 1 班 · 一次函数复习"
  },
  {
    time: "12:40",
    kind: "批改",
    title: "检查八年级 3 班作业"
  },
  {
    time: "14:00",
    kind: "上课",
    title: "八年级 2 班 · 综合练习"
  },
  {
    time: "16:20",
    kind: "会议",
    title: "数学备课组碰头"
  }
] as const;

export const recentFiles = [
  {
    type: "课堂记录",
    name: "八年级 3 班课堂观察记录",
    openedAt: "今天 09:02"
  },
  {
    type: "素材",
    name: "函数图像示例素材库",
    openedAt: "昨天 18:12"
  },
  {
    type: "表格",
    name: "本周备课安排",
    openedAt: "昨天 17:40"
  }
] as const;

export const classStudents = [
  { id: "03", name: "学生 03", status: "学习情况稳定", note: "暂无特别事项" },
  { id: "08", name: "学生 08", status: "学习情况稳定", note: "作业已提交" },
  { id: "14", name: "学生 14", status: "需要关注", note: "解释依据不足" },
  { id: "21", name: "学生 21", status: "需要关注", note: "单位变化解释不足" },
  { id: "27", name: "学生 27", status: "待补交作业", note: "最近一次作业未交" },
  { id: "31", name: "学生 31", status: "学习情况稳定", note: "暂无特别事项" }
] as const;

export const assignmentRows = [
  {
    name: "一次函数图像判断",
    className: "八年级 3 班",
    due: "今天 18:00",
    submitted: "38 / 42",
    status: "收集中"
  },
  {
    name: "斜率与截距课后练习",
    className: "八年级 1 班",
    due: "明天 18:00",
    submitted: "40 / 40",
    status: "已收齐"
  },
  {
    name: "函数图像综合练习",
    className: "八年级 2 班",
    due: "本周五",
    submitted: "0 / 41",
    status: "草稿"
  }
] as const;

export const courseRows = [
  {
    className: "八年级 3 班",
    subject: "数学",
    nextLesson: "一次函数：斜率与图像",
    time: "今天 08:00",
    status: "进行中"
  },
  {
    className: "八年级 1 班",
    subject: "数学",
    nextLesson: "一次函数复习",
    time: "今天 10:10",
    status: "进行中"
  },
  {
    className: "八年级 2 班",
    subject: "数学",
    nextLesson: "函数图像综合练习",
    time: "今天 14:00",
    status: "进行中"
  }
] as const;
