export interface PersonalizationCandidateSink {
  acceptObservationCandidate(observation: unknown): Promise<void>;
}
