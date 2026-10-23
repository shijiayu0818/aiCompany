// 加载 monorepo 根目录 .env.local（env 集中管理，应用本地 env 优先）
import { loadRootEnv } from '../../env-loader.mjs';
loadRootEnv();

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@ai/shared'],
  experimental: {
    serverComponentsExternalPackages: ['chromadb'],
  },
  webpack: (config) => {
    // chromadb 的 ESM 构建包含对 https://unpkg.com 的动态 import，
    // webpack 无法静态分析（UnhandledSchemeError），显式排除出打包，
    // 由 Node 运行时直接 require（chromadb 需声明为本应用依赖以保证可解析）
    config.externals.push('chromadb');
    return config;
  },
};

export default nextConfig;
