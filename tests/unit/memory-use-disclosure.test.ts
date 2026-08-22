import { describe, expect, it } from "vitest";

import { shouldShowMemoryUseDisclosure } from "../../apps/web/src/components/memory/memory-use-disclosure-visibility.js";

describe("MemoryUseDisclosure", () => {
  it("stays hidden only when the authorized API has no memory context", () => {
    expect(shouldShowMemoryUseDisclosure(undefined)).toBe(false);
    expect(shouldShowMemoryUseDisclosure(null)).toBe(false);
  });

  it("shows an authorized historical context without consulting a collection flag", () => {
    expect(shouldShowMemoryUseDisclosure({
      packRef: "memory-context-pack:history",
      packContentHash: "a".repeat(64),
      manifestVersion: 1,
      policyVersion: "memory-context-pack-policy@1",
      skillRef: "lesson-preparation@5",
      skillVersion: "5",
      currentTurn: null,
      workingMemory: [],
      durablePreferences: [],
      excluded: [],
      outcomeStatus: null
    })).toBe(true);
  });
});
