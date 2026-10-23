// 极简 .env 加载器（零依赖）：供各 Next.js 应用 next.config.mjs 调用
// 加载 monorepo 根目录 .env.local，实现 env 集中管理；
// Next.js 启动时已先加载应用本地 env（apps/*/.env.local），
// 此处用「不覆盖已有变量」策略保证应用本地 env 优先于根 env
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)));

/**
 * 加载根目录 env 文件到 process.env（不覆盖已有变量）
 * @param {string} filename env 文件名，默认 .env.local
 */
export function loadRootEnv(filename = '.env.local') {
  const envPath = path.join(rootDir, filename);
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}
