// Mock 数据模块
// 开发阶段使用，生产阶段通过 DATA_SOURCE=real 切换为真实数据源

import companiesData from './companies.json';
import relationsData from './relations.json';
import risksData from './risks.json';
import type { Enterprise, GraphData, RiskItem } from '../types';

const companies = companiesData as Enterprise[];
const relations = relationsData as GraphData;
const risks = risksData as RiskItem[];

export const mockCompanies = companies;
export const mockRelations = relations;
export const mockRisks = risks;

/**
 * 按名称或信用代码搜索企业
 */
export function searchEnterprises(keyword: string): Enterprise[] {
  if (!keyword) return companies;
  const kw = keyword.toLowerCase();
  return companies.filter(
    (c) =>
      c.name.toLowerCase().includes(kw) ||
      c.creditCode.toLowerCase().includes(kw) ||
      c.industry.toLowerCase().includes(kw) ||
      c.region.toLowerCase().includes(kw),
  );
}

/**
 * 按 ID 获取企业详情
 */
export function getEnterpriseById(id: string): Enterprise | undefined {
  return companies.find((c) => c.id === id);
}

/**
 * 获取企业关联关系图谱（全量或按企业 ID 过滤）
 */
export function getRelations(enterpriseId?: string): GraphData {
  if (!enterpriseId) return relations;
  const connectedNodeIds = new Set<string>([enterpriseId]);
  relations.edges.forEach((edge) => {
    if (edge.source === enterpriseId || edge.target === enterpriseId) {
      connectedNodeIds.add(edge.source);
      connectedNodeIds.add(edge.target);
    }
  });
  return {
    nodes: relations.nodes.filter((n) => connectedNodeIds.has(n.id)),
    edges: relations.edges.filter(
      (e) => connectedNodeIds.has(e.source) && connectedNodeIds.has(e.target),
    ),
  };
}

/**
 * 获取企业风险列表
 */
export function getRisksByEnterprise(enterpriseId: string): RiskItem[] {
  return risks.filter((r) => r.enterpriseId === enterpriseId);
}
