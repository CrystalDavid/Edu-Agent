import type { MemoryScope } from "@edu-agent/contracts";

export interface TeacherPreferenceScopeAuthorizationPort {
  assertAuthorized(input: {
    readonly tenantRef: string;
    readonly teacherRef: string;
    readonly scope: MemoryScope;
    readonly allowedCourseRunRefs: readonly string[];
    readonly purpose: string;
  }): Promise<void>;
}
