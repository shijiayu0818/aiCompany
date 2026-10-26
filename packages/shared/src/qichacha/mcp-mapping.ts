// 企查查 MCP 返回数据 → 项目业务类型映射
// 企查查工具返回中文 key 的 JSON 结构，字段随工具版本可能变化；
// 映射全部做宽松解析（字段缺失/类型不符时跳过），解析失败返回空结果而非抛错
import type {
  ChangeType,
  EntityChange,
  Enterprise,
  FinancialSnapshot,
  PublicOpinionItem,
  RiskItem,
} from '../types';

// MCP 返回的宽松结构（中文 key）
type Loose = Record<string, unknown>;

const COMPANY_SUFFIX_RE =
  /[\u4e00-\u9fa5A-Za-z0-9（）()]+?(?:股份有限公司|有限责任公司|有限公司|集团公司|集团|公司)/g;

/**
 * 从自然语言查询中提取企业名提示词
 * 优先提取含企业后缀的最长子串（如「查询阿里巴巴集团的基本信息」→「阿里巴巴集团」）；
 * 无后缀命中时剥离常见动词前缀并按「的」切分取首段；无法提取时返回原文
 */
export function extractCompanyNameHint(query: string): string {
  const text = query.trim();
  const matches = text.match(COMPANY_SUFFIX_RE);
  if (matches && matches.length > 0) {
    return matches.reduce((a, b) => (b.length > a.length ? b : a));
  }
  const stripped = text.replace(
    /^(?:请|帮我|麻烦)?(?:查询|查一下|查查|查|看看|了解|分析)/,
    '',
  );
  const firstPart = stripped.split('的')[0].trim();
  return firstPart || text;
}

function asLoose(value: unknown): Loose | undefined {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Loose;
  }
  return undefined;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function strArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === 'string')
    : [];
}

/** 企查查经营状态归一到项目 Enterprise.status 枚举 */
function normalizeStatus(raw: string): Enterprise['status'] {
  if (raw === '在业' || raw === '正常') return '存续';
  const allowed: Enterprise['status'][] = [
    '存续', '注销', '吊销', '迁入', '迁出', '停业', '清算',
  ];
  return (allowed.find((s) => s === raw) ?? '存续') as Enterprise['status'];
}

function toEnterprise(brief: Loose): Enterprise | undefined {
  const name = str(brief['企业名称']);
  if (!name) return undefined;
  const creditCode = str(brief['统一社会信用代码']);
  const legalPersonArr = strArray(brief['法定代表人名称']);
  return {
    id: creditCode || name,
    name,
    creditCode,
    legalPerson: legalPersonArr[0] ?? str(brief['法定代表人']),
    registeredCapital: str(brief['注册资本']),
    establishDate: str(brief['成立日期']),
    status: normalizeStatus(str(brief['状态']) || str(brief['登记状态'])),
    industry: str(brief['行业']),
    region: str(brief['所属地区']) || str(brief['地区']),
  };
}

/**
 * get_company_by_query → Enterprise[]
 * 唯一精确匹配时企业信息为对象，多候选时为数组；均无匹配时为空
 */
export function mapCompanyByQuery(raw: unknown): Enterprise[] {
  const data = asLoose(raw);
  if (!data) return [];
  const info = data['企业信息'];
  if (Array.isArray(info)) {
    return info
      .map((item) => asLoose(item))
      .map((item) => (item ? toEnterprise(item) : undefined))
      .filter((e): e is Enterprise => e !== undefined);
  }
  const single = asLoose(info);
  const enterprise = single ? toEnterprise(single) : undefined;
  return enterprise ? [enterprise] : [];
}

/**
 * get_company_registration_info → Enterprise
 * 返回 { 无匹配项 } 时视为未找到
 */
export function mapRegistrationInfo(raw: unknown): Enterprise | undefined {
  const data = asLoose(raw);
  if (!data || '无匹配项' in data) return undefined;
  const enterprise = toEnterprise(data);
  if (!enterprise) return undefined;

  const regionInfo = asLoose(data['地区信息']);
  const regionParts = regionInfo
    ? [regionInfo['省份'], regionInfo['城市'], regionInfo['区域']]
        .map((p) => str(p))
        .filter(Boolean)
    : [];
  const industry = asLoose(data['国标行业']);
  const industryName = industry
    ? [industry['门类'], industry['大类'], industry['中类']]
        .map((p) => str(p))
        .filter(Boolean)
        .pop()
    : '';

  return {
    ...enterprise,
    legalPerson: str(data['法定代表人']) || enterprise.legalPerson,
    registeredCapital: str(data['注册资本']) || enterprise.registeredCapital,
    establishDate: str(data['成立日期']) || enterprise.establishDate,
    status: normalizeStatus(str(data['登记状态']) || str(data['状态'])),
    industry: industryName || enterprise.industry,
    region:
      regionParts.join('') || str(data['所属地区']) || enterprise.region,
    description: str(data['经营范围']) || undefined,
  };
}

/** 企查查「变更项目」文案 → 项目 ChangeType（未命中的计入其他变更，保证高频变更统计真实） */
export function mapChangeType(item: string): ChangeType {
  if (item.includes('法定代表人')) return '法定代表人变更';
  if (item.includes('投资人') || item.includes('股东')) return '股东变更';
  if (item.includes('注册资本')) return '注册资本变更';
  if (item.includes('经营范围')) return '经营范围变更';
  if (item.includes('住所') || item.includes('地址')) return '地址变更';
  if (item.includes('名称')) return '名称变更';
  return '其他变更';
}

/**
 * get_change_records → EntityChange[]
 * 每条含 变更日期 / 变更项目 / 变更前内容[] / 变更后内容[]
 */
export function mapChangeRecords(raw: unknown, enterpriseId: string): EntityChange[] {
  const data = asLoose(raw);
  if (!data || '无匹配项' in data) return [];
  const records = Array.isArray(data['变更记录信息']) ? data['变更记录信息'] : [];
  return records
    .map((item) => asLoose(item))
    .map((item, index) => {
      if (!item) return undefined;
      const date = str(item['变更日期']);
      const type = mapChangeType(str(item['变更项目']));
      const before = strArray(item['变更前内容']).join('\n');
      const after = strArray(item['变更后内容']).join('\n');
      const change: EntityChange = {
        id: `${enterpriseId}-change-${index}`,
        enterpriseId,
        type,
        date,
        ...(before ? { before } : {}),
        ...(after ? { after } : {}),
      };
      return change;
    })
    .filter((c): c is EntityChange => c !== undefined);
}

/** 严重风险因子 → red；其余司法流程/公示类 → yellow */
const SERIOUS_RISK_FACTORS = new Set([
  '失信信息',
  '被执行人',
  '限制高消费',
  '终本案件',
  '破产重整',
  '严重违法',
  '税收违法',
  '欠税公告',
  '税务非正常户',
  '惩戒名单',
  '违约事项',
  '环保处罚',
  '行政处罚',
]);

/**
 * get_company_risk_scan → RiskItem[]
 * 摘要含 35 项因子计数，仅将有记录（条目数>0）的因子生成风险条目
 */
export function mapRiskScan(raw: unknown, enterpriseId: string): RiskItem[] {
  const data = asLoose(raw);
  if (!data || '无匹配项' in data) return [];
  const factors = Array.isArray(data['风险因子扫描']) ? data['风险因子扫描'] : [];
  return factors
    .map((item) => asLoose(item))
    .map((item, index) => {
      if (!item) return undefined;
      const name = str(item['风险因子']);
      const count = typeof item['条目数'] === 'number' ? item['条目数'] : 0;
      if (!name || count <= 0) return undefined;
      const risk: RiskItem = {
        id: `${enterpriseId}-risk-${index}`,
        enterpriseId,
        type: name,
        level: SERIOUS_RISK_FACTORS.has(name) ? 'red' : 'yellow',
        date: '',
        detail: `${name} ${count} 条`,
        source: '企查查风险扫描',
      };
      return risk;
    })
    .filter((r): r is RiskItem => r !== undefined);
}

function mapSentiment(raw: string): 'positive' | 'neutral' | 'negative' {
  if (raw === '积极') return 'positive';
  if (raw === '消极') return 'negative';
  return 'neutral';
}

/**
 * get_news_sentiment → PublicOpinionItem[]
 * 每条含 标题 / 情感类型 / 链接 / 发布时间 / 来源
 */
export function mapNewsSentiment(
  raw: unknown,
  enterpriseId: string,
): PublicOpinionItem[] {
  const data = asLoose(raw);
  if (!data || '无匹配项' in data) return [];
  const items = Array.isArray(data['新闻舆情信息']) ? data['新闻舆情信息'] : [];
  return items
    .map((item) => asLoose(item))
    .map((item, index) => {
      if (!item) return undefined;
      const title = str(item['标题']);
      if (!title) return undefined;
      const url = str(item['链接']);
      return {
        id: `${enterpriseId}-news-${index}`,
        enterpriseId,
        title,
        summary: str(item['摘要']),
        sentiment: mapSentiment(str(item['情感类型'])),
        source: str(item['来源']),
        date: str(item['发布时间']).slice(0, 10),
        ...(url ? { url } : {}),
      };
    })
    .filter((o): o is PublicOpinionItem => o !== undefined);
}

/**
 * get_financial_data → FinancialSnapshot[]
 * 未披露主体返回「未发现任何记录」；有记录时宽松解析常见字段，解析不出则返回空
 */
export function mapFinancialData(
  raw: unknown,
  enterpriseId: string,
): FinancialSnapshot[] {
  const data = asLoose(raw);
  if (!data || '无匹配项' in data) return [];
  const records = Array.isArray(data['财务数据信息']) ? data['财务数据信息'] : [];
  return records
    .map((item) => asLoose(item))
    .map((item) => {
      if (!item) return undefined;
      const revenue = str(item['营业收入']) || str(item['营业总收入']);
      const yearNum = Number(str(item['年份']).slice(0, 4));
      // 关键字段全缺失视为无有效财务数据
      if (!revenue && !str(item['净利润']) && !Number.isFinite(yearNum)) {
        return undefined;
      }
      const debtRatioNum = Number(item['资产负债率']);
      return {
        enterpriseId,
        year: Number.isFinite(yearNum) && yearNum > 1900 ? yearNum : 0,
        revenue,
        netProfit: str(item['净利润']),
        totalAssets: str(item['资产总额']) || str(item['总资产']),
        totalLiabilities: str(item['负债总额']) || str(item['总负债']),
        debtRatio: Number.isFinite(debtRatioNum) ? debtRatioNum : 0,
        cashFlow: str(item['经营现金流']) || str(item['经营活动产生的现金流量净额']),
        currency: str(item['币种']) || 'CNY',
      };
    })
    .filter((f): f is FinancialSnapshot => f !== undefined);
}
