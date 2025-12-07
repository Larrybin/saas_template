/**
 * Connect to PostgreSQL Database (Supabase/Neon/Local PostgreSQL)
 * https://orm.drizzle.team/docs/tutorials/drizzle-with-supabase
 */
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { serverEnv } from "@/env/server";
import * as schema from "./schema";

export type Db = PostgresJsDatabase<typeof schema>;

let db: Db | null = null;

export async function getDb(): Promise<Db> {
	if (db) return db;

	const isProd = process.env.NODE_ENV === "production";

	const maxConnectionsEnv = process.env.DB_MAX_CONNECTIONS;
	const idleTimeoutEnv = process.env.DB_IDLE_TIMEOUT;
	const connectTimeoutEnv = process.env.DB_CONNECT_TIMEOUT;

	const max =
		Number(maxConnectionsEnv) > 0
			? Number(maxConnectionsEnv)
			: isProd
				? 10
				: 5;
	const idleTimeoutSeconds =
		Number(idleTimeoutEnv) > 0 ? Number(idleTimeoutEnv) : 30;
	const connectTimeoutSeconds =
		Number(connectTimeoutEnv) > 0 ? Number(connectTimeoutEnv) : 10;

	const client = postgres(serverEnv.databaseUrl, {
		prepare: false,
		max,
		idle_timeout: idleTimeoutSeconds,
		connect_timeout: connectTimeoutSeconds,
	});

	db = drizzle(client, { schema });
	return db;
}

/**
 * Connect to Neon Database
 * https://orm.drizzle.team/docs/tutorials/drizzle-with-neon
 */
// import { drizzle } from 'drizzle-orm/neon-http';
// const db = drizzle(process.env.DATABASE_URL!);

/**
 * Database connection with Drizzle
 * https://orm.drizzle.team/docs/connect-overview
 *
 * Drizzle <> PostgreSQL
 * https://orm.drizzle.team/docs/get-started-postgresql
 *
 * Get Started with Drizzle and Neon
 * https://orm.drizzle.team/docs/get-started/neon-new
 *
 * Drizzle with Neon Postgres
 * https://orm.drizzle.team/docs/tutorials/drizzle-with-neon
 *
 * Drizzle <> Neon Postgres
 * https://orm.drizzle.team/docs/connect-neon
 *
 * Drizzle with Supabase Database
 * https://orm.drizzle.team/docs/tutorials/drizzle-with-supabase
 */
