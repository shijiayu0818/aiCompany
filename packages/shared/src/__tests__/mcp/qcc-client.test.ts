import { describe, it, expect, beforeEach, vi } from 'vitest';

// mock MCP SDK：Client 实例方法全部 vi.fn，传输层仅记录构造参数
const mockClient = vi.hoisted(() => ({
  connect: vi.fn(),
  listTools: vi.fn(),
  callTool: vi.fn(),
  close: vi.fn(),
}));

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: vi.fn(() => mockClient),
}));

vi.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({
  StreamableHTTPClientTransport: vi.fn(),
}));

import {
  listQccTools,
  callQccTool,
  closeQccClients,
} from '../../mcp/qcc-client';

beforeEach(async () => {
  // clearAllMocks 仅清调用记录，保留 Client 工厂的 mock 实现
  vi.clearAllMocks();
  await closeQccClients();
  vi.stubEnv('QICHACHA_API_KEY', 'test-key');
  delete process.env.QCC_MCP_BASE_URL;
});

describe('callQccTool', () => {
  it('JSON 文本内容解析为对象返回', async () => {
    mockClient.callTool.mockResolvedValue({
      content: [{ type: 'text', text: '{"result":[{"name":"星辰智能"}]}' }],
    });

    const data = (await callQccTool('company', 'get_info', {
      keyword: '星辰智能',
    })) as { result: Array<{ name: string }> };

    expect(data.result[0].name).toBe('星辰智能');
    expect(mockClient.callTool).toHaveBeenCalledWith({
      name: 'get_info',
      arguments: { keyword: '星辰智能' },
    });
  });

  it('非 JSON 文本原样返回字符串', async () => {
    mockClient.callTool.mockResolvedValue({
      content: [{ type: 'text', text: '纯文本返回' }],
    });
    expect(await callQccTool('risk', 'list')).toBe('纯文本返回');
  });

  it('isError 时抛出含 server/工具名的错误', async () => {
    mockClient.callTool.mockResolvedValue({
      isError: true,
      content: [{ type: 'text', text: '积分不足' }],
    });

    await expect(callQccTool('company', 'get_info')).rejects.toThrow(
      'company/get_info 调用失败: 积分不足',
    );
  });

  it('连接按域复用：多次调用仅 connect 一次', async () => {
    mockClient.callTool.mockResolvedValue({
      content: [{ type: 'text', text: '1' }],
    });

    await callQccTool('company', 'a');
    await callQccTool('company', 'b');

    expect(mockClient.connect).toHaveBeenCalledTimes(1);
  });

  it('不同域各自建立连接', async () => {
    mockClient.callTool.mockResolvedValue({
      content: [{ type: 'text', text: '1' }],
    });

    await callQccTool('company', 'a');
    await callQccTool('history', 'b');

    expect(mockClient.connect).toHaveBeenCalledTimes(2);
  });

  it('缺少 QICHACHA_API_KEY 时抛出明确错误', async () => {
    vi.stubEnv('QICHACHA_API_KEY', '');
    await expect(callQccTool('company', 'a')).rejects.toThrow(
      '缺少 QICHACHA_API_KEY',
    );
  });
});

describe('listQccTools', () => {
  it('返回工具名/描述/参数 schema 精简视图', async () => {
    mockClient.listTools.mockResolvedValue({
      tools: [
        {
          name: 'get_company_registration_info',
          description: '查询工商登记信息',
          inputSchema: { type: 'object', properties: {} },
          extra: 'ignored',
        },
      ],
    });

    const tools = await listQccTools('company');

    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe('get_company_registration_info');
    expect(tools[0].description).toBe('查询工商登记信息');
    expect(tools[0].inputSchema).toEqual({ type: 'object', properties: {} });
  });
});

describe('closeQccClients', () => {
  it('关闭后再次调用会重新建立连接', async () => {
    mockClient.callTool.mockResolvedValue({
      content: [{ type: 'text', text: '1' }],
    });

    await callQccTool('company', 'a');
    await closeQccClients('company');
    await callQccTool('company', 'b');

    expect(mockClient.connect).toHaveBeenCalledTimes(2);
  });
});
