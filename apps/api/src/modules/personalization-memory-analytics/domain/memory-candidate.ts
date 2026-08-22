import { createHash } from "node:crypto";

export type MemoryCandidateType = "preference" | "episodic";
export type MemoryCandidateStatus =
  | "draft"
  | "confirmed"
  | "rejected"
  | "expired";

export const memoryClassOwnership = Object.freeze({
  working: "runtime",
  task: "work",
  preference_candidate: "personalization",
  episodic_candidate: "personalization"
} as const);

export interface MemoryOwner {
  readonly tenantRef: string;
  readonly teacherRef: string;
}

export interface MemorySourceReference {
  readonly sourceRef: string;
  readonly sourceType:
    | "teacher_request"
    | "teacher_action"
    | "task_run"
    | "agent_run"
    | "lesson_reflection";
  readonly version: string;
  readonly contentHash: string;
  readonly provenance: string;
}

export interface MemoryCandidateContent {
  readonly summary: string;
  readonly preferenceKey?: string;
  readonly preferenceValue?: string;
}

export interface MemoryCandidate {
  readonly candidateRef: string;
  readonly owner: MemoryOwner;
  readonly type: MemoryCandidateType;
  readonly content: MemoryCandidateContent;
  readonly sources: readonly MemorySourceReference[];
  readonly confidence: number;
  readonly proposedBy: "teacher" | "agent";
  readonly createdByRef: string;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly status: MemoryCandidateStatus;
  readonly confirmedAt: string | null;
  readonly rejectedAt: string | null;
  readonly expiredAt: string | null;
  readonly version: number;
  readonly contentHash: string;
}

export interface TeacherPreference {
  readonly preferenceRef: string;
  readonly owner: MemoryOwner;
  readonly preferenceKey: string;
  readonly preferenceValue: string;
  readonly sourceCandidateRef: string;
  readonly sourceCandidateHash: string;
  readonly status: "active" | "revoked";
  readonly version: number;
  readonly confirmedByRef: string;
  readonly confirmedAt: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly revokedAt: string | null;
  readonly contentHash: string;
}

export class MemoryCandidateDomainError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "MemoryCandidateDomainError";
  }
}

export function createMemoryCandidate(input: {
  readonly candidateRef: string;
  readonly owner: MemoryOwner;
  readonly type: MemoryCandidateType;
  readonly content: MemoryCandidateContent;
  readonly sources: readonly MemorySourceReference[];
  readonly confidence: number;
  readonly proposedBy: "teacher" | "agent";
  readonly createdByRef: string;
  readonly createdAt: string;
  readonly expiresAt: string;
}): MemoryCandidate {
  assertRef(input.candidateRef, "candidateRef");
  assertOwner(input.owner);
  assertContent(input.type, input.content);
  assertSources(input.sources);
  assertConfidence(input.confidence);
  assertRef(input.createdByRef, "createdByRef");
  assertTimeOrder(input.createdAt, input.expiresAt);
  return sealCandidate({
    ...input,
    content: {
      summary: normalizeText(input.content.summary),
      ...(input.content.preferenceKey
        ? { preferenceKey: normalizeText(input.content.preferenceKey) }
        : {}),
      ...(input.content.preferenceValue
        ? { preferenceValue: normalizeText(input.content.preferenceValue) }
        : {})
    },
    sources: uniqueSources(input.sources),
    status: "draft",
    confirmedAt: null,
    rejectedAt: null,
    expiredAt: null,
    version: 1
  });
}

export function confirmMemoryCandidate(input: {
  readonly candidate: MemoryCandidate;
  readonly actorRef: string;
  readonly expectedVersion: number;
  readonly confirmedAt: string;
  readonly preferenceRef?: string;
}): {
  readonly candidate: MemoryCandidate;
  readonly preference: TeacherPreference | null;
} {
  assertCandidateIntegrity(input.candidate);
  assertOwnerAction(input.candidate, input.actorRef);
  assertVersion(input.candidate.version, input.expectedVersion);
  assertDraftAndNotExpired(input.candidate, input.confirmedAt);
  const candidate = reviseCandidate(input.candidate, {
    status: "confirmed",
    confirmedAt: input.confirmedAt
  });
  if (candidate.type !== "preference") {
    return deepFreeze({ candidate, preference: null });
  }
  if (!input.preferenceRef) {
    throw new MemoryCandidateDomainError(
      "PREFERENCE_REF_REQUIRED",
      "A confirmed preference candidate requires a TeacherPreference ref."
    );
  }
  const preference = createTeacherPreference({
    preferenceRef: input.preferenceRef,
    candidate,
    confirmedByRef: input.actorRef,
    confirmedAt: input.confirmedAt
  });
  return deepFreeze({ candidate, preference });
}

export function rejectMemoryCandidate(input: {
  readonly candidate: MemoryCandidate;
  readonly actorRef: string;
  readonly expectedVersion: number;
  readonly rejectedAt: string;
}): MemoryCandidate {
  assertCandidateIntegrity(input.candidate);
  assertOwnerAction(input.candidate, input.actorRef);
  assertVersion(input.candidate.version, input.expectedVersion);
  assertDraftAndNotExpired(input.candidate, input.rejectedAt);
  return reviseCandidate(input.candidate, {
    status: "rejected",
    rejectedAt: input.rejectedAt
  });
}

export function expireMemoryCandidate(input: {
  readonly candidate: MemoryCandidate;
  readonly at: string;
}): MemoryCandidate {
  assertCandidateIntegrity(input.candidate);
  if (input.candidate.status !== "draft") {
    throw invalidStatus(input.candidate, "expire");
  }
  if (Date.parse(input.at) < Date.parse(input.candidate.expiresAt)) {
    throw new MemoryCandidateDomainError(
      "MEMORY_CANDIDATE_NOT_EXPIRED",
      "MemoryCandidate cannot expire before expiresAt."
    );
  }
  return reviseCandidate(input.candidate, {
    status: "expired",
    expiredAt: input.at
  });
}

export function revokeTeacherPreference(input: {
  readonly preference: TeacherPreference;
  readonly actorRef: string;
  readonly expectedVersion: number;
  readonly revokedAt: string;
}): TeacherPreference {
  assertTeacherPreferenceIntegrity(input.preference);
  if (input.preference.owner.teacherRef !== input.actorRef) {
    throw new MemoryCandidateDomainError(
      "MEMORY_OWNER_REQUIRED",
      "Only the owning teacher can revoke a TeacherPreference."
    );
  }
  assertVersion(input.preference.version, input.expectedVersion);
  if (input.preference.status !== "active") {
    throw new MemoryCandidateDomainError(
      "TEACHER_PREFERENCE_NOT_ACTIVE",
      "Only an active TeacherPreference can be revoked."
    );
  }
  const { contentHash: _hash, ...content } = input.preference;
  return sealPreference({
    ...content,
    status: "revoked",
    revokedAt: input.revokedAt,
    updatedAt: input.revokedAt,
    version: input.preference.version + 1
  });
}

export function updateTeacherPreference(input: {
  readonly preference: TeacherPreference;
  readonly actorRef: string;
  readonly expectedVersion: number;
  readonly preferenceValue: string;
  readonly updatedAt: string;
}): TeacherPreference {
  assertTeacherPreferenceIntegrity(input.preference);
  if (input.preference.owner.teacherRef !== input.actorRef) {
    throw new MemoryCandidateDomainError(
      "MEMORY_OWNER_REQUIRED",
      "Only the owning teacher can update a TeacherPreference."
    );
  }
  assertVersion(input.preference.version, input.expectedVersion);
  if (input.preference.status !== "active") {
    throw new MemoryCandidateDomainError(
      "TEACHER_PREFERENCE_NOT_ACTIVE",
      "Only an active TeacherPreference can be updated."
    );
  }
  const preferenceValue = normalizeText(input.preferenceValue);
  if (!preferenceValue) {
    throw new MemoryCandidateDomainError(
      "PREFERENCE_CONTENT_REQUIRED",
      "TeacherPreference value is required."
    );
  }
  if (!Number.isFinite(Date.parse(input.updatedAt))) {
    throw new MemoryCandidateDomainError(
      "MEMORY_TIME_INVALID",
      "TeacherPreference updatedAt must be a valid timestamp."
    );
  }
  const { contentHash: _hash, ...content } = input.preference;
  return sealPreference({
    ...content,
    preferenceValue,
    updatedAt: input.updatedAt,
    version: input.preference.version + 1
  });
}

export function assertCandidateIntegrity(candidate: MemoryCandidate): void {
  const { contentHash, ...content } = candidate;
  if (hashValue(content) !== contentHash) {
    throw new MemoryCandidateDomainError(
      "MEMORY_CANDIDATE_HASH_MISMATCH",
      "MemoryCandidate content hash does not match."
    );
  }
}

export function assertTeacherPreferenceIntegrity(
  preference: TeacherPreference
): void {
  const { contentHash, ...content } = preference;
  if (hashValue(content) !== contentHash) {
    throw new MemoryCandidateDomainError(
      "TEACHER_PREFERENCE_HASH_MISMATCH",
      "TeacherPreference content hash does not match."
    );
  }
}

function createTeacherPreference(input: {
  readonly preferenceRef: string;
  readonly candidate: MemoryCandidate;
  readonly confirmedByRef: string;
  readonly confirmedAt: string;
}): TeacherPreference {
  assertRef(input.preferenceRef, "preferenceRef");
  if (input.candidate.type !== "preference") {
    throw new MemoryCandidateDomainError(
      "PREFERENCE_CANDIDATE_REQUIRED",
      "TeacherPreference requires a confirmed preference candidate."
    );
  }
  const preferenceKey = input.candidate.content.preferenceKey;
  const preferenceValue = input.candidate.content.preferenceValue;
  if (!preferenceKey || !preferenceValue) {
    throw new MemoryCandidateDomainError(
      "PREFERENCE_CONTENT_REQUIRED",
      "TeacherPreference requires a key and value."
    );
  }
  return sealPreference({
    preferenceRef: input.preferenceRef,
    owner: input.candidate.owner,
    preferenceKey,
    preferenceValue,
    sourceCandidateRef: input.candidate.candidateRef,
    sourceCandidateHash: input.candidate.contentHash,
    status: "active",
    version: 1,
    confirmedByRef: input.confirmedByRef,
    confirmedAt: input.confirmedAt,
    createdAt: input.confirmedAt,
    updatedAt: input.confirmedAt,
    revokedAt: null
  });
}

function reviseCandidate(
  candidate: MemoryCandidate,
  patch: Partial<Omit<MemoryCandidate, "contentHash" | "version">>
): MemoryCandidate {
  const { contentHash: _hash, ...content } = candidate;
  return sealCandidate({
    ...content,
    ...patch,
    version: candidate.version + 1
  });
}

function sealCandidate(
  candidate: Omit<MemoryCandidate, "contentHash">
): MemoryCandidate {
  return deepFreeze({
    ...candidate,
    contentHash: hashValue(candidate)
  });
}

function sealPreference(
  preference: Omit<TeacherPreference, "contentHash">
): TeacherPreference {
  return deepFreeze({
    ...preference,
    contentHash: hashValue(preference)
  });
}

function assertContent(
  type: MemoryCandidateType,
  content: MemoryCandidateContent
): void {
  if (!normalizeText(content.summary)) {
    throw new MemoryCandidateDomainError(
      "MEMORY_CONTENT_REQUIRED",
      "MemoryCandidate summary is required."
    );
  }
  if (
    type === "preference" &&
    (!normalizeText(content.preferenceKey ?? "") ||
      !normalizeText(content.preferenceValue ?? ""))
  ) {
    throw new MemoryCandidateDomainError(
      "PREFERENCE_CONTENT_REQUIRED",
      "Preference Candidate requires a key and value."
    );
  }
  if (
    type === "episodic" &&
    (content.preferenceKey !== undefined ||
      content.preferenceValue !== undefined)
  ) {
    throw new MemoryCandidateDomainError(
      "EPISODIC_PREFERENCE_FIELDS_FORBIDDEN",
      "Episodic Candidate cannot contain preference fields."
    );
  }
}

function assertSources(sources: readonly MemorySourceReference[]): void {
  if (sources.length === 0) {
    throw new MemoryCandidateDomainError(
      "MEMORY_SOURCE_REQUIRED",
      "MemoryCandidate requires at least one source reference."
    );
  }
  for (const source of sources) {
    assertRef(source.sourceRef, "sourceRef");
    assertRef(source.version, "source.version");
    assertRef(source.contentHash, "source.contentHash");
    assertRef(source.provenance, "source.provenance");
  }
}

function uniqueSources(
  sources: readonly MemorySourceReference[]
): readonly MemorySourceReference[] {
  const byKey = new Map<string, MemorySourceReference>();
  for (const source of sources) {
    const key = `${source.sourceType}:${source.sourceRef}:${source.version}`;
    byKey.set(key, deepFreeze({ ...source }));
  }
  return [...byKey.values()].sort((left, right) =>
    left.sourceRef.localeCompare(right.sourceRef)
  );
}

function assertOwner(owner: MemoryOwner): void {
  assertRef(owner.tenantRef, "owner.tenantRef");
  assertRef(owner.teacherRef, "owner.teacherRef");
  if (/learner|student/iu.test(owner.teacherRef)) {
    throw new MemoryCandidateDomainError(
      "LEARNER_MEMORY_FORBIDDEN",
      "Phase 6 MemoryCandidate cannot use a learner owner."
    );
  }
}

function assertOwnerAction(
  candidate: MemoryCandidate,
  actorRef: string
): void {
  if (candidate.owner.teacherRef !== actorRef) {
    throw new MemoryCandidateDomainError(
      "MEMORY_OWNER_REQUIRED",
      "Only the owning teacher can confirm or reject a MemoryCandidate."
    );
  }
}

function assertDraftAndNotExpired(
  candidate: MemoryCandidate,
  at: string
): void {
  if (candidate.status !== "draft") {
    throw invalidStatus(candidate, "review");
  }
  if (Date.parse(at) >= Date.parse(candidate.expiresAt)) {
    throw new MemoryCandidateDomainError(
      "MEMORY_CANDIDATE_EXPIRED",
      "Expired MemoryCandidate cannot be confirmed or rejected."
    );
  }
}

function invalidStatus(
  candidate: MemoryCandidate,
  action: string
): MemoryCandidateDomainError {
  return new MemoryCandidateDomainError(
    "MEMORY_CANDIDATE_INVALID_STATUS",
    `Cannot ${action} MemoryCandidate ${candidate.candidateRef} while ${candidate.status}.`
  );
}

function assertVersion(actual: number, expected: number): void {
  if (actual !== expected) {
    throw new MemoryCandidateDomainError(
      "MEMORY_VERSION_CONFLICT",
      `Expected version ${expected}, received ${actual}.`
    );
  }
}

function assertConfidence(confidence: number): void {
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new MemoryCandidateDomainError(
      "MEMORY_CONFIDENCE_INVALID",
      "MemoryCandidate confidence must be between 0 and 1."
    );
  }
}

function assertTimeOrder(createdAt: string, expiresAt: string): void {
  if (
    !Number.isFinite(Date.parse(createdAt)) ||
    !Number.isFinite(Date.parse(expiresAt)) ||
    Date.parse(expiresAt) <= Date.parse(createdAt)
  ) {
    throw new MemoryCandidateDomainError(
      "MEMORY_EXPIRY_INVALID",
      "MemoryCandidate expiresAt must be after createdAt."
    );
  }
}

function assertRef(value: string, field: string): void {
  if (!value.trim()) {
    throw new MemoryCandidateDomainError(
      "MEMORY_REFERENCE_REQUIRED",
      `${field} is required.`
    );
  }
}

function normalizeText(value: string): string {
  return value.normalize("NFC").replace(/\s+/gu, " ").trim();
}

function hashValue(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex");
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .filter((key) => value[key] !== undefined)
        .sort()
        .map((key) => [key, canonicalize(value[key])])
    );
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepFreeze<TValue>(value: TValue): TValue {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child);
  }
  return value;
}
