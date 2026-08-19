import { z } from "zod";

const millisecondsPerDay = 24 * 60 * 60 * 1000;

const ConversationRetentionEnvironmentSchema = z.object({
  CONVERSATION_RETENTION_DAYS: z.coerce
    .number()
    .int()
    .positive()
    .default(30)
});

export interface ConversationRetentionSettings {
  durationMilliseconds: number;
  policyVersion: "conversation-retention@1";
}

export function readConversationRetentionSettings(
  environment: NodeJS.ProcessEnv = process.env
): ConversationRetentionSettings {
  const parsed = ConversationRetentionEnvironmentSchema.parse(environment);
  return {
    durationMilliseconds:
      parsed.CONVERSATION_RETENTION_DAYS * millisecondsPerDay,
    policyVersion: "conversation-retention@1"
  };
}
