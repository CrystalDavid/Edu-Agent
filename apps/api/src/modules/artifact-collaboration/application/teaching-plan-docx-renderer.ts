import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  LevelFormat,
  LineRuleType,
  PageNumber,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType
} from "docx";

import type {
  CourseRunView,
  CurriculumUnitView,
  LessonView,
  TeachingPlanRevisionView
} from "@edu-agent/contracts";

export const TEACHING_PLAN_DOCX_TEMPLATE_VERSION =
  "teacher-approved-lesson-plan-docx@1";

export interface TeachingPlanDocxEvidence {
  evidenceRef: string;
  summary: string;
  status: string;
}

export interface TeachingPlanDocxInput {
  courseRun: CourseRunView;
  unit: CurriculumUnitView;
  lesson: LessonView;
  revision: TeachingPlanRevisionView;
  evidence: readonly TeachingPlanDocxEvidence[];
  knownGaps: readonly string[];
  generatedAt: string;
}

const blue = "2E74B5";
const darkBlue = "1F4D78";
const muted = "5B6573";
const paleBlue = "E8EEF5";
const border = {
  style: BorderStyle.SINGLE,
  size: 4,
  color: "B7C3D0"
} as const;
const cjkFont = {
  ascii: "Calibri",
  hAnsi: "Calibri",
  eastAsia: "Microsoft YaHei",
  hint: "eastAsia" as const
};

function text(value: string, options: { bold?: boolean; color?: string } = {}) {
  return new TextRun({
    text: value,
    ...(options.bold === undefined ? {} : { bold: options.bold }),
    ...(options.color === undefined ? {} : { color: options.color }),
    font: cjkFont,
    size: 22
  });
}

function body(value: string): Paragraph {
  return new Paragraph({
    children: [text(value)],
    spacing: { after: 120, line: 300, lineRule: LineRuleType.AUTO }
  });
}

function heading(value: string, level: typeof HeadingLevel.HEADING_1 | typeof HeadingLevel.HEADING_2) {
  return new Paragraph({
    text: value,
    heading: level
  });
}

function bullet(value: string): Paragraph {
  return new Paragraph({
    children: [text(value)],
    numbering: { reference: "teacher-plan-bullets", level: 0 },
    spacing: { after: 80, line: 300, lineRule: LineRuleType.AUTO }
  });
}

function tableCell(
  value: string,
  options: { header?: boolean; width?: number } = {}
): TableCell {
  return new TableCell({
    ...(options.width
      ? { width: { size: options.width, type: WidthType.DXA } }
      : {}),
    ...(options.header ? { shading: { fill: paleBlue } } : {}),
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [
      new Paragraph({
        children: [
          text(value, options.header === undefined ? {} : { bold: options.header })
        ],
        spacing: { after: 0, line: 280, lineRule: LineRuleType.AUTO }
      })
    ]
  });
}

function informationTable(input: TeachingPlanDocxInput): Table {
  const rows = [
    ["课程", input.courseRun.title, "单元", input.unit.title],
    ["课时", input.lesson.title, "时长", `${input.lesson.durationMinutes} 分钟`],
    ["班级", input.courseRun.className, "学期", input.courseRun.academicTerm],
    ["版本", `Revision ${input.revision.revisionNumber}`, "状态", "教师已批准"]
  ];
  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    columnWidths: [1200, 3480, 1200, 3480],
    indent: { size: 120, type: WidthType.DXA },
    borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
    rows: rows.map(
      (row) =>
        new TableRow({
          cantSplit: true,
          children: [
            tableCell(row[0]!, { header: true, width: 1200 }),
            tableCell(row[1]!, { width: 3480 }),
            tableCell(row[2]!, { header: true, width: 1200 }),
            tableCell(row[3]!, { width: 3480 })
          ]
        })
    )
  });
}

function flowTable(input: TeachingPlanDocxInput): Table {
  const plan = input.revision.content;
  const rows = [
    ["导入", plan.openingActivity, "激活已有经验并明确本课问题。"],
    ["核心探究", plan.lessonFocus, plan.studentActivity],
    ["教师追问", plan.teacherQuestions.join("；"), plan.supportStrategy],
    ["独立检查", plan.independentCheck, "形成可复核的学习证据。"],
    ["后续安排", plan.followUp, "根据课堂证据由教师决定是否调整。"]
  ];
  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    columnWidths: [1200, 4080, 4080],
    indent: { size: 120, type: WidthType.DXA },
    borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
    rows: [
      new TableRow({
        tableHeader: true,
        cantSplit: true,
        children: [
          tableCell("环节", { header: true, width: 1200 }),
          tableCell("教师设计", { header: true, width: 4080 }),
          tableCell("学生活动与观察", { header: true, width: 4080 })
        ]
      }),
      ...rows.map(
        (row) =>
          new TableRow({
            cantSplit: true,
            children: [
              tableCell(row[0]!, { width: 1200 }),
              tableCell(row[1]!, { width: 4080 }),
              tableCell(row[2]!, { width: 4080 })
            ]
          })
      )
    ]
  });
}

export async function renderApprovedTeachingPlanDocx(
  input: TeachingPlanDocxInput
): Promise<Buffer> {
  if (input.revision.state !== "approved") {
    throw new Error("Only an approved TeachingPlan revision can be exported.");
  }

  const plan = input.revision.content;
  const evidenceByRef = new Map(
    input.evidence.map((item) => [item.evidenceRef, item])
  );
  const evidence = plan.evidenceRefs.map(
    (reference) =>
      evidenceByRef.get(reference) ?? {
        evidenceRef: reference,
        summary: "当前导出上下文中未找到该 Evidence 摘要，请教师复核。",
        status: "unknown"
      }
  );
  const generated = new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Asia/Shanghai"
  }).format(new Date(input.generatedAt));

  const document = new Document({
    creator: "Edu-Agent",
    title: `${input.lesson.title}｜教师已批准教案`,
    description: "AI 辅助生成、教师已批准的教学计划导出。",
    styles: {
      default: {
        document: {
          run: { font: cjkFont, size: 22 },
          paragraph: {
            spacing: { after: 120, line: 300, lineRule: LineRuleType.AUTO }
          }
        },
        heading1: {
          run: { font: cjkFont, size: 32, bold: true, color: blue },
          paragraph: { spacing: { before: 360, after: 200 } }
        },
        heading2: {
          run: { font: cjkFont, size: 26, bold: true, color: blue },
          paragraph: { spacing: { before: 280, after: 140 } }
        },
        heading3: {
          run: { font: cjkFont, size: 24, bold: true, color: darkBlue },
          paragraph: { spacing: { before: 200, after: 100 } }
        }
      }
    },
    numbering: {
      config: [
        {
          reference: "teacher-plan-bullets",
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: "•",
              suffix: "tab",
              alignment: AlignmentType.LEFT,
              style: {
                paragraph: { indent: { left: 540, hanging: 270 } },
                run: { font: cjkFont }
              }
            }
          ]
        }
      ]
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 12240, height: 15840 },
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440, header: 708, footer: 708 }
          }
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                children: [text("EDU-AGENT｜教师教学成果", { color: muted })],
                alignment: AlignmentType.RIGHT,
                spacing: { after: 0 }
              })
            ]
          })
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  text("AI 辅助生成、教师已批准｜第 ", { color: muted }),
                  new TextRun({ children: [PageNumber.CURRENT], color: muted, font: cjkFont, size: 20 }),
                  text(" 页", { color: muted })
                ]
              })
            ]
          })
        },
        children: [
          new Paragraph({
            children: [new TextRun({ text: "APPROVED TEACHING PLAN", color: blue, bold: true, font: cjkFont, size: 20, characterSpacing: 40 })],
            spacing: { after: 100 }
          }),
          new Paragraph({
            children: [new TextRun({ text: input.lesson.title, bold: true, font: cjkFont, size: 42, color: darkBlue })],
            spacing: { after: 120 }
          }),
          new Paragraph({
            children: [text(`${input.courseRun.title} · ${input.unit.title}`, { color: muted })],
            spacing: { after: 260 }
          }),
          informationTable(input),
          heading("一、教学目标", HeadingLevel.HEADING_1),
          body(plan.objective),
          ...input.lesson.learningObjectives.map((objective) =>
            bullet(`${objective.title}：${objective.description}`)
          ),
          heading("二、教学重点与难点", HeadingLevel.HEADING_1),
          body(plan.lessonFocus),
          heading("三、教学准备", HeadingLevel.HEADING_1),
          bullet("依据已授权 Evidence 设计问题链与观察点。"),
          bullet("准备函数图像、坐标系与典型斜率示例。"),
          bullet(plan.supportStrategy),
          heading("四、教学流程与活动", HeadingLevel.HEADING_1),
          flowTable(input),
          heading("五、Evidence 依据摘要", HeadingLevel.HEADING_1),
          ...evidence.map((item) =>
            bullet(`${item.evidenceRef}（${item.status}）：${item.summary}`)
          ),
          heading("六、已知缺口与边界", HeadingLevel.HEADING_1),
          ...(input.knownGaps.length > 0
            ? input.knownGaps.map(bullet)
            : [bullet("未提供额外证据缺口；教师仍需根据现场情况复核。")]),
          heading("七、课后反思", HeadingLevel.HEADING_1),
          body("课堂目标达成情况：____________________________________________"),
          body("学生关键表现与新证据：________________________________________"),
          body("下一轮调整：__________________________________________________"),
          heading("八、版本与责任说明", HeadingLevel.HEADING_1),
          bullet(`TeachingPlan Revision：${input.revision.revisionRef}（第 ${input.revision.revisionNumber} 版）`),
          bullet(`导出时间：${generated}`),
          bullet(`模板版本：${TEACHING_PLAN_DOCX_TEMPLATE_VERSION}`),
          new Paragraph({
            children: [text("AI 辅助生成、教师已批准。教学实施与后续调整仍由教师负责。", { bold: true, color: darkBlue })],
            spacing: { before: 160, after: 0 }
          })
        ]
      }
    ]
  });

  return Packer.toBuffer(document);
}
