ALTER TABLE work.conversation_turn
  DROP CONSTRAINT conversation_turn_check;

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
  );
