// 企查查智能体平台 MCP 客户端封装（https://agent.qcc.com）
// 远端 Streamable HTTP 传输，Authorization: Bearer <API Key> 鉴权
// 连接惰性建立并按域复用；配置延迟读取，模块 import 期不依赖环境变量
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

/** 企查查 MCP Server 域（与官方 mcpServers 配置一一对应） */
export type QccServerName =
  | 'company'
  | 'risk'
  | 'history'
  | 'operation'
  | 'executive'
  | 'ipr'
  | 'case'
  | 'regulation'
  | 'tender'
  | 'document';

const DEFAULT_BASE_URL = 'https://agent.qcc.com/mcp';

interface QccMcpConfig {
  /** 已含 Bearer 前缀的鉴权头 */
  authorization: string;
  baseUrl: string;
}

/** 延迟读取 MCP 连接配置；Key 统一补全 Bearer 前缀 */
function getQccMcpConfig(): QccMcpConfig {
  const raw = (process.env.QICHACHA_API_KEY ?? '').trim();
  if (!raw) {
    throw new Error('缺少 QICHACHA_API_KEY 环境变量，无法连接企查查 MCP');
  }
  const authorization = raw.startsWith('Bearer ') ? raw : `Bearer ${raw}`;
  const baseUrl = (process.env.QCC_MCP_BASE_URL ?? DEFAULT_BASE_URL).replace(
    /\/+$/,
    '',
  );
  return { authorization, baseUrl };
}

// 每个域一个长连接，惰性建立后复用
const clientCache = new Map<QccServerName, Client>();

/** 获取（或建立）指定域的 MCP 连接 */
async function getClient(server: QccServerName): Promise<Client> {
  const cached = clientCache.get(server);
  if (cached) return cached;

  const { authorization, baseUrl } = getQccMcpConfig();
  const url = `${baseUrl}/${server}/stream`;
  const client = new Client({
    name: 'aiCompany-agent',
    version: '0.1.0',
  });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(url), {
      requestInit: { headers: { Authorization: authorization } },
    }),
  );
  clientCache.set(server, client);
  return client;
}

/** MCP 工具元信息（listTools 结果的精简视图） */
export interface QccToolInfo {
  name: string;
  description: string;
  inputSchema: unknown;
}

/** 列出指定域下全部可用工具（用于动态发现与映射校准） */
export async function listQccTools(
  server: QccServerName,
): Promise<QccToolInfo[]> {
  const client = await getClient(server);
  const res = await client.listTools();
  return res.tools.map((tool) => ({
    name: tool.name,
    description: tool.description ?? '',
    inputSchema: tool.inputSchema,
  }));
}

/**
 * 调用指定域的 MCP 工具，返回解析后的业务数据。
 * MCP 文本内容优先按 JSON 解析，失败时原样返回字符串。
 */
export async function callQccTool(
  server: QccServerName,
  name: string,
  args: Record<string, unknown> = {},
): Promise<unknown> {
  const client = await getClient(server);
  const res = await client.callTool({ name, arguments: args });

  if (res.isError) {
    const text = extractText(res.content);
    throw new Error(`企查查 MCP 工具 ${server}/${name} 调用失败: ${text}`);
  }

  const text = extractText(res.content);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** 提取 MCP content 数组中的全部文本（type=text 项按行拼接） */
function extractText(content: unknown): string {
  if (!Array.isArray(content)) return '';
  return content
    .filter(
      (item): item is { type: string; text?: string } =>
        typeof item === 'object' && item !== null && 'type' in item,
    )
    .filter((item) => item.type === 'text' && typeof item.text === 'string')
    .map((item) => item.text as string)
    .join('\n');
}

/** 关闭指定域连接（测试用）；不传则关闭全部 */
export async function closeQccClients(
  server?: QccServerName,
): Promise<void> {
  if (server) {
    await clientCache.get(server)?.close();
    clientCache.delete(server);
    return;
  }
  for (const [, client] of clientCache) {
    await client.close();
  }
  clientCache.clear();
}
