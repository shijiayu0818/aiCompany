// @ai/agent-core Agent 编排核心
// 包含：state / entities / supervisor / adapters / graph-builder / agent

export const AGENT_CORE_VERSION = '0.0.1';

// State
export { SupervisorStateAnnotation } from './state';
export type { SupervisorState, SupervisorUpdate } from './state';

// Entities
export { TaskDistributionSchema } from './entities';
export type { TaskDistribution } from './entities';

// Supervisor
export { supervisorNode } from './supervisor';

// Adapters
export { companyAdapter } from './adapters/company-adapter';
export { graphAdapter } from './adapters/graph-adapter';
export { businessAdapter } from './adapters/business-adapter';

// Graph Builder
export { graphBuilderNode } from './graph-builder';

// Agent Graph
export { buildAgentGraph, createGraph } from './agent';
