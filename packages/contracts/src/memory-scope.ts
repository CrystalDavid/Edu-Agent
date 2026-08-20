import { z } from "zod";

export const MemoryScopeKindSchema = z.enum([
  "global",
  "subject",
  "subject_grade",
  "course_run",
  "lesson",
  "task"
]);

export const StableMemorySkillIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(
    /^[a-z][a-z0-9-]*$/u,
    "Memory scope skillIds must use an unversioned stable Skill ID."
  );

const nullableScopeText = z.string().trim().min(1).max(200).nullable();

export const MemoryScopeDefinitionSchema = z
  .object({
    kind: MemoryScopeKindSchema,
    subject: nullableScopeText.default(null),
    gradeLevel: nullableScopeText.default(null),
    courseRunRef: nullableScopeText.default(null),
    lessonRef: nullableScopeText.default(null),
    taskRef: nullableScopeText.default(null),
    skillIds: z.array(StableMemorySkillIdSchema).max(20).default([])
  })
  .strict();

export const MemoryScopeSchema = MemoryScopeDefinitionSchema.extend({
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/u)
}).strict();

export const MemoryScopeQuerySchema = z
  .object({
    subject: nullableScopeText.default(null),
    gradeLevel: nullableScopeText.default(null),
    courseRunRef: nullableScopeText.default(null),
    lessonRef: nullableScopeText.default(null),
    taskRef: nullableScopeText.default(null)
  })
  .strict();

export const memoryScopeSpecificity = Object.freeze({
  global: 0,
  subject: 1,
  subject_grade: 2,
  course_run: 3,
  lesson: 4,
  task: 5
} as const);

export const globalMemoryScope = Object.freeze({
  kind: "global" as const,
  subject: null,
  gradeLevel: null,
  courseRunRef: null,
  lessonRef: null,
  taskRef: null,
  skillIds: Object.freeze([]) as readonly string[],
  fingerprint:
    "9236aceb0f398f41960671056c4c44d8de8de8169ba34dddd251fc885cad8a2b"
});

export type MemoryScopeKind = z.infer<typeof MemoryScopeKindSchema>;
export type MemoryScopeDefinition = z.infer<
  typeof MemoryScopeDefinitionSchema
>;
export type MemoryScope = z.infer<typeof MemoryScopeSchema>;
export type MemoryScopeQuery = z.infer<typeof MemoryScopeQuerySchema>;
