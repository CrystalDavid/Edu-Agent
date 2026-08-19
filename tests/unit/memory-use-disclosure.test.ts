import { describe, expect, it } from "vitest";

import { shouldShowMemoryUseDisclosure } from "../../apps/web/src/components/memory/memory-use-disclosure-visibility.js";

describe("MemoryUseDisclosure", () => {
  it("stays hidden when the feature-gated API omits memory context", () => {
    expect(shouldShowMemoryUseDisclosure(undefined)).toBe(false);
    expect(shouldShowMemoryUseDisclosure(null)).toBe(false);
  });
});
