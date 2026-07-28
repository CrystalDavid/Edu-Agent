import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: [
    "./apps/api/src/modules/*/infrastructure/schema.ts"
  ],
  out: "./infra/postgres/drizzle",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      "postgresql://edu_agent:change-me@localhost:5432/edu_agent"
  },
  strict: true,
  verbose: true
});
