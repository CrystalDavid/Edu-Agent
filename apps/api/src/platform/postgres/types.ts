import type {
  Pool,
  PoolClient,
  QueryResult,
  QueryResultRow
} from "pg";

export interface SqlExecutor {
  query<TRow extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[]
  ): Promise<QueryResult<TRow>>;
}

export type PostgresPool = Pool;
export type PostgresClient = PoolClient;

export interface PostgresOutboxRecord {
  outboxRef: string;
  eventName: string;
  aggregateRef: string;
  payload: Record<string, unknown>;
}
