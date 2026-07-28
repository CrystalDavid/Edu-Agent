# PostgreSQL migration ownership

| Schema | Owning module | Migration directory |
|---|---|---|
| `governance` | Identity, Governance & Audit | `apps/api/src/modules/identity-governance-audit/infrastructure/migrations` |
| `work` | Work, Assistant & Durable Execution | `apps/api/src/modules/work-assistant-durable-execution/infrastructure/migrations` |
| `runtime` | Agent Runtime & Context | `apps/api/src/modules/agent-runtime-context/infrastructure/migrations` |
| `capability` | Capability & Integration | `apps/api/src/modules/capability-integration/infrastructure/migrations` |
| `artifact` | Artifact & Collaboration | `apps/api/src/modules/artifact-collaboration/infrastructure/migrations` |
| `education` | Education Domain Kernel | `apps/api/src/modules/education-domain/infrastructure/migrations` |
| `personalization` | Personalization, Memory & Learning Analytics | `apps/api/src/modules/personalization-memory-analytics/infrastructure/migrations` |

Gate 1B maps these Schemas to non-login owner roles:

| Schema | Owner role |
|---|---|
| `governance` | `edu_owner_governance` |
| `work` | `edu_owner_work` |
| `runtime` | `edu_owner_runtime` |
| `capability` | `edu_owner_capability` |
| `artifact` | `edu_owner_artifact` |
| `education` | `edu_owner_education` |
| `personalization` | `edu_owner_personalization` |

`edu_migrator` can assume only these migration-owner roles.
`edu_app`, `edu_runtime` and `edu_worker` are non-superuser login roles.

Rules:

1. A module migration may create or alter only its owning Schema.
2. Cross-Schema foreign keys and direct writes are forbidden.
3. Cross-module changes use the owning module application service.
4. `infra/postgres/roles` owns database roles only; it does not own business tables.
5. A single-Schema prefix fallback requires a new ADR after the CloudBase Spike.
6. PostgreSQL adapters write only their owning Schema; the composition
   transaction coordinator may share a `PoolClient` across adapters.
7. `edu_runtime` cannot write Governance, Education or Personalization.
8. `edu_worker` receives only Outbox claim/acknowledgement and consumer-effect
   privileges; it cannot write Task, Artifact or education facts.
