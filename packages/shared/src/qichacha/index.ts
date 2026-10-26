// 企查查预警通 API 封装
// 开发阶段返回 Mock 数据，生产阶段通过 DATA_SOURCE=real 调用真实 API
import { getQichachaConfig } from '../api-keys';
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

export class QichachaClient {
  private apiKey = '';
  private baseURL = '';
  private configLoaded = false;

  /**
   * 延迟加载企查查配置
   * mock 模式不依赖 API Key，避免模块导入期即抛错导致整个 Agent 无法启动
   */
  private ensureConfig(): void {
    if (this.configLoaded) return;
    const config = getQichachaConfig();
    this.apiKey = config.apiKey;
    this.baseURL = config.baseURL;
    this.configLoaded = true;
  }

  /**
   * 搜索企业（按名称或信用代码）
   * 开发阶段返回 Mock，生产阶段调企查查 API
   */
  async searchEnterprise(keyword: string): Promise<Enterprise[]> {
    // 开发阶段：返回 Mock 数据
    if (process.env.DATA_SOURCE !== 'real') {
      return searchEnterprises(keyword);
    }
    this.ensureConfig();
    // 生产阶段：调用企查查 API
    const res = await fetch(`${this.baseURL}/api/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Token: this.apiKey,
      },
      body: JSON.stringify({ keyword }),
    });
    if (!res.ok) {
      throw new Error(`企查查 API 调用失败: ${res.status}`);
    }
    const data = await res.json();
    return data.result ?? [];
  }

  /**
   * 获取企业详情
   */
  async getEnterpriseDetail(id: string): Promise<Enterprise | undefined> {
    if (process.env.DATA_SOURCE !== 'real') {
      return getEnterpriseById(id);
    }
    this.ensureConfig();
    const res = await fetch(`${this.baseURL}/api/detail`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Token: this.apiKey },
      body: JSON.stringify({ id }),
    });
    if (!res.ok) throw new Error(`企查查 API 调用失败: ${res.status}`);
    const data = await res.json();
    return data.result;
  }

  /**
   * 获取企业风险信息
   */
  async getRiskInfo(enterpriseId: string): Promise<RiskItem[]> {
    if (process.env.DATA_SOURCE !== 'real') {
      return getRisksByEnterprise(enterpriseId);
    }
    this.ensureConfig();
    const res = await fetch(`${this.baseURL}/api/risk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Token: this.apiKey },
      body: JSON.stringify({ enterpriseId }),
    });
    if (!res.ok) throw new Error(`企查查 API 调用失败: ${res.status}`);
    const data = await res.json();
    return data.result ?? [];
  }

  /** 获取工商变更记录（real 模式调用企查查变更接口） */
  async getChangeHistory(enterpriseId: string): Promise<EntityChange[]> {
    if (process.env.DATA_SOURCE !== 'real') {
      return getChangesByEnterprise(enterpriseId);
    }
    return this.postReal<EntityChange>('/api/change', { enterpriseId });
  }

  /** 获取企业网络舆情 */
  async getPublicOpinions(enterpriseId: string): Promise<PublicOpinionItem[]> {
    if (process.env.DATA_SOURCE !== 'real') {
      return getOpinionsByEnterprise(enterpriseId);
    }
    return this.postReal<PublicOpinionItem>('/api/opinion', { enterpriseId });
  }

  /** 获取企业财务快照 */
  async getFinancials(enterpriseId: string): Promise<FinancialSnapshot[]> {
    if (process.env.DATA_SOURCE !== 'real') {
      return getFinancialsByEnterprise(enterpriseId);
    }
    return this.postReal<FinancialSnapshot>('/api/finance', { enterpriseId });
  }

  /** 获取企业需求 */
  async getBusinessNeeds(enterpriseId: string): Promise<BusinessNeed[]> {
    if (process.env.DATA_SOURCE !== 'real') {
      return getNeedsByEnterprise(enterpriseId);
    }
    return this.postReal<BusinessNeed>('/api/need', { enterpriseId });
  }

  /** real 模式通用 POST 请求 */
  private async postReal<T>(path: string, body: unknown): Promise<T[]> {
    this.ensureConfig();
    const res = await fetch(`${this.baseURL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Token: this.apiKey },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`企查查 API 调用失败: ${res.status}`);
    const data = await res.json();
    return data.result ?? [];
  }
}

// 单例导出
export const qichachaClient = new QichachaClient();
