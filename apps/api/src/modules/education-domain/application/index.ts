export interface EducationReadProjectionPort {
  readProjection(resourceRef: string): Promise<unknown>;
}
