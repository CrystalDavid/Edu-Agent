import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");

describe("PR-2A scoped TeacherPreference boundaries", () => {
  it("authorizes business refs through a typed Composition port", () => {
    const port = source(
      "apps/api/src/modules/personalization-memory-analytics/application/teacher-preference-scope-authorization.ts"
    );
    const service = source(
      "apps/api/src/composition/postgres-personalization-service.ts"
    );
    expect(port).toContain("interface TeacherPreferenceScopeAuthorizationPort");
    expect(port).not.toMatch(/:\s*unknown\b/u);
    expect(service).toContain("scopeAuthorization.assertAuthorized");
  });

  it("keeps Personalization from reading Education, Work or Governance SQL", () => {
    const directory = join(
      root,
      "apps/api/src/modules/personalization-memory-analytics"
    );
    for (const path of filesUnder(directory).filter((item) =>
      item.endsWith(".ts")
    )) {
      expect(readFileSync(path, "utf8"), relative(root, path)).not.toMatch(
        /\b(?:FROM|JOIN|INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+(?:education|work|governance|runtime|artifact)\./iu
      );
    }
  });

  it("keeps legacy Skills on the global-only compatibility port", () => {
    const provider = source(
      "apps/api/src/modules/personalization-memory-analytics/application/personalization-context-provider.ts"
    );
    const service = source(
      "apps/api/src/composition/postgres-personalization-service.ts"
    );
    expect(provider).toContain("listConfirmedPreferences");
    expect(provider).toContain("resolveConfirmedPreferences");
    expect(service).toContain('preference.scope.kind === "global"');
    expect(service).toContain("preference.scope.skillIds.length === 0");
  });

  it("adds @6 without overwriting @1-@5 or Pack V1", () => {
    const skills = source("apps/api/src/agent/skills/index.ts");
    const contracts = source("packages/contracts/src/memory-application.ts");
    for (let version = 1; version <= 6; version += 1) {
      expect(skills).toContain(`lessonPreparationSkillV${version}`);
    }
    expect(contracts).toContain("MemoryContextPackManifestV1Schema");
    expect(contracts).toContain("MemoryContextPackManifestV2Schema");
    expect(contracts).toContain("z.discriminatedUnion");
  });

  it("does not add embedding or vector retrieval dependencies", () => {
    const packageFiles = [
      "package.json",
      "apps/api/package.json",
      "packages/contracts/package.json"
    ].map(source).join("\n");
    expect(packageFiles).not.toMatch(
      /(?:pgvector|pinecone|weaviate|qdrant|milvus|chromadb|embedding)/iu
    );
  });

  it("keeps feature-flag fallback server-owned and UI fail-closed", () => {
    const config = source(
      "apps/api/src/modules/personalization-memory-analytics/infrastructure/memory-scoped-preferences-config.ts"
    );
    const model = source(
      "apps/api/src/composition/postgres-model-invocation-service.ts"
    );
    const settings = source(
      "apps/web/src/components/portal/TeacherPreferenceSettings.tsx"
    );
    expect(config).toContain("MEMORY_SCOPED_PREFERENCES_ENABLED");
    expect(config).toContain("? !production");
    expect(model).toContain("this.scopedPreferencesEnabled");
    expect(model).toContain("conversationLessonPreparationSkillRef");
    expect(settings).toContain("state.scopedPreferencesEnabled ?");
  });

  it("leaves the 49 pre-PR-2A migrations byte-for-byte unchanged", () => {
    const migrations = filesUnder(join(root, "apps/api/src/modules"))
      .filter((path) =>
        /[\\/]migrations[\\/].+\.sql$/u.test(path) &&
        !path.endsWith("0004_teacher_preference_scope_and_epoch.sql") &&
        !path.endsWith("0013_explicit_memory_command_turn.sql")
      )
      .sort();
    expect(migrations).toHaveLength(49);
    expect(migrations.map((path) =>
      createHash("sha256").update(readFileSync(path)).digest("hex")
    )).toEqual(prePr2aMigrationHashes);
  });
});

function source(projectPath: string): string {
  return readFileSync(join(root, projectPath), "utf8");
}

function filesUnder(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

const prePr2aMigrationHashes = [
  "8f88e16d0146a6522a0065bdbc03a03f947c0f501f563663cfc936c037c45815",
  "a8cc16fe39081bfbc64bb0f17a0db549c87ad1eeca382761e07cb4a3a7b94c8e",
  "6a277d1b0e4e04551d13f8e1eff740822526c6e2eaaf03f14a1fbcfbaa7f24ca",
  "0a21bc0342dc0062be71ff3ccc9de9bf187ee8d249e7a5a59b501629a7f13615",
  "4ea7a58247aac925157f5941d5b471895f5debd8fd810560dd1399ea7c646a97",
  "bce980e244016932e1cfffe2ac7c45176717caeafcee14482e206eebc43f2833",
  "39168a2ea7c8788dd9af0778802be2d59c80c3f8b0ca78f3b5e97b2f3f201142",
  "e9a9133e9fae1d452e039a139a2d3ee87d251ef1786141aab5e8d4fe244c2da5",
  "bc6b726dae19abd9b3b6447bf7e4fa6a87dcdcaedde1590aebd969f47d2d81aa",
  "344a67f727fcc53f7f14786fddb9adc3a28e179d1eeee3ab65f93ad77b2f54a5",
  "f128ea3438eb321d7f44e560ae4d5e325ae23bc9788d18e90a84d073b80cb146",
  "91462a4fcf881876731ca54d2fb3a1659794145cd19e5cf220287b4ca3a76fa9",
  "edc02067fe327432c52d8ada23b9247ecb29119c444d1677bc2eb5eeb966f0d8",
  "665a4457c9d056f4fc89428cf5b1a378fcb21c60e4ff01c6624b4540228164f4",
  "6276173e96fb0d554ccea0f2cad89a1a0c506b7a8b3232e4ef851c86d4cf8117",
  "2ce2d78668630237a4316f4ec35f641e3fdb0d057514a4786bc5c67c12b6d966",
  "397dfaa0239447247edea268ccdd3e164a763bf1627bd676d79be9c952249260",
  "557ff2f95085c3d261aa61d3f817271d2a33d40b4a04ac03176e782dd8dba5ab",
  "217a0ec5adf2b6dcffdcb8d4ab4276dc4f09a66dc88e0fea1a31ecc7ae0e7eeb",
  "02a0b5b67ecd0b3d915a9cf5e202ec1b92cca7f55cfddb32e2b107db4fe043db",
  "b3c7f012876155f064b41ee2881a98eb2c2d023559bc0ee8651a110fc9287b52",
  "e0f8322acdd27101ea71b9adb305c2b190ea363d58850bb5c36ba88bbb9b1b2e",
  "2ec08aa3b2454271042245d78f25529763fe800ccb7cc7c9d1bd1b4d536356b1",
  "9e41ade4cfb832164d57575d40df7c2661395cda1a04eda2ba33fbcff7297361",
  "8aee30e16bf7235fdf63127fd83483fc72a9d0f6b5346cf048828ff6c4986b96",
  "483557263385d78e3b698a3494af0055d71e36c85830d783bfe2699aabb1f596",
  "df4d8f9c71ea455471e980e8ec21c2d99381fca1eb3ae2e30e7504034e4ef73a",
  "7673a099ddc0f33be050620c8c8fc5ebfe0a7d3f14db8666896ee30c1c6d1b6c",
  "dd40a79ffb7d6dc428650492173e92435fc0f507d863da8ddaea6b0ae919e209",
  "e6ca5c9fc97fd6ce94973db5432cfddb33c25b03c714210a01a0bd8d7739e428",
  "1f0fccbe00f562366fe0b8089feabec798a1060608fa2fa2a026e85f9a340eab",
  "3ca8092680ca5117e3cda5d25ab6de328b6430784f132412834ab6cc5411127f",
  "937c581db4e0de94d323ac7fa40eb226fa0b71697e850c320c2103083cc3314a",
  "3eb4cababa3b3128eb200664d18e2be208bd2c11dcc67a414260fed5c26a7e06",
  "963a8242a3baa87390ef75d8978042da84e0bb1e8573554702e7104470e85f38",
  "39f11654b319853546fbdea80bbf408311dabe8d3159df76ffb44d7ed942a034",
  "b7e7b5f26c052f1453d674de1036af6762966944fa6800e81d6f7da4343efff3",
  "34a070c1b80c6fe8b647a96839d6588ac274bd0b7fd91b65dcf5cb48e44b5c4f",
  "32f6518d27b05c83a0b41ec26548fdc66d50bef04fefaf511b8cbea8fb6620e6",
  "bdcbc566d84c61a00b4dac3b410951e441fabbc52fcd318c7ed19a1ed7c49b19",
  "cae2a8ff1e36e9627b15856fbddcbd2bf5992c3b8e05d3a447e45b3e2c55feab",
  "a8364600cf7828542669a4f2844be7aee5af27ac5d2ecceee85138f620aa76de",
  "a9fcd26ddd7266b2063b2a3b6920c5d6355310a3d23d9e7776450910e82064db",
  "2d8be37babce2353569dcb55d75732186366962320cbe985d8843125c7bce0c7",
  "9460e1f4a65aeac172aada4ad2581654bfdfe8739f867fb80ff2dfb767305a63",
  "c3d72a661b57a1da81742cbe5915063150709d6c2fab6b9c4ba93b5dc447102e",
  "921b14bf3789f1689663dfa7c644288d6c4506dc2d467938d124e8fa8c63c003",
  "50da750fe3de854b8486a3a527558b166030d19bb63a258e5ff51fd720bf6b83",
  "bd08c0ec9c65bf56d84272655712eac074a597797b6fa482d5fb7f07d0dda5d1"
] as const;
