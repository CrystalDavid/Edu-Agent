import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const roleSql = readFileSync(
  resolve(root, "infra/postgres/roles/0001_runtime_role.sql"),
  "utf8"
);

describe("Runtime database role", () => {
  it("can write runtime tables", () => {
    expect(roleSql).toMatch(
      /GRANT\s+SELECT,\s*INSERT,\s*UPDATE\s+ON\s+ALL\s+TABLES\s+IN\s+SCHEMA\s+runtime/i
    );
  });

  it.each(["governance", "education", "personalization"])(
    "cannot write %s formal tables",
    (schema) => {
      expect(roleSql).toMatch(
        new RegExp(
          `REVOKE\\s+INSERT,\\s*UPDATE,\\s*DELETE,\\s*TRUNCATE[\\s\\S]*?SCHEMA\\s+${schema}[\\s\\S]*?FROM\\s+edu_agent_runtime`,
          "i"
        )
      );
      expect(roleSql).not.toMatch(
        new RegExp(
          `GRANT\\s+(?:INSERT|UPDATE|DELETE|TRUNCATE)[\\s\\S]{0,100}SCHEMA\\s+${schema}`,
          "i"
        )
      );
    }
  );
});
