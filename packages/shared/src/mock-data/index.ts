// Mock 数据模块
// 开发阶段使用，生产阶段通过 DATA_SOURCE=real 切换为真实数据源

import companiesData from './companies.json';
import relationsData from './relations.json';
import risksData from './risks.json';
import changesData from './changes.json';
import opinionsData from './opinions.json';
import financialsData from './financials.json';
import needsData from './needs.json';
import type {
  BusinessNeed,
  Enterprise,
  EntityChange,
  FinancialSnapshot,
  GraphData,
  PublicOpinionItem,
  RiskItem,
} from '../types';

const companies = companiesData as Enterprise[];
const relations = relationsData as GraphData;
const risks = risksData as RiskItem[];
const changes = changesData as EntityChange[];
const opinions = opinionsData as PublicOpinionItem[];
const financials = financialsData as FinancialSnapshot[];
const needs = needsData as BusinessNeed[];

export const mockCompanies = companies;
export const mockRelations = relations;
export const mockRisks = risks;
export const mockChanges = changes;
export const mockOpinions = opinions;
export const mockFinancials = financials;
export const mockNeeds = needs;

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

/** 获取企业工商变更记录（按日期倒序） */
export function getChangesByEnterprise(enterpriseId: string): EntityChange[] {
  return changes
    .filter((change) => change.enterpriseId === enterpriseId)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

/** 获取企业网络舆情（按日期倒序） */
export function getOpinionsByEnterprise(enterpriseId: string): PublicOpinionItem[] {
  return opinions
    .filter((item) => item.enterpriseId === enterpriseId)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

/** 获取企业财务快照（按年份倒序） */
export function getFinancialsByEnterprise(enterpriseId: string): FinancialSnapshot[] {
  return financials
    .filter((item) => item.enterpriseId === enterpriseId)
    .sort((a, b) => b.year - a.year);
}

/** 获取企业需求（高优先级在前） */
export function getNeedsByEnterprise(enterpriseId: string): BusinessNeed[] {
  const priorityWeight = { high: 0, medium: 1, low: 2 } as const;
  return needs
    .filter((item) => item.enterpriseId === enterpriseId)
    .sort((a, b) => priorityWeight[a.priority] - priorityWeight[b.priority]);
}
