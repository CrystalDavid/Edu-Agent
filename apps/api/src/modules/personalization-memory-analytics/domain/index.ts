/**
 * Gate 1A intentionally contains no Preference, MemoryEntry or Candidate
 * implementation. The module boundary exists so dependency tests can fail
 * closed before Gate 4.
 */
export const personalizationGate = "gate-4" as const;
