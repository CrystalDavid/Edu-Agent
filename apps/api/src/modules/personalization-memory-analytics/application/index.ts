export interface PersonalizationCandidateSink {
  acceptObservationCandidate(observation: unknown): Promise<void>;
}

export * from "./memory-candidate-service.js";
