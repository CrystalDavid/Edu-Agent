ALTER TABLE education.course_run
  ADD COLUMN IF NOT EXISTS class_name text NOT NULL
    DEFAULT '未命名班级';

CREATE INDEX IF NOT EXISTS course_run_tenant_idx
  ON education.course_run (tenant_ref, academic_term);

CREATE INDEX IF NOT EXISTS evidence_observation_objective_idx
  ON education.evidence_observation (objective_ref, observed_at DESC);
