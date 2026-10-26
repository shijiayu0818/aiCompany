import type { SupervisorState } from '../state';

/** 构造最小可用的 SupervisorState 测试夹具 */
export function makeState(overrides: Partial<SupervisorState> = {}): SupervisorState {
  return {
    messages: [],
    supervisorTask: '测试查询',
    threadId: undefined,
    needsCompanyInfo: false,
    companyQuery: undefined,
    needsGraph: false,
    graphQuery: undefined,
    needsBusiness: false,
    businessQuery: undefined,
    reasoning: '',
    companyOutput: '',
    graphOutput: '',
    businessOutput: '',
    currentGraph: undefined,
    currentReport: undefined,
    ...overrides,
  };
}
