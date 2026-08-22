ALTER TABLE work.calendar_event
  DROP CONSTRAINT IF EXISTS calendar_event_event_type_check;

ALTER TABLE work.calendar_event
  ADD CONSTRAINT calendar_event_event_type_check
  CHECK (
    event_type IN (
      'class', 'meeting', 'grading', 'lesson_preparation',
      'duty', 'school_affair', 'custom_reminder',
      'todo_time_block'
    )
  );
