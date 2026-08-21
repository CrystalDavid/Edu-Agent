ALTER TABLE work.conversation_turn
  DROP CONSTRAINT conversation_turn_check;

ALTER TABLE work.conversation_turn
  ADD COLUMN memory_candidate_refs text[] NOT NULL
    DEFAULT ARRAY[]::text[],
  ADD COLUMN teacher_preference_refs text[] NOT NULL
    DEFAULT ARRAY[]::text[];

ALTER TABLE work.conversation_turn
  ADD CONSTRAINT conversation_turn_actor_content_check CHECK (
    (
      actor_kind = 'teacher'
      AND content_kind IN ('teacher_text', 'command')
      AND teacher_text IS NOT NULL
      AND length(btrim(teacher_text)) BETWEEN 1 AND 2000
      AND surface_summary IS NULL
    )
    OR
    (
      actor_kind = 'assistant_surface'
      AND content_kind IN (
        'safe_surface_summary',
        'command',
        'result_link'
      )
      AND teacher_text IS NULL
      AND surface_summary IS NOT NULL
      AND length(btrim(surface_summary)) BETWEEN 1 AND 1000
    )
    OR
    (
      actor_kind = 'system_event'
      AND content_kind IN ('safe_surface_summary', 'result_link')
      AND teacher_text IS NULL
      AND surface_summary IS NOT NULL
      AND length(btrim(surface_summary)) BETWEEN 1 AND 1000
    )
  ),
  ADD CONSTRAINT conversation_turn_memory_result_refs_check CHECK (
    cardinality(memory_candidate_refs) BETWEEN 0 AND 10
    AND cardinality(teacher_preference_refs) BETWEEN 0 AND 10
    AND array_position(memory_candidate_refs, NULL) IS NULL
    AND array_position(teacher_preference_refs, NULL) IS NULL
    AND array_position(memory_candidate_refs, '') IS NULL
    AND array_position(teacher_preference_refs, '') IS NULL
    AND (
      (
        cardinality(memory_candidate_refs) = 0
        AND cardinality(teacher_preference_refs) = 0
      )
      OR content_kind IN ('command', 'result_link')
    )
  );

COMMENT ON COLUMN work.conversation_turn.memory_candidate_refs IS
  'Bounded Personalization refs for command/result recovery; no copied content and no cross-schema foreign key.';

COMMENT ON COLUMN work.conversation_turn.teacher_preference_refs IS
  'Bounded Personalization refs for command/result recovery; no copied content and no cross-schema foreign key.';
