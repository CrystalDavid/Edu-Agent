import {
  ArtifactService,
  InMemoryArtifactRepository
} from "../modules/artifact-collaboration/index.js";
import {
  CapabilityService,
  FakeTool,
  InMemoryCapabilityRepository,
  MockModelProvider
} from "../modules/capability-integration/index.js";
import {
  GovernanceService,
  InMemoryGovernanceRepository
} from "../modules/identity-governance-audit/index.js";
import {
  InMemoryRuntimeRepository,
  RuntimeService
} from "../modules/agent-runtime-context/index.js";
import {
  InMemoryWorkRepository,
  WalkingSkeletonService
} from "../modules/work-assistant-durable-execution/index.js";
import {
  randomIdGenerator,
  systemClock,
  type Clock,
  type IdGenerator
} from "../platform/system.js";

export interface Gate1AContainerOptions {
  clock?: Clock;
  ids?: IdGenerator;
}

export function createGate1AContainer(
  options: Gate1AContainerOptions = {}
) {
  const clock = options.clock ?? systemClock;
  const ids = options.ids ?? randomIdGenerator;
  const governanceRepository = new InMemoryGovernanceRepository();
  const workRepository = new InMemoryWorkRepository();
  const runtimeRepository = new InMemoryRuntimeRepository();
  const capabilityRepository = new InMemoryCapabilityRepository();
  const artifactRepository = new InMemoryArtifactRepository();

  const governance = new GovernanceService(
    governanceRepository,
    clock,
    ids
  );
  const capability = new CapabilityService(
    new MockModelProvider(),
    new FakeTool(),
    capabilityRepository,
    ids
  );
  const runtime = new RuntimeService(
    {
      async execute(input) {
        const response = await capability.execute(input);
        return {
          model: response.result.model,
          tool: response.result.tool,
          receipts: response.receipts
        };
      }
    },
    runtimeRepository,
    ids
  );
  const artifacts = new ArtifactService(artifactRepository, ids);
  const walkingSkeleton = new WalkingSkeletonService(
    governance,
    runtime,
    artifacts,
    workRepository,
    clock,
    ids
  );

  return {
    services: {
      governance,
      capability,
      runtime,
      artifacts,
      walkingSkeleton
    },
    repositories: {
      governance: governanceRepository,
      work: workRepository,
      runtime: runtimeRepository,
      capability: capabilityRepository,
      artifact: artifactRepository
    }
  };
}

export type Gate1AContainer = ReturnType<typeof createGate1AContainer>;
