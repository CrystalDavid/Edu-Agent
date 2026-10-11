import type { MemoryContextExplanation } from "@edu-agent/contracts";

export function shouldShowMemoryUseDisclosure(
  memoryContext: MemoryContextExplanation | null | undefined
): memoryContext is MemoryContextExplanation {
  return memoryContext !== null && memoryContext !== undefined;
}
