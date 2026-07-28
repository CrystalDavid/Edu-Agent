import { bootstrapGate1BPostgres } from "./bootstrap.js";
import { readPostgresEnvironment } from "./config.js";

const result = await bootstrapGate1BPostgres(
  readPostgresEnvironment()
);

process.stdout.write(
  `Gate 1B PostgreSQL ready: ${result.schemas.length} schemas, ` +
    `${result.appliedMigrations} new migrations.\n`
);
