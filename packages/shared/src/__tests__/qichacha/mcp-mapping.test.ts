import { describe, it, expect } from 'vitest';
import {
  mapCompanyByQuery,
  mapRegistrationInfo,
  mapChangeType,
  mapChangeRecords,
  mapRiskScan,
  mapNewsSentiment,
  mapFinancialData,
} from '../../qichacha/mcp-mapping';

describe('mapCompanyByQuery', () => {
  it('唯一精确匹配（企业信息为对象）映射为单元素数组', () => {
    const result = mapCompanyByQuery({
      匹配结果: '唯一精确匹配',
      企业信息: { 企业名称: '阿里巴巴（中国）有限公司', 统一社会信用代码: '91330100799655058B' },
    });

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('91330100799655058B');
    expect(result[0].name).toBe('阿里巴巴（中国）有限公司');
  });

  it('多候选（企业信息为数组）映射为候选列表，id 缺失时回退企业名称', () => {
    const result = mapCompanyByQuery({
      匹配结果: '多候选',
      企业信息: [
        {
          企业名称: '阿里巴巴（中国）有限公司',
          统一社会信用代码: '91330100799655058B',
          法定代表人名称: ['蒋芳'],
          状态: '存续',
        },
        { 企业名称: '无代码企业', 状态: '在业' },
      ],
    });

    expect(result).toHaveLength(2);
    expect(result[0].legalPerson).toBe('蒋芳');
    expect(result[0].status).toBe('存续');
    expect(result[1].id).toBe('无代码企业');
    // 「在业」归一为「存续」
    expect(result[1].status).toBe('存续');
  });

  it('无匹配或非法结构返回空数组', () => {
    expect(mapCompanyByQuery(null)).toEqual([]);
    expect(mapCompanyByQuery({ 企业信息: undefined })).toEqual([]);
  });
});

describe('mapRegistrationInfo', () => {
  it('完整登记信息映射行业/地区/法人/注册资本', () => {
    const result = mapRegistrationInfo({
      企业名称: '阿里巴巴（中国）有限公司',
      统一社会信用代码: '91330100799655058B',
      法定代表人: '蒋芳',
      登记状态: '存续',
      成立日期: '2007-03-26',
      注册资本: '15460.55039万美元',
      所属地区: '浙江省杭州市滨江区',
      地区信息: { 省份: '浙江省', 城市: '杭州市', 区域: '滨江区' },
      国标行业: { 门类: '租赁和商务服务业', 大类: '商务服务业', 中类: '组织管理服务' },
      经营范围: '一般项目：软件开发',
    });

    expect(result?.industry).toBe('组织管理服务');
    expect(result?.region).toBe('浙江省杭州市滨江区');
    expect(result?.legalPerson).toBe('蒋芳');
    expect(result?.registeredCapital).toBe('15460.55039万美元');
    expect(result?.description).toBe('一般项目：软件开发');
  });

  it('无匹配项时返回 undefined', () => {
    expect(mapRegistrationInfo({ 无匹配项: '未匹配到搜索关键词' })).toBeUndefined();
  });
});

describe('mapChangeType', () => {
  it('企查查变更项目文案映射到项目 ChangeType', () => {
    expect(mapChangeType('投资人变更（包括出资额、出资方式、出资日期、投资人名称等）')).toBe('股东变更');
    expect(mapChangeType('注册资本变更（注册资金、资金数额等变更）')).toBe('注册资本变更');
    expect(mapChangeType('经营范围变更（含业务范围变更）')).toBe('经营范围变更');
    expect(mapChangeType('高级管理人员备案（董事、监事、经理等）')).toBe('其他变更');
    expect(mapChangeType('章程备案')).toBe('其他变更');
  });
});

describe('mapChangeRecords', () => {
  it('变更记录映射含 before/after 内容与日期', () => {
    const result = mapChangeRecords(
      {
        变更记录信息: [
          {
            变更日期: '2025-06-23',
            变更项目: '注册资本变更（注册资金、资金数额等变更）',
            变更前内容: ['15459.89659万美元'],
            变更后内容: ['15460.55039万美元（+0.6538万美元）'],
          },
        ],
      },
      'e1',
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      enterpriseId: 'e1',
      type: '注册资本变更',
      date: '2025-06-23',
      before: '15459.89659万美元',
      after: '15460.55039万美元（+0.6538万美元）',
    });
  });

  it('无匹配返回空数组', () => {
    expect(mapChangeRecords({ 无匹配项: 'x' }, 'e1')).toEqual([]);
  });
});

describe('mapRiskScan', () => {
  it('仅将有记录的因子映射为风险条目，严重因子标红', () => {
    const result = mapRiskScan(
      {
        风险因子扫描: [
          { 风险因子: '失信信息', 条目数: 0, 明细工具: 'get_dishonest_info' },
          { 风险因子: '裁判文书', 条目数: 271, 明细工具: 'get_judicial_documents' },
          { 风险因子: '股权出质', 条目数: 3, 明细工具: 'get_equity_pledge_info' },
        ],
      },
      'e1',
    );

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      enterpriseId: 'e1',
      type: '裁判文书',
      level: 'yellow',
      detail: '裁判文书 271 条',
    });
    expect(result[1].type).toBe('股权出质');
  });

  it('严重因子（如被执行人）标红', () => {
    const result = mapRiskScan(
      { 风险因子扫描: [{ 风险因子: '被执行人', 条目数: 1 }] },
      'e1',
    );
    expect(result[0].level).toBe('red');
  });
});

describe('mapNewsSentiment', () => {
  it('情感类型映射 positive/neutral/negative，时间截取日期', () => {
    const result = mapNewsSentiment(
      {
        新闻舆情信息: [
          {
            标题: '花旗调整持股',
            情感类型: '中立',
            链接: 'https://qcc.com/n/1',
            发布时间: '2026-10-22 17:02:00',
            来源: '东方财富网',
          },
          { 标题: '利好消息', 情感类型: '积极', 发布时间: '2026-10-20' },
        ],
      },
      'e1',
    );

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      enterpriseId: 'e1',
      sentiment: 'neutral',
      date: '2026-10-22',
      source: '东方财富网',
      url: 'https://qcc.com/n/1',
    });
    expect(result[1].sentiment).toBe('positive');
  });
});

describe('mapFinancialData', () => {
  it('未披露主体（未发现任何记录）返回空数组', () => {
    expect(mapFinancialData({ 搜索结果: '未发现任何记录' }, 'e1')).toEqual([]);
  });

  it('有记录时映射财务快照字段', () => {
    const result = mapFinancialData(
      {
        财务数据信息: [
          {
            年份: '2024',
            营业收入: '1000万元',
            净利润: '120万元',
            资产总额: '5000万元',
            负债总额: '2000万元',
            资产负债率: 40,
          },
        ],
      },
      'e1',
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      enterpriseId: 'e1',
      year: 2024,
      revenue: '1000万元',
      debtRatio: 40,
      currency: 'CNY',
    });
  });
});
