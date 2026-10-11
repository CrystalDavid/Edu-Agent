import type {
  ClassroomFeedbackDeliveryPort
} from "../modules/agent-runtime-context/application/classroom-feedback-service.js";
import type { PostgresClassroomReflectionService } from "./postgres-classroom-reflection-service.js";

export class ClassroomFeedbackDeliveryAdapter
  implements ClassroomFeedbackDeliveryPort
{
  constructor(
    private readonly classroom: PostgresClassroomReflectionService
  ) {}

  createDraft(
    input: Parameters<ClassroomFeedbackDeliveryPort["createDraft"]>[0]
  ) {
    return this.classroom.createDelivery({
      tenantRef: input.context.tenantRef,
      actorRef: input.context.actorRef,
      request: {
        ...input.output.deliveryDraft,
        courseRunRef: input.courseRunRef,
        lessonRef: input.context.lessonRef,
        purpose: "lesson-delivery.create",
        idempotencyKey: input.idempotencyKey
      }
    });
  }
}
