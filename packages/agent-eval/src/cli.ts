// 评测 CLI 入口：pnpm eval [-- --skip-llm] [-- --out=<path>.html]
// - 默认模式（llm）：真调 LLM，评 Supervisor 决策准确率（需 Agent 服务在线 + LLM 配置）
// - --skip-llm：按用例注入决策，零密钥确定性执行（可进 CI）
// - 门禁不达标（决策准确率 / 节点命中率低于阈值）时退出码 1
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { mockRisks } from '@ai/shared';
import { loadDataset } from './dataset/dataset';
import { runDataset } from './runner/runner';
import { DEFAULT_THRESHOLDS, summarize } from './metrics/metrics';
import { mergeGraphs, scoreEnterprises } from './scorer/scorer';
import { renderReport } from './report/report';
import type { EvalReport } from './types';

/**
 * 加载 cwd 的 .env.local（策略与根 env-loader.mjs 一致：不覆盖已有变量）
 * llm 模式需要 LLM 配置；skip-llm 模式零密钥不依赖此文件
 */
function loadCwdEnv(): void {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (!existsSync(envPath)) return;
  for (const rawLine of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
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
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

async function main(): Promise<void> {
  loadCwdEnv();

  const args = process.argv.slice(2);
  const skipLLM = args.includes('--skip-llm');
  const outArg = args.find((a) => a.startsWith('--out='));
  const mode = skipLLM ? 'skip-llm' : 'llm';

  console.log(`[eval] 执行模式: ${mode}`);
  if (!skipLLM) {
    console.log('[eval] 前置条件: 三个 Agent 服务在线 (3001-3003) + LLM 配置（根目录 .env.local）');
  }

  const dataset = loadDataset();
  console.log(`[eval] 用例总数: ${dataset.cases.length}`);

  const startedAt = Date.now();
  const results = await runDataset(dataset.cases, mode);
  const durationMs = Date.now() - startedAt;

  const summary = summarize(results, mode, DEFAULT_THRESHOLDS, durationMs);

  // 企业评分：合并全部用例图谱 + mock 全量风险（评分对象是图谱覆盖到的企业）
  const merged = mergeGraphs(results.map((r) => r.graph));
  const scores = scoreEnterprises(merged, mockRisks);

  const report: EvalReport = {
    summary,
    cases: results,
    generatedAt: new Date().toISOString(),
  };
  const html = renderReport(report, scores);

  const outPath = outArg
    ? path.resolve(outArg.slice('--out='.length))
    : path.resolve(process.cwd(), 'eval-report.html');
  writeFileSync(outPath, html, 'utf8');

  // 控制台摘要
  console.log('\n===== 评测结果 =====');
  console.log(`决策准确率: ${pct(summary.decisionAccuracy)}（通过 ${summary.passedCases}/${summary.totalCases}，阈值 ${pct(summary.thresholds.decisionAccuracy)}）`);
  console.log(`节点命中率: ${pct(summary.avgNodeHitRate)}（阈值 ${pct(summary.thresholds.nodeHitRate)}）`);
  console.log(`边命中率:   ${pct(summary.avgEdgeHitRate)}`);
  console.log(`风险匹配率: ${pct(summary.avgRiskMatchRate)}`);
  console.log(`总耗时:     ${summary.durationMs}ms`);
  console.log(`门禁状态:   ${summary.gatesPassed ? '通过' : '未通过'}`);
  console.log(`报告文件:   ${outPath}`);

  if (!summary.gatesPassed) {
    process.exitCode = 1;
  }
}

main().catch((err: unknown) => {
  console.error('[eval] 执行失败:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
