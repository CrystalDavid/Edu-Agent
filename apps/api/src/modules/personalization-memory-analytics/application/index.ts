export interface PersonalizationCandidateSink {
  acceptObservationCandidate(observation: unknown): Promise<void>;
}

export * from "./memory-candidate-service.js";
export * from "./memory-application-recorder.js";
export * from "./personalization-context-provider.js";
export * from "./teacher-preference-revision-reader.js";
export * from "./teacher-preference-scope-authorization.js";
export * from "./explicit-teacher-memory-command-service.js";
