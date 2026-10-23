# @ai/agent-eval

企业智能助手评测包：Golden Set 数据集 + 双模式执行器 + 指标门禁 + 企业评分 + 单文件 HTML 报告。

反向依赖约束：本包依赖 `@ai/agent-core` 与 `@ai/shared`，**禁止被其它包依赖**。

## 用法

```powershell
# skip-llm 模式：按用例注入决策，零密钥、确定性（可进 CI）
# 前置：三个 Agent 服务在线（3001-3003），服务内部走 mock 数据
pnpm eval:skip-llm

# 真实 LLM 模式：真调 LLM 评 Supervisor 决策准确率
# 前置：三个 Agent 服务在线 + 根目录 .env.local 含 LLM 配置
pnpm eval

# 指定报告输出路径
pnpm eval -- --out=D:/tmp/report.html
```

门禁不达标（决策准确率 <80% 或节点命中率 <70%）时退出码 1，报告仍会生成（默认 `eval-report.html`）。

## 目录结构

```
src/
  types.ts               # 评测核心类型（EvalCase / CaseResult / EvalSummary / EnterpriseScore）
  dataset/
    golden-set.json      # 手工边界用例（指代消解 / 模糊查询 / 空查询 / 综合查询）
    dataset.ts           # mock 自动生成 5 企业 × 3 类用例 + 加载合并 + 注入决策合成
  runner/runner.ts       # 双模式执行器（llm=完整 LangGraph / skip-llm=注入决策手动编排）
  metrics/metrics.ts     # 决策准确率 / 图谱节点与边命中率 / 风险匹配率 / 门禁汇总
  scorer/scorer.ts       # 企业风险评分（red=3/yellow=1 封顶70 + 关联边×2 封顶30 → A/B/C/D）
  report/report.ts       # 单文件 HTML 报告（零外部依赖）
  cli.ts                 # CLI 入口（pnpm eval）
```

## 关键约定

- **期望标注**：`expectedAgents` 三布尔必须与 Supervisor 决策完全一致；`expectedGraphNodes/Edges` 用 mock 图谱节点/边 id（与 `getRelations` 同算法推导，见 `expectedGraphFor`）；`expectedRisks` 用 mock 风险 id。
- **注入决策**：skip-llm 模式下用例必须有 `injectedDecision`（未标注时 dataset 加载阶段按 expectedAgents 自动合成）；query 需含企业全名（Agent 服务按"企业全名包含于查询文本"解析）。
- **风险匹配**：按 `enterpriseId === refId` 精确匹配，禁止企业名宽匹配。
- **扩展点（未实现）**：LLM-as-Judge 评输出质量、历史趋势对比，后续在 runner/metrics 上叠加。

## 测试

```powershell
pnpm --filter @ai/agent-eval test
```

覆盖 metrics / scorer / runner（fetch stub）/ dataset 四个模块；真实 LLM 模式不在单测范围（属集成验证）。
