// LLM 代理路由：服务端注入 API Key，前端不持有密钥
// AGENTS.md: 生产级密钥请求必经 Next.js API Route，严禁前端代码持有任何 API Key
import { NextRequest, NextResponse } from 'next/server';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';
import { getLLMConfig } from '@ai/shared';

export const runtime = 'nodejs';

/**
 * POST /api/llm
 * 请求体：{ messages: Array<{ role: 'user'|'assistant'|'system', content: string }> }
 * 响应：{ content: string }
 *
 * 薄代理：注入 LLM_API_KEY 后转发，前端零密钥
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      messages?: Array<{ role: string; content: string }>;
    };
    if (!body.messages || body.messages.length === 0) {
      return NextResponse.json({ error: 'messages is required' }, { status: 400 });
    }

    const config = getLLMConfig();
    const llm = new ChatOpenAI({
      apiKey: config.apiKey,
      configuration: { baseURL: config.baseURL },
      model: config.model,
      temperature: 0.7,
    });

    const messages = body.messages.map((m) => {
      if (m.role === 'user') return new HumanMessage(m.content);
      if (m.role === 'assistant') return new AIMessage(m.content);
      return new SystemMessage(m.content);
    });

    const response = await llm.invoke(messages);
    const content =
      typeof response.content === 'string'
        ? response.content
        : JSON.stringify(response.content);

    return NextResponse.json({ content });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
