#!/usr/bin/env node
/**
 * 跨平台启动脚本 - 启动所有基础设施和 Workers
 * 
 * 用法:
 *   node scripts/start.js              # 启动所有
 *   node scripts/start.js --services   # 仅启动服务（PostgreSQL, Redis, iii）
 *   node scripts/start.js --workers    # 仅启动 Workers
 *   node scripts/start.js --help       # 显示帮助
 */

import { spawn } from 'child_process';
import { platform } from 'os';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');

const isWindows = platform() === 'win32';
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
};

const log = (color, prefix, message) => {
  console.log(`${color}${prefix}${colors.reset} ${message}`);
};

const info = (msg) => log(colors.blue, '[INFO]', msg);
const success = (msg) => log(colors.green, '[OK]', msg);
const warn = (msg) => log(colors.yellow, '[WARN]', msg);
const error = (msg) => log(colors.red, '[ERROR]', msg);

// 检查命令是否存在
function commandExists(cmd) {
  return new Promise((resolve) => {
    const proc = spawn(isWindows ? 'where' : 'which', [cmd], { shell: true });
    proc.on('close', (code) => resolve(code === 0));
  });
}

// 启动子进程
function spawnProcess(name, command, args, options = {}) {
  return new Promise((resolve, reject) => {
    info(`启动 ${name}...`);
    
    const proc = spawn(command, args, {
      cwd: options.cwd || rootDir,
      stdio: options.inherit !== false ? 'inherit' : 'pipe',
      shell: isWindows,
      detached: !isWindows,
      ...options.spawnOptions,
    });

    if (options.inherit === false) {
      proc.stdout.on('data', (data) => {
        process.stdout.write(`[${name}] ${data}`);
      });
      proc.stderr.on('data', (data) => {
        process.stderr.write(`[${name}] ${data}`);
      });
    }

    proc.on('error', (err) => {
      error(`${name} 启动失败: ${err.message}`);
      reject(err);
    });

    proc.on('close', (code) => {
      if (code !== 0 && code !== null) {
        warn(`${name} 退出，代码: ${code}`);
      }
    });

    // 等待服务启动
    setTimeout(() => resolve(proc), 2000);
  });
}

// 检查 PostgreSQL
async function checkPostgres() {
  if (await commandExists('psql')) {
    return true;
  }
  if (await commandExists('docker')) {
    info('使用 Docker 运行 PostgreSQL...');
    return 'docker';
  }
  if (isWindows && await commandExists('pg_ctl')) {
    return 'pg_ctl';
  }
  warn('PostgreSQL 未安装，跳过数据库检查');
  return false;
}

// 检查 Redis
async function checkRedis() {
  if (await commandExists('redis-cli')) {
    return true;
  }
  if (await commandExists('docker')) {
    info('使用 Docker 运行 Redis...');
    return 'docker';
  }
  warn('Redis 未安装，跳过缓存检查');
  return false;
}

// 检查 iii
async function checkIii() {
  if (await commandExists('iii')) {
    return true;
  }
  if (await commandExists('npx')) {
    return 'npx';
  }
  error('iii 未安装，请运行: npm install -g @anthropic/iii');
  return false;
}

// Docker 启动服务
async function startServicesDocker() {
  info('使用 Docker Compose 启动服务...');
  try {
    await spawnProcess('docker-compose', 'docker-compose', ['up', '-d', 'postgres', 'redis'], {
      cwd: rootDir,
    });
    success('Docker 服务已启动');
    return true;
  } catch (err) {
    warn('Docker Compose 启动失败，尝试手动启动...');
    return false;
  }
}

// 启动 iii 引擎
async function startIii() {
  const useNpx = !(await commandExists('iii'));
  
  info(`启动 iii 引擎 (${useNpx ? 'npx' : 'global'})...`);
  
  const proc = spawn(
    useNpx ? 'npx' : 'iii',
    useNpx ? ['iii', 'dev', '--config', 'config/iii-config.yaml'] : ['dev', '--config', 'config/iii-config.yaml'],
    {
      cwd: rootDir,
      stdio: 'inherit',
      shell: isWindows,
    }
  );

  return new Promise((resolve) => {
    proc.on('error', (err) => {
      error(`iii 引擎启动失败: ${err.message}`);
      process.exit(1);
    });
    
    setTimeout(() => {
      success('iii 引擎已启动 (ws://localhost:49134, http://localhost:3111)');
      resolve(proc);
    }, 3000);
  });
}

// 启动 Workers
async function startWorkers() {
  const workers = [
    { name: 'upload', dir: 'workers/upload' },
    { name: 'document', dir: 'workers/document' },
    { name: 'knowledge', dir: 'workers/knowledge' },
    { name: 'analysis', dir: 'workers/analysis' },
    { name: 'docgen', dir: 'workers/docgen' },
  ];

  info('启动 Workers...');
  
  const processes = [];
  for (const worker of workers) {
    const workerDir = resolve(rootDir, worker.dir);
    const pkgPath = resolve(workerDir, 'package.json');
    
    try {
      const { existsSync } = await import('fs');
      if (!existsSync(pkgPath)) {
        warn(`Worker ${worker.name} package.json 不存在，跳过`);
        continue;
      }
    } catch {
      continue;
    }
    
    const proc = spawn(
      isWindows ? 'npm.cmd' : 'npm',
      ['run', 'dev'],
      {
        cwd: workerDir,
        stdio: 'inherit',
        shell: isWindows,
      }
    );
    
    processes.push({ name: worker.name, proc });
    info(`Worker ${worker.name} 已启动`);
    await delay(500);
  }

  success(`已启动 ${processes.length} 个 Workers`);
  return processes;
}

// 主函数
async function main() {
  const args = process.argv.slice(2);
  const mode = args[0];

  console.log(`${colors.bright}\n╔════════════════════════════════════════╗`);
  console.log(`║    Legal AI MVP - 启动脚本           ║`);
  console.log(`╚════════════════════════════════════════╝${colors.reset}\n`);

  if (mode === '--help' || mode === '-h') {
    console.log(`
用法: node scripts/start.js [选项]

选项:
  --services    仅启动基础设施服务（PostgreSQL, Redis, iii）
  --workers     仅启动 Workers
  --all         启动所有（默认）
  --help, -h    显示帮助

示例:
  node scripts/start.js              # 启动所有
  node scripts/start.js --workers    # 仅 Workers
    `);
    return;
  }

  const startAll = !mode || mode === '--all';
  const startServices = startAll || mode === '--services';
  const startWorkersOnly = mode === '--workers';

  // 启动基础设施
  if (startServices) {
    info('检查依赖服务...');
    
    // 检查 Docker
    if (await commandExists('docker') && await commandExists('docker-compose')) {
      await startServicesDocker();
    } else {
      warn('Docker 不可用，请手动启动 PostgreSQL 和 Redis');
    }
    
    // 启动 iii
    await startIii();
  }

  // 启动 Workers
  if (!startServices || startAll) {
    await delay(3000); // 等待 iii 启动
    await startWorkers();
  }

  console.log(`\n${colors.bright}${colors.green}✓ 启动完成！${colors.reset}\n`);
  console.log('iii 引擎: ws://localhost:49134 (WebSocket), http://localhost:3111 (HTTP)');
  console.log('\n按 Ctrl+C 停止所有服务\n');

  // 处理退出
  process.on('SIGINT', () => {
    info('正在停止所有服务...');
    process.exit(0);
  });
}

main().catch((err) => {
  error(`启动失败: ${err.message}`);
  process.exit(1);
});
