import { describe, expect, it } from "vitest";

import { readConversationRetentionSettings } from "../../apps/api/src/modules/work-assistant-durable-execution/infrastructure/conversation-retention-config.js";

describe("conversation retention configuration", () => {
  it("uses a provisional 30-day default and supports an explicit positive duration", () => {
    expect(readConversationRetentionSettings({})).toEqual({
      durationMilliseconds: 30 * 24 * 60 * 60 * 1000,
      policyVersion: "conversation-retention@1"
    });
    expect(
      readConversationRetentionSettings({
        CONVERSATION_RETENTION_DAYS: "7"
      }).durationMilliseconds
    ).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("rejects zero, negative, or fractional retention windows", () => {
    for (const value of ["0", "-1", "1.5"]) {
      expect(() =>
        readConversationRetentionSettings({
          CONVERSATION_RETENTION_DAYS: value
        })
      ).toThrow();
    }
  });
});
