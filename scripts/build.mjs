#!/usr/bin/env node
/**
 * 统一构建脚本
 *
 * 顺序：packages/* → workers/* → apps/desktop
 * 不构建 Tauri（`tauri build` 由 release 流程单独执行）
 *
 * 用法:
 *   pnpm build                    # 构建所有
 *   node scripts/build.mjs --packages    # 仅 packages
 *   node scripts/build.mjs --workers     # 仅 workers
 *   node scripts/build.mjs --desktop     # 仅 desktop (vite build)
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");
const isWindows = process.platform === "win32";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const C = {
	reset: "\x1b[0m",
	bright: "\x1b[1m",
	green: "\x1b[32m",
	yellow: "\x1b[33m",
	blue: "\x1b[34m",
	red: "\x1b[31m",
};
const log = (color, tag, msg) =>
	console.log(`${color}[${tag}]${C.reset} ${msg}`);
const info = (m) => log(C.blue, "INFO", m);
const ok = (m) => log(C.green, "OK", m);
const warn = (m) => log(C.yellow, "WARN", m);
const err = (m) => log(C.red, "ERROR", m);

function run(cmd, args, opts = {}) {
	return new Promise((res, rej) => {
		const proc = spawn(cmd, args, {
			cwd: opts.cwd || rootDir,
			stdio: "inherit",
			shell: isWindows,
		});
		proc.on("close", (code) => {
			if (code === 0) res();
			else rej(new Error(`${cmd} ${args.join(" ")} exited with ${code}`));
		});
	});
}

const WORKERS = [
	"upload",
	"document",
	"knowledge",
	"analysis",
	"docgen",
	"pi-user",
	"pi-internal",
];
const PACKAGES = ["core", "config", "database", "document", "llm", "search"];

async function buildPackages() {
	info(`构建 ${PACKAGES.length} 个 packages...`);
	for (const name of PACKAGES) {
		const dir = resolve(rootDir, `packages/${name}`);
		if (!existsSync(resolve(dir, "package.json"))) {
			warn(`packages/${name} 不存在，跳过`);
			continue;
		}
		ok(`构建 @legalai/${name}...`);
		await run("pnpm", ["--filter", `@legalai/${name}`, "build"], { cwd: dir });
	}
	ok("所有 packages 构建完成");
}

async function buildWorkers() {
	info(`构建 ${WORKERS.length} 个 workers...`);
	for (const name of WORKERS) {
		const dir = resolve(rootDir, `workers/${name}`);
		if (!existsSync(resolve(dir, "package.json"))) {
			warn(`workers/${name} 不存在，跳过`);
			continue;
		}
		ok(`构建 @legalai/${name}-worker...`);
		await run("pnpm", ["--filter", `@legalai/${name}-worker`, "build"], {
			cwd: dir,
		});
	}
	ok("所有 workers 构建完成");
}

async function buildDesktop() {
	info("构建 desktop (vite build)...");
	const dir = resolve(rootDir, "apps/desktop");
	if (!existsSync(resolve(dir, "package.json"))) {
		warn("apps/desktop 不存在，跳过");
		return;
	}
	await run("pnpm", ["--filter", "legalai-desktop", "build"], { cwd: dir });
	ok("desktop 构建完成 (output: apps/desktop/dist/)");
}

async function main() {
	const args = process.argv.slice(2);
	const mode = args[0] || "--all";

	console.log(`\n${C.bright}╔═══════════════════════════════════════╗`);
	console.log("║   Legal AI MVP - 生产构建              ║");
	console.log(`╚═══════════════════════════════════════╝${C.reset}\n`);

	const t0 = Date.now();
	try {
		if (mode === "--packages") {
			await buildPackages();
		} else if (mode === "--workers") {
			await buildWorkers();
		} else if (mode === "--desktop") {
			await buildDesktop();
			// 顺序：packages → workers → desktop
			await buildPackages();
			await buildWorkers();
			await buildDesktop();
		}
		const dt = ((Date.now() - t0) / 1000).toFixed(1);
		console.log(`\n${C.bright}${C.green}✓ 构建完成 (${dt}s)${C.reset}\n`);
	} catch (e) {
		err(`构建失败: ${e.message}`);
		process.exit(1);
	}
}

main();
