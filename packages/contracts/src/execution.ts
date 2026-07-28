import { z } from "zod";

export const RunBindingSchema = z.discriminatedUnion("runKind", [
  z.object({
    runKind: z.literal("QueryRun"),
    runRef: z.string().min(1)
  }),
  z.object({
    runKind: z.literal("TaskRun"),
    runRef: z.string().min(1)
  })
]);

export const ModelRequestSchema = z.object({
  requestRef: z.string().min(1),
  purpose: z.string().min(1),
  promptKey: z.string().min(1),
  input: z.record(z.string(), z.unknown())
});

export const ModelResponseSchema = z.object({
  provider: z.literal("mock"),
  modelProfile: z.literal("deterministic-fixture"),
  output: z.object({
    title: z.string().min(1),
    body: z.string().min(1)
  }),
  usage: z.object({
    inputUnits: z.number().int().nonnegative(),
    outputUnits: z.number().int().nonnegative()
  })
});

export const ToolRequestSchema = z.object({
  requestRef: z.string().min(1),
  toolName: z.literal("fake.echo"),
  input: z.object({
    text: z.string().min(1)
  })
});

export const ToolResponseSchema = z.object({
  toolName: z.literal("fake.echo"),
  output: z.object({
    echoed: z.string()
  })
});

export type RunBinding = z.infer<typeof RunBindingSchema>;
export type ModelRequest = z.infer<typeof ModelRequestSchema>;
export type ModelResponse = z.infer<typeof ModelResponseSchema>;
export type ToolRequest = z.infer<typeof ToolRequestSchema>;
export type ToolResponse = z.infer<typeof ToolResponseSchema>;
