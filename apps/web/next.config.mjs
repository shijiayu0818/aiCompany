// 加载 monorepo 根目录 .env.local（env 集中管理，应用本地 env 优先）
import { loadRootEnv } from '../../env-loader.mjs';
loadRootEnv();

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@ai/shared', '@ai/agent-core'],
  experimental: {
    // ESM 包交由 Node 运行时 require，不进 webpack 打包
    serverComponentsExternalPackages: [
      'chromadb',
      '@langchain/openai',
      '@langchain/langgraph',
      '@langchain/core',
    ],
  },
  webpack: (config) => {
    // chromadb 的 ESM 构建包含 https://unpkg.com 动态 import，
    // webpack 无法静态分析（UnhandledSchemeError），显式排除
    config.externals.push('chromadb');
    return config;
  },
};

export default nextConfig;
