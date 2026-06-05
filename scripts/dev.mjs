#!/usr/bin/env node
/**
 * 跨平台开发启动脚本
 *
 * 串联：PostgreSQL/Redis (Docker) → iii engine → 7 workers → Tauri desktop
 *
 * 用法:
 *   pnpm dev               # 启动所有
 *   node scripts/dev.mjs --services   # 仅基础设施 + engine
 *   node scripts/dev.mjs --workers    # 仅 workers
 *   node scripts/dev.mjs --desktop    # 仅 Tauri desktop
 *   node scripts/dev.mjs --help       # 帮助
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { platform } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");

const isWindows = platform() === "win32";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 颜色
const C = {
	reset: "\x1b[0m",
	bright: "\x1b[1m",
	green: "\x1b[32m",
	yellow: "\x1b[33m",
	blue: "\x1b[34m",
	red: "\x1b[31m",
	dim: "\x1b[2m",
};
const log = (color, tag, msg) =>
	console.log(`${color}[${tag}]${C.reset} ${msg}`);
const info = (m) => log(C.blue, "INFO", m);
const ok = (m) => log(C.green, "OK", m);
const warn = (m) => log(C.yellow, "WARN", m);
const err = (m) => log(C.red, "ERROR", m);

// 进程表
const procs = [];
function addProc(name, proc) {
	procs.push({ name, proc });
}

function spawnProcess(name, command, args, opts = {}) {
	const proc = spawn(command, args, {
		cwd: opts.cwd || rootDir,
		stdio: ["ignore", "pipe", "pipe"],
		shell: isWindows,
		detached: !isWindows,
		...opts.spawnOptions,
	});
	addProc(name, proc);

	if (opts.color) {
		proc.stdout.on("data", (d) => process.stdout.write(`[${name}] ${d}`));
		proc.stderr.on("data", (d) => process.stderr.write(`[${name}] ${d}`));
	} else {
		proc.stdout.on("data", (d) => process.stdout.write(d));
		proc.stderr.on("data", (d) => process.stderr.write(d));
	}

	proc.on("error", (e) => err(`${name} 启动失败: ${e.message}`));
	return proc;
}

function commandExists(cmd) {
	return new Promise((res) => {
		const p = spawn(isWindows ? "where" : "which", [cmd], { shell: true });
		p.on("close", (code) => res(code === 0));
	});
}

// ============================================
// 阶段 1: 基础设施（Docker）
// ============================================
async function startInfra() {
	info("检查 PostgreSQL / Redis...");
	const hasDocker = await commandExists("docker");
	if (!hasDocker) {
		warn("Docker 不可用，请确保 PostgreSQL (5432) 和 Redis (6379) 已手动启动");
		return false;
	}
	const composeFile = resolve(rootDir, "docker/docker-compose.yml");
	if (!existsSync(composeFile)) {
		warn("docker/docker-compose.yml 不存在，跳过 Docker 启动");
		return false;
	}
	spawnProcess(
		"docker",
		"docker",
		[
			"compose",
			"-f",
			"docker/docker-compose.yml",
			"up",
			"-d",
			"postgres",
			"redis",
		],
		{
			color: true,
		},
	);
	ok("Docker 服务已启动");
	return true;
}

// ============================================
// 阶段 2: iii 引擎
// ============================================
async function startEngine() {
	const hasIii = await commandExists("iii");
	info(`启动 iii 引擎 (${hasIii ? "global" : "npx"})...`);

	if (hasIii) {
		spawnProcess(
			"engine",
			"iii",
			["--config", "./config.yaml"],
			{ color: true },
		);
	} else {
		spawnProcess(
			"engine",
			"npx",
			["iii", "--config", "./config.yaml"],
			{ color: true },
		);
	}

	// 等待 engine 启动
	await sleep(3000);
	ok("iii 引擎启动完成 (ws://localhost:49134 / http://localhost:3111)");
}

// ============================================
// 阶段 3: 7 个 Worker
// ============================================
const WORKERS = [
	"upload",
	"document",
	"docgen",
	"pi-user",
	"pi-internal",
];

async function startWorkers() {
	info("启动 7 个 workers...");
	for (const name of WORKERS) {
		const dir = resolve(rootDir, `workers/${name}`);
		const pkg = resolve(dir, "package.json");
		if (!existsSync(pkg)) {
			warn(`Worker ${name} 缺少 package.json，跳过`);
			continue;
		}
		spawnProcess(name, "pnpm", ["--filter", `@legalai/${name}-worker`, "dev"], {
			color: true,
		});
		await sleep(800);
	}
	ok("7 个 worker 已全部启动");
}

// ============================================
// 阶段 4: 桌面端（Tauri）
// ============================================
async function startDesktop() {
	info("启动 Tauri 桌面端...");
	spawnProcess(
		"desktop",
		"pnpm",
		["--filter", "legalai-desktop", "tauri", "dev"],
		{ color: true },
	);
}

// ============================================
// 清理
// ============================================
function cleanup() {
	info("正在停止所有进程...");
	for (const { name, proc } of procs) {
		try {
			proc.kill("SIGTERM");
			info(`已停止 ${name}`);
		} catch {}
	}
	process.exit(0);
}
process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);

// ============================================
// 主函数
// ============================================
async function main() {
	const args = process.argv.slice(2);
	const mode = args[0] || "--all";

	console.log(`\n${C.bright}╔═══════════════════════════════════════╗`);
	console.log("║   Legal AI MVP - 开发环境启动          ║");
	console.log(`╚═══════════════════════════════════════╝${C.reset}\n`);

	if (mode === "--help" || mode === "-h") {
		console.log(`
用法: pnpm dev [选项]

选项:
  --all          启动所有（默认）
  --services     基础设施 + iii engine
  --workers      7 个 worker
  --desktop      Tauri 桌面端
  --help, -h     显示帮助

示例:
  pnpm dev                 # 全部启动
  pnpm dev --services      # 仅 engine
  pnpm dev --workers       # 仅 workers
		`);
		return;
	}

	const startInfraFlag = mode === "--all";
	const startEngineFlag = mode === "--all" || mode === "--services";
	const startWorkersFlag = mode === "--all" || mode === "--workers";
	const startDesktopFlag = mode === "--all" || mode === "--desktop";

	if (startInfraFlag) await startInfra();
	if (startEngineFlag) await startEngine();
	if (startWorkersFlag) await startWorkers();
	if (startDesktopFlag) await startDesktop();

	console.log(`\n${C.bright}${C.green}✓ 全部启动完成${C.reset}\n`);
	console.log(
		`${C.dim}iii engine:    ws://localhost:49134 / http://localhost:3111${C.reset}`,
	);
	console.log(`${C.dim}worker API:    /api/... (HTTP)${C.reset}`);
	console.log(`${C.dim}desktop:       Tauri window${C.reset}`);
	console.log("\n按 Ctrl+C 停止所有服务\n");
}

main().catch((e) => {
	err(`启动失败: ${e.message}`);
	cleanup();
});
