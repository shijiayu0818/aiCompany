// 评测报告生成：单文件 HTML（零外部依赖，浏览器直接打开）
// 包含：指标汇总 + 门禁状态 + 企业评分（权重标注）+ 逐 case 明细
import type { EnterpriseScore, EvalReport } from '../types';

/** HTML 转义（用例内容含引号/尖括号时防破坏结构） */
function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

/** 布尔决策展示：✓ 激活 / — 未激活 */
function boolMark(active: boolean): string {
  return active
    ? '<span class="mark on">✓</span>'
    : '<span class="mark off">—</span>';
}

function gradeBadge(grade: string): string {
  return `<span class="grade grade-${grade}">${esc(grade)}</span>`;
}

function summaryCard(label: string, value: string, sub?: string): string {
  return `<div class="card"><div class="card-label">${esc(label)}</div><div class="card-value">${esc(value)}</div>${sub ? `<div class="card-sub">${esc(sub)}</div>` : ''}</div>`;
}

function caseRow(result: EvalReport['cases'][number]): string {
  const d = result.decision;
  const agents = `${boolMark(d.needsCompanyInfo)} 企业${boolMark(d.needsGraph)} 图谱${boolMark(d.needsBusiness)} 风险`;
  const status = result.error
    ? '<span class="status err">运行出错</span>'
    : result.decisionCorrect
      ? '<span class="status ok">通过</span>'
      : '<span class="status bad">决策不符</span>';
  return `<tr>
    <td><div class="case-id">${esc(result.caseId)}</div><div class="case-name">${esc(result.caseName)}</div></td>
    <td class="query">${esc(result.query)}</td>
    <td class="agents">${agents}</td>
    <td>${status}</td>
    <td>${pct(result.nodeHitRate)}</td>
    <td>${pct(result.edgeHitRate)}</td>
    <td>${pct(result.riskMatchRate)}</td>
    <td>${result.durationMs}ms</td>
    <td class="reason" title="${esc(d.reasoning)}">${esc(d.reasoning)}</td>
    ${result.error ? `<td class="err-text">${esc(result.error)}</td>` : '<td></td>'}
  </tr>`;
}

function scoreRow(s: EnterpriseScore): string {
  return `<tr>
    <td>${esc(s.name)}</td>
    <td>${gradeBadge(s.grade)}</td>
    <td><strong>${s.score}</strong> / 100</td>
    <td>${s.riskScore} <span class="dim">(红${s.riskCount.red}×3 + 黄${s.riskCount.yellow}×1，封顶70)</span></td>
    <td>${s.relationScore} <span class="dim">(${s.relationDegree}条×2，封顶30)</span></td>
  </tr>`;
}

/** 渲染完整 HTML 报告 */
export function renderReport(report: EvalReport, scores: EnterpriseScore[]): string {
  const s = report.summary;
  const gateText = s.gatesPassed ? '门禁通过' : '门禁未通过';
  const gateClass = s.gatesPassed ? 'ok' : 'bad';

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Agent 评测报告</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif; background: #f5f6f8; color: #1f2328; padding: 32px 24px; }
  .container { max-width: 1200px; margin: 0 auto; }
  h1 { font-size: 22px; margin-bottom: 4px; }
  .meta { color: #6a737d; font-size: 13px; margin-bottom: 24px; }
  .badge { display: inline-block; padding: 2px 10px; border-radius: 10px; font-size: 12px; vertical-align: middle; }
  .badge-llm { background: #ddf4ff; color: #0969da; }
  .badge-skip-llm { background: #fff8c5; color: #9a6700; }
  .gate { display: inline-block; padding: 4px 14px; border-radius: 6px; font-weight: 600; font-size: 14px; margin-left: 12px; }
  .gate.ok { background: #dafbe1; color: #1a7f37; }
  .gate.bad { background: #ffebe9; color: #cf222e; }
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin-bottom: 28px; }
  .card { background: #fff; border: 1px solid #d0d7de; border-radius: 8px; padding: 14px 16px; }
  .card-label { font-size: 12px; color: #6a737d; margin-bottom: 6px; }
  .card-value { font-size: 24px; font-weight: 700; }
  .card-sub { font-size: 11px; color: #6a737d; margin-top: 4px; }
  h2 { font-size: 16px; margin: 28px 0 12px; padding-bottom: 8px; border-bottom: 1px solid #d0d7de; }
  table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #d0d7de; border-radius: 8px; overflow: hidden; font-size: 13px; }
  th { background: #f6f8fa; text-align: left; padding: 10px 12px; font-weight: 600; white-space: nowrap; }
  td { padding: 10px 12px; border-top: 1px solid #eaeef2; vertical-align: top; }
  .mark { font-weight: 700; }
  .mark.on { color: #1a7f37; }
  .mark.off { color: #c0c7cf; }
  .status { font-weight: 600; white-space: nowrap; }
  .status.ok { color: #1a7f37; }
  .status.bad { color: #cf222e; }
  .status.err { color: #9a6700; }
  .case-id { font-family: Consolas, monospace; font-size: 12px; color: #0969da; }
  .case-name { font-weight: 600; }
  .query { max-width: 220px; word-break: break-all; }
  .reason { max-width: 200px; font-size: 12px; color: #6a737d; word-break: break-all; }
  .err-text { color: #cf222e; max-width: 180px; word-break: break-all; font-size: 12px; }
  .agents { white-space: nowrap; }
  .grade { display: inline-block; width: 22px; height: 22px; line-height: 22px; text-align: center; border-radius: 50%; color: #fff; font-weight: 700; font-size: 12px; }
  .grade-A { background: #1a7f37; }
  .grade-B { background: #9a6700; }
  .grade-C { background: #bc4c00; }
  .grade-D { background: #cf222e; }
  .dim { color: #6a737d; font-size: 12px; }
  .note { font-size: 12px; color: #6a737d; margin-top: 8px; }
  .threshold { color: #0969da; }
</style>
</head>
<body>
<div class="container">
  <h1>企业智能助手 Agent 评测报告 <span class="badge badge-${s.mode}">${s.mode === 'llm' ? '真实 LLM' : 'skip-llm 注入'}</span><span class="gate ${gateClass}">${gateText}</span></h1>
  <div class="meta">生成时间：${esc(report.generatedAt)} ｜ 用例总数：${s.totalCases} ｜ 总耗时：${s.durationMs}ms</div>

  <div class="cards">
    ${summaryCard('决策准确率', pct(s.decisionAccuracy), `通过 ${s.passedCases}/${s.totalCases}（阈值 ${(s.thresholds.decisionAccuracy * 100).toFixed(0)}%）`)}
    ${summaryCard('节点命中率', pct(s.avgNodeHitRate), `阈值 ${(s.thresholds.nodeHitRate * 100).toFixed(0)}%`)}
    ${summaryCard('边命中率', pct(s.avgEdgeHitRate))}
    ${summaryCard('风险匹配率', pct(s.avgRiskMatchRate))}
  </div>

  <h2>企业风险评分</h2>
  <table>
    <thead><tr><th>企业</th><th>等级</th><th>综合分</th><th>风险分项（权重 70%）</th><th>图谱关联分项（权重 30%）</th></tr></thead>
    <tbody>${scores.map(scoreRow).join('\n')}</tbody>
  </table>
  <p class="note">评分规则：综合分 = 风险分项（红 3/条、黄 1/条，封顶 70）+ 图谱关联度（每条关联边 2 分，封顶 30）。等级：A 0-24 低风险 / B 25-49 关注 / C 50-74 较高风险 / D 75-100 高风险。</p>

  <h2>用例明细（${s.totalCases} 条）</h2>
  <table>
    <thead><tr><th>用例</th><th>查询</th><th>决策（企业/图谱/风险）</th><th>结果</th><th>节点命中</th><th>边命中</th><th>风险匹配</th><th>耗时</th><th>决策理由</th><th>错误</th></tr></thead>
    <tbody>${report.cases.map(caseRow).join('\n')}</tbody>
  </table>
  <p class="note">门禁规则：决策准确率 ≥ <span class="threshold">${(s.thresholds.decisionAccuracy * 100).toFixed(0)}%</span> 且 平均节点命中率 ≥ <span class="threshold">${(s.thresholds.nodeHitRate * 100).toFixed(0)}%</span>。企业评分基于全部用例图谱合并视图。</p>
</div>
</body>
</html>`;
}
