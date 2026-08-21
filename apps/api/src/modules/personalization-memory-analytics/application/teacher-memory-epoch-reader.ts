export interface TeacherMemoryEpochReader {
  getTeacherMemoryEpoch(input: {
    readonly tenantRef: string;
    readonly teacherRef: string;
  }): Promise<number>;
}
