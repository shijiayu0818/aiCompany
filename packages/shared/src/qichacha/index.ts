// 企查查数据源封装：经 MCP 协议调用企查查智能体平台（agent.qcc.com）
// 开发阶段返回 Mock 数据，DATA_SOURCE=real 时走 MCP 工具调用
import { getDataSource } from '../api-keys';
import { callQccTool } from '../mcp/qcc-client';
import type {
  BusinessNeed,
  Enterprise,
  EntityChange,
  FinancialSnapshot,
  PublicOpinionItem,
  RiskItem,
} from '../types';
import {
  searchEnterprises,
  getEnterpriseById,
  getRisksByEnterprise,
  getChangesByEnterprise,
  getOpinionsByEnterprise,
  getFinancialsByEnterprise,
  getNeedsByEnterprise,
} from '../mock-data';
import {
  extractCompanyNameHint,
  mapCompanyByQuery,
  mapRegistrationInfo,
  mapChangeRecords,
  mapRiskScan,
  mapNewsSentiment,
  mapFinancialData,
} from './mcp-mapping';

export class QichachaClient {
  /**
   * 搜索企业（支持全称、简称、品牌名模糊搜索）
   * 返回候选列表（可能多候选），调用方按精确名称匹配或取首位
   */
  async searchEnterprise(keyword: string): Promise<Enterprise[]> {
    if (getDataSource('qichacha') !== 'real') {
      return searchEnterprises(keyword);
    }
    const raw = await callQccTool('company', 'get_company_by_query', {
      searchKey: keyword,
    });
    const mapped = mapCompanyByQuery(raw);
    if (mapped.length > 0) return mapped;
    // 原文搜索无结果时，从自然语言查询中提取企业名重试一次
    //（应对 Supervisor 透传整句查询的情况）
    const hint = extractCompanyNameHint(keyword);
    if (hint && hint !== keyword) {
      const retryRaw = await callQccTool('company', 'get_company_by_query', {
        searchKey: hint,
      });
      return mapCompanyByQuery(retryRaw);
    }
    return [];
  }

  /** 获取企业详情（searchKey 为完整企业名称或 18 位统一社会信用代码） */
  async getEnterpriseDetail(id: string): Promise<Enterprise | undefined> {
    if (getDataSource('qichacha') !== 'real') {
      return getEnterpriseById(id);
    }
    const raw = await callQccTool('company', 'get_company_registration_info', {
      searchKey: id,
    });
    return mapRegistrationInfo(raw);
  }

  /** 获取企业风险信息：risk_scan 一次扫描 35 项风险因子 */
  async getRiskInfo(enterpriseId: string): Promise<RiskItem[]> {
    if (getDataSource('qichacha') !== 'real') {
      return getRisksByEnterprise(enterpriseId);
    }
    const raw = await callQccTool('risk', 'get_company_risk_scan', {
      searchKey: enterpriseId,
    });
    return mapRiskScan(raw, enterpriseId);
  }

  /** 获取工商变更记录 */
  async getChangeHistory(enterpriseId: string): Promise<EntityChange[]> {
    if (getDataSource('qichacha') !== 'real') {
      return getChangesByEnterprise(enterpriseId);
    }
    const raw = await callQccTool('company', 'get_change_records', {
      searchKey: enterpriseId,
    });
    return mapChangeRecords(raw, enterpriseId);
  }

  /** 获取企业网络舆情 */
  async getPublicOpinions(enterpriseId: string): Promise<PublicOpinionItem[]> {
    if (getDataSource('qichacha') !== 'real') {
      return getOpinionsByEnterprise(enterpriseId);
    }
    const raw = await callQccTool('operation', 'get_news_sentiment', {
      searchKey: enterpriseId,
    });
    return mapNewsSentiment(raw, enterpriseId);
  }

  /** 获取企业财务快照（未披露财务数据的主体返回空数组） */
  async getFinancials(enterpriseId: string): Promise<FinancialSnapshot[]> {
    if (getDataSource('qichacha') !== 'real') {
      return getFinancialsByEnterprise(enterpriseId);
    }
    const raw = await callQccTool('company', 'get_financial_data', {
      searchKey: enterpriseId,
    });
    return mapFinancialData(raw, enterpriseId);
  }

  /**
   * 获取企业需求
   * 企查查 MCP 暂无直接对应的企业需求工具（融资记录/招聘信息为需求线索，待后续接入）
   */
  async getBusinessNeeds(enterpriseId: string): Promise<BusinessNeed[]> {
    if (getDataSource('qichacha') !== 'real') {
      return getNeedsByEnterprise(enterpriseId);
    }
    return [];
  }
}

// 单例导出
export const qichachaClient = new QichachaClient();
