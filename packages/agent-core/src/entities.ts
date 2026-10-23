import { z } from 'zod';

/**
 * Supervisor 决策输出 Schema（Zod 约束）
 * Supervisor 必须按此结构输出，禁止自由文本解析
 */
export const TaskDistributionSchema = z.object({
  taskDescription: z
    .string()
    .describe('对用户查询的简要概括'),
  needsCompanyInfo: z
    .boolean()
    .describe('是否需要查询企业基本信息（名称、法人、注册资本等）'),
  companyQuery: z
    .string()
    .nullable()
    .describe('传递给企业信息 Agent 的查询语句，needsCompanyInfo 为 true 时必填'),
  needsGraph: z
    .boolean()
    .describe('是否需要查询企业关联关系图谱（股权、任职、投资等）'),
  graphQuery: z
    .string()
    .nullable()
    .describe('传递给图谱 Agent 的查询语句，needsGraph 为 true 时必填'),
  needsBusiness: z
    .boolean()
    .describe('是否需要查询工商资料与风险信息（变更、异常、司法风险等）'),
  businessQuery: z
    .string()
    .nullable()
    .describe('传递给工商资料 Agent 的查询语句，needsBusiness 为 true 时必填'),
  reasoning: z
    .string()
    .describe('本次任务分配的决策理由，用于可审计性'),
});

export type TaskDistribution = z.infer<typeof TaskDistributionSchema>;
