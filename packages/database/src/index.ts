/**
 * @legalai/database - Postgres 池 + Migration runner
 *
 * 设计：
 *   - 严格依赖 @legalai/config（无默认连接串）
 *   - 单例 Pool（同一进程复用）
 *   - Migration runner：读 .sql 文件，按文件名顺序执行
 *   - 提供 query / withTransaction 工具
 */

import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import pg from "pg";
import { applyLLMPreset, loadConfig, type Config } from "@legalai/config";
import { WorkerError, createLogger } from "@legalai/core";

const { Pool, types } = pg;

// 关键：让 pg 把 INT8 (bigint) 返回 number 而非 string
types.setTypeParser(20, (v) => (v === null ? null : Number(v)));
// TIMESTAMP / DATE 返回 string（不解析）
types.setTypeParser(1114, (v) => v as string);
types.setTypeParser(1182, (v) => v as string);
// JSON/JSONB
types.setTypeParser(114, (v) => v as string);
types.setTypeParser(3802, (v) => v as string);

const logger = createLogger("database");

/* ---------- Pool 管理 ---------- */

let pool: pg.Pool | null = null;
let migrationPool: pg.Pool | null = null;

export interface DbOptions {
	/** 显式传入配置；缺省从 env 读 */
	config?: Config;
}

export function getPool(opts: DbOptions = {}): pg.Pool {
	if (pool) return pool;
	const cfg = applyLLMPreset(opts.config ?? loadConfig());
	pool = new Pool({
		connectionString: cfg.database.url,
		max: cfg.database.poolMax,
		idleTimeoutMillis: 30_000,
		connectionTimeoutMillis: 5_000,
	});
	pool.on("error", (err) =>
		logger.error("Unexpected pool error", { err: String(err) }),
	);
	return pool;
}

export async function closePool(): Promise<void> {
	if (pool) {
		await pool.end();
		pool = null;
	}
	if (migrationPool) {
		await migrationPool.end();
		migrationPool = null;
	}
}

/* ---------- Query 工具 ---------- */

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
	text: string,
	params: unknown[] = [],
	opts: DbOptions = {},
): Promise<pg.QueryResult<T>> {
	return getPool(opts).query<T>(text, params as unknown[]);
}

export async function queryOne<T extends pg.QueryResultRow = pg.QueryResultRow>(
	text: string,
	params: unknown[] = [],
	opts: DbOptions = {},
): Promise<T | null> {
	const res = await query<T>(text, params, opts);
	return res.rows[0] ?? null;
}

export async function withTransaction<T>(
	fn: (client: pg.PoolClient) => Promise<T>,
	opts: DbOptions = {},
): Promise<T> {
	const client = await getPool(opts).connect();
	try {
		await client.query("BEGIN");
		const result = await fn(client);
		await client.query("COMMIT");
		return result;
	} catch (err) {
		await client.query("ROLLBACK").catch(() => undefined);
		throw err;
	} finally {
		client.release();
	}
}

/* ---------- Migration Runner ---------- */

const MIGRATION_TABLE = "_migrations";

export interface MigrationFile {
	filename: string;
	sql: string;
}

export interface MigrationRecord {
	filename: string;
	applied_at: Date;
}

/** 读取 migrations 目录，返回按文件名排序的 .sql 文件 */
export async function loadMigrations(dir: string): Promise<MigrationFile[]> {
	const absDir = resolve(dir);
	const entries = await readdir(absDir);
	const sqlFiles = entries.filter((f) => f.endsWith(".sql")).sort();
	return Promise.all(
		sqlFiles.map(async (filename) => ({
			filename,
			sql: await readFile(join(absDir, filename), "utf-8"),
		})),
	);
}

async function ensureMigrationTable(opts: DbOptions = {}): Promise<void> {
	await query(
		`CREATE TABLE IF NOT EXISTS ${MIGRATION_TABLE} (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
		[],
		opts,
	);
}

async function getAppliedMigrations(
	opts: DbOptions = {},
): Promise<Set<string>> {
	const res = await query<MigrationRecord>(
		`SELECT filename, applied_at FROM ${MIGRATION_TABLE} ORDER BY filename`,
		[],
		opts,
	);
	return new Set(res.rows.map((r) => r.filename));
}

/** 跑未应用的 migrations，幂等 */
export async function runMigrations(
	dir: string,
	opts: DbOptions = {},
): Promise<{ applied: string[]; skipped: string[] }> {
	const files = await loadMigrations(dir);
	await ensureMigrationTable(opts);
	const applied = await getAppliedMigrations(opts);
	const newlyApplied: string[] = [];

	for (const file of files) {
		if (applied.has(file.filename)) continue;
		logger.info(`Applying migration: ${file.filename}`);
		try {
			await withTransaction(async (client) => {
				await client.query(file.sql);
				await client.query(
					`INSERT INTO ${MIGRATION_TABLE} (filename) VALUES ($1)`,
					[file.filename],
				);
			}, opts);
			newlyApplied.push(file.filename);
		} catch (err) {
			throw new WorkerError(
				"database",
				`Migration ${file.filename} failed: ${(err as Error).message}`,
				err,
			);
		}
	}

	return {
		applied: newlyApplied,
		skipped: files.map((f) => f.filename).filter((f) => applied.has(f)),
	};
}

/* ---------- 健康检查 ---------- */

export async function ping(
	opts: DbOptions = {},
): Promise<{ ok: boolean; latencyMs: number; detail?: string }> {
	const start = Date.now();
	try {
		await query("SELECT 1", [], opts);
		return { ok: true, latencyMs: Date.now() - start };
	} catch (err) {
		return {
			ok: false,
			latencyMs: Date.now() - start,
			detail: (err as Error).message,
		};
	}
}
