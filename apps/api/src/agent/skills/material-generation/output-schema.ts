import { z } from "zod";

import { MaterialContentDraftSchema } from "@edu-agent/contracts";

export const materialGenerationOutputSchemaRef = "material-content-draft@1";

export const MaterialGenerationSkillOutputSchema = z.object({
  schemaVersion: z.literal("material-content-draft@1"),
  drafts: z.array(MaterialContentDraftSchema).min(1).max(5)
});

export type MaterialGenerationSkillOutput = z.infer<
  typeof MaterialGenerationSkillOutputSchema
>;
