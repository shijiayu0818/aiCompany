'use client';

// 企业整体查询报告：企业信息 / 关联企业 / 风险等级 / 企业需求 / 网络舆情 / 财务情况
// 展示在图谱下方，数据由 graph-builder 汇总三个 Agent 输出

import type {
  BusinessNeed,
  EnterpriseReport,
  FinancialSnapshot,
  PublicOpinionItem,
  RiskItem,
} from '@ai/shared';

interface EnterpriseReportPanelProps {
  report: EnterpriseReport | null;
}

const GRADE_LABELS: Record<string, string> = {
  A: 'A · 低风险',
  B: 'B · 关注',
  C: 'C · 较高风险',
  D: 'D · 高风险',
};

const PRIORITY_LABELS: Record<string, string> = {
  high: '高优先级',
  medium: '中优先级',
  low: '低优先级',
};

const SENTIMENT_LABELS: Record<string, string> = {
  positive: '正面',
  neutral: '中性',
  negative: '负面',
};

const RISK_LEVEL_LABELS: Record<string, string> = {
  red: '红色风险',
  yellow: '黄色预警',
  green: '正常',
};

/** ISO 时间转为可读文本（避免本地化差异导致 SSR/CSR 不一致） */
function formatTime(value: string): string {
  return value.replace('T', ' ').slice(0, 19);
}

export function EnterpriseReportPanel({ report }: EnterpriseReportPanelProps) {
  if (!report) return null;

  const {
    enterprise,
    changes,
    flags,
    relatedEnterprises,
    riskAssessment,
    risks,
    needs,
    opinions,
    financials,
    generatedAt,
  } = report;

  return (
    <section className="report-panel" aria-label="企业整体查询结果">
      <header className="report-header">
        <div>
          <h2 className="report-title">{enterprise.name}</h2>
          <p className="report-subtitle">
            企业整体查询结果 · 生成于 {formatTime(generatedAt)}
          </p>
        </div>
        <span
          className={`report-grade report-grade-${riskAssessment.grade.toLowerCase()}`}
          aria-label={`风险等级 ${GRADE_LABELS[riskAssessment.grade]}`}
        >
          {GRADE_LABELS[riskAssessment.grade]}
        </span>
      </header>

      <div className="report-sections">
        {/* 1. 企业信息 + 变更预警 */}
        <article className="report-card">
          <h3 className="report-card-title">企业信息</h3>
          <dl className="report-info-grid">
            <InfoItem label="法定代表人" value={enterprise.legalPerson} />
            <InfoItem label="统一社会信用代码" value={enterprise.creditCode} />
            <InfoItem label="注册资本" value={enterprise.registeredCapital} />
            <InfoItem label="成立日期" value={enterprise.establishDate} />
            <InfoItem label="经营状态" value={enterprise.status} />
            <InfoItem label="所属行业" value={enterprise.industry} />
            <InfoItem label="所在地区" value={enterprise.region} />
          </dl>
          {enterprise.description && (
            <p className="report-desc">{enterprise.description}</p>
          )}

          <div className="report-sub-block">
            <h4 className="report-block-title">变更预警</h4>
            {flags.length > 0 ? (
              <div className="report-flags">
                {flags.map((flag) => (
                  <span
                    key={flag.code}
                    className={`report-flag report-flag-${flag.level}`}
                    title={flag.detail}
                  >
                    {flag.label}
                    <em>{flag.detail}</em>
                  </span>
                ))}
              </div>
            ) : (
              <p className="report-empty">近 12 个月未触发高频变更预警</p>
            )}
          </div>

          {changes.length > 0 && (
            <div className="report-sub-block">
              <h4 className="report-block-title">近 12 个月变更记录</h4>
              <div className="report-table-wrap">
                <table className="report-table">
                  <thead>
                    <tr>
                      <th>变更类型</th>
                      <th>变更日期</th>
                      <th>变更前</th>
                      <th>变更后</th>
                    </tr>
                  </thead>
                  <tbody>
                    {changes.map((change) => (
                      <tr key={change.id}>
                        <td>{change.type}</td>
                        <td>{change.date}</td>
                        <td>{change.before ?? '—'}</td>
                        <td>{change.after ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </article>

        {/* 2. 关联企业 */}
        <article className="report-card">
          <h3 className="report-card-title">
            关联企业
            <span className="report-count">{relatedEnterprises.length} 家</span>
          </h3>
          {relatedEnterprises.length > 0 ? (
            <div className="report-table-wrap">
              <table className="report-table">
                <thead>
                  <tr>
                    <th>企业名称</th>
                    <th>关联关系</th>
                    <th>持股 / 职务</th>
                    <th>行业</th>
                    <th>地区</th>
                  </tr>
                </thead>
                <tbody>
                  {relatedEnterprises.map((related) => (
                    <tr key={related.id}>
                      <td>{related.name}</td>
                      <td>
                        <span className="report-tag">{related.relation}</span>
                      </td>
                      <td>{related.label ?? '—'}</td>
                      <td>{related.industry ?? '—'}</td>
                      <td>{related.region ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="report-empty">暂未发现关联企业</p>
          )}
        </article>

        {/* 3. 风险等级 */}
        <article className="report-card">
          <h3 className="report-card-title">风险等级</h3>
          <div className={`report-risk-summary report-risk-${riskAssessment.level}`}>
            <span className="report-risk-score">{riskAssessment.score}</span>
            <div>
              <p className="report-risk-grade">
                {GRADE_LABELS[riskAssessment.grade]}
                <span className="report-risk-index">风险指数 / 100</span>
              </p>
              <p className="report-risk-text">{riskAssessment.summary}</p>
            </div>
          </div>
          <div className="report-risk-counts">
            <span className="report-risk-count report-risk-count-red">
              红色风险 {riskAssessment.redCount}
            </span>
            <span className="report-risk-count report-risk-count-yellow">
              黄色预警 {riskAssessment.yellowCount}
            </span>
          </div>
          {risks.length > 0 ? (
            <ul className="report-list">
              {risks.map((risk) => (
                <RiskRow key={risk.id} risk={risk} />
              ))}
            </ul>
          ) : (
            <p className="report-empty">未发现公开风险记录</p>
          )}
        </article>

        {/* 4. 企业需求 */}
        <article className="report-card">
          <h3 className="report-card-title">
            企业需求
            <span className="report-count">{needs.length} 项</span>
          </h3>
          {needs.length > 0 ? (
            <div className="report-need-grid">
              {needs.map((need) => (
                <NeedCard key={need.id} need={need} />
              ))}
            </div>
          ) : (
            <p className="report-empty">暂无公开的企业需求信息</p>
          )}
        </article>

        {/* 5. 企业网络舆情 */}
        <article className="report-card">
          <h3 className="report-card-title">企业网络舆情</h3>
          {opinions.length > 0 ? (
            <ul className="report-list">
              {opinions.map((opinion) => (
                <OpinionRow key={opinion.id} opinion={opinion} />
              ))}
            </ul>
          ) : (
            <p className="report-empty">暂无公开舆情信息</p>
          )}
        </article>

        {/* 6. 财务情况 */}
        <article className="report-card">
          <h3 className="report-card-title">财务情况</h3>
          {financials.length > 0 ? (
            <div className="report-table-wrap">
              <table className="report-table">
                <thead>
                  <tr>
                    <th>年度</th>
                    <th>营业收入</th>
                    <th>净利润</th>
                    <th>总资产</th>
                    <th>总负债</th>
                    <th>资产负债率</th>
                    <th>经营现金流</th>
                  </tr>
                </thead>
                <tbody>
                  {financials.map((financial) => (
                    <FinancialRow key={financial.year} financial={financial} />
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="report-empty">暂无公开财务数据</p>
          )}
        </article>
      </div>
    </section>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="report-info-item">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function RiskRow({ risk }: { risk: RiskItem }) {
  return (
    <li className="report-list-item">
      <span
        className={`report-level-dot report-level-${risk.level}`}
        aria-label={RISK_LEVEL_LABELS[risk.level]}
      />
      <div>
        <p className="report-list-title">
          {risk.type}
          <span className="report-list-date">{risk.date}</span>
        </p>
        <p className="report-list-desc">{risk.detail}</p>
        <p className="report-list-source">来源：{risk.source}</p>
      </div>
    </li>
  );
}

function NeedCard({ need }: { need: BusinessNeed }) {
  return (
    <div className="report-need-card">
      <div className="report-need-head">
        <span className="report-tag">{need.type}</span>
        <span className={`report-priority report-priority-${need.priority}`}>
          {PRIORITY_LABELS[need.priority]}
        </span>
      </div>
      <p className="report-need-title">{need.title}</p>
      <p className="report-need-desc">{need.description}</p>
      {(need.budget || need.deadline) && (
        <p className="report-need-meta">
          {need.budget && <span>预算：{need.budget}</span>}
          {need.deadline && <span>截止：{need.deadline}</span>}
        </p>
      )}
    </div>
  );
}

function OpinionRow({ opinion }: { opinion: PublicOpinionItem }) {
  return (
    <li className="report-list-item">
      <span
        className={`report-sentiment report-sentiment-${opinion.sentiment}`}
      >
        {SENTIMENT_LABELS[opinion.sentiment]}
      </span>
      <div>
        <p className="report-list-title">
          {opinion.title}
          <span className="report-list-date">{opinion.date}</span>
        </p>
        <p className="report-list-desc">{opinion.summary}</p>
        <p className="report-list-source">来源：{opinion.source}</p>
      </div>
    </li>
  );
}

function FinancialRow({ financial }: { financial: FinancialSnapshot }) {
  return (
    <tr>
      <td>{financial.year}</td>
      <td>{financial.revenue}</td>
      <td>{financial.netProfit}</td>
      <td>{financial.totalAssets}</td>
      <td>{financial.totalLiabilities}</td>
      <td>{financial.debtRatio}%</td>
      <td>{financial.cashFlow}</td>
    </tr>
  );
}
