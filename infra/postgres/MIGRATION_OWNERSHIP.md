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

Rules:

1. A module migration may create or alter only its owning Schema.
2. Cross-Schema foreign keys and direct writes are forbidden.
3. Cross-module changes use the owning module application service.
4. `infra/postgres/roles` owns database roles only; it does not own business tables.
5. A single-Schema prefix fallback requires a new ADR after the CloudBase Spike.
