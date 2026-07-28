export const moduleMigrations = [
  {
    owner: "governance",
    relativePath:
      "apps/api/src/modules/identity-governance-audit/infrastructure/migrations/0001_governance.sql"
  },
  {
    owner: "work",
    relativePath:
      "apps/api/src/modules/work-assistant-durable-execution/infrastructure/migrations/0001_work.sql"
  },
  {
    owner: "runtime",
    relativePath:
      "apps/api/src/modules/agent-runtime-context/infrastructure/migrations/0001_runtime.sql"
  },
  {
    owner: "capability",
    relativePath:
      "apps/api/src/modules/capability-integration/infrastructure/migrations/0001_capability.sql"
  },
  {
    owner: "artifact",
    relativePath:
      "apps/api/src/modules/artifact-collaboration/infrastructure/migrations/0001_artifact.sql"
  },
  {
    owner: "education",
    relativePath:
      "apps/api/src/modules/education-domain/infrastructure/migrations/0001_education.sql"
  },
  {
    owner: "personalization",
    relativePath:
      "apps/api/src/modules/personalization-memory-analytics/infrastructure/migrations/0001_personalization.sql"
  }
] as const;
