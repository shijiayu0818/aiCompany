import { describe, it, expect, vi, afterEach } from 'vitest';
import { companyAdapter } from '../adapters/company-adapter';
import { graphAdapter } from '../adapters/graph-adapter';
import { businessAdapter } from '../adapters/business-adapter';
import { makeState } from './helpers';

afterEach(() => {
  vi.unstubAllGlobals();
});

/** 构造 fetch Response 模拟对象 */
function makeRes(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
  } as unknown as Response;
}

interface AdapterCase {
  name: string;
  fn: typeof companyAdapter;
  url: string;
  queryKey: 'companyQuery' | 'graphQuery' | 'businessQuery';
  outputKey: 'companyOutput' | 'graphOutput' | 'businessOutput';
  label: string;
}

const adapters: AdapterCase[] = [
  {
    name: 'companyAdapter',
    fn: companyAdapter,
    url: 'http://localhost:3001/api/query',
    queryKey: 'companyQuery',
    outputKey: 'companyOutput',
    label: '企业信息',
  },
  {
    name: 'graphAdapter',
    fn: graphAdapter,
    url: 'http://localhost:3002/api/query',
    queryKey: 'graphQuery',
    outputKey: 'graphOutput',
    label: '图谱',
  },
  {
    name: 'businessAdapter',
    fn: businessAdapter,
    url: 'http://localhost:3003/api/query',
    queryKey: 'businessQuery',
    outputKey: 'businessOutput',
    label: '工商资料',
  },
];

describe.each(adapters)('$name 降级与成功路径', ({ fn, url, queryKey, outputKey, label }) => {
  it('成功时输出序列化的 data 字段', async () => {
    const payload = { id: 'e1', name: '星辰智能科技集团' };
    const fetchMock = vi.fn().mockResolvedValue(
      makeRes({ success: true, data: payload }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await fn(makeState({ [queryKey]: '查询星辰智能' } as never));

    expect(fetchMock).toHaveBeenCalledWith(
      url,
      expect.objectContaining({ method: 'POST' }),
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ query: '查询星辰智能' });
    expect(result[outputKey]).toBe(JSON.stringify(payload, null, 2));
  });

  it('query 与 supervisorTask 均缺失时输出提示且不发起请求', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await fn(makeState({ supervisorTask: '', [queryKey]: undefined } as never));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result[outputKey]).toBe(`${label}查询语句缺失。`);
  });

  it('HTTP 非 2xx 时输出调用失败信息', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeRes(null, false, 500)));

    const result = await fn(makeState({ [queryKey]: 'q' } as never));

    expect(result[outputKey]).toBe(`${label} Agent 调用失败: HTTP 500`);
  });

  it('success=false 时输出业务错误信息', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(makeRes({ success: false, error: '企业不存在' })),
    );

    const result = await fn(makeState({ [queryKey]: 'q' } as never));

    expect(result[outputKey]).toBe(`${label}查询失败: 企业不存在`);
  });

  it('success=false 且 error 缺失时输出未知错误', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeRes({ success: false })));

    const result = await fn(makeState({ [queryKey]: 'q' } as never));

    expect(result[outputKey]).toBe(`${label}查询失败: 未知错误`);
  });

  it('fetch 抛错时降级为不可用信息而不抛出', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fetch failed')));

    const result = await fn(makeState({ [queryKey]: 'q' } as never));

    expect(result[outputKey]).toBe(`${label} Agent 不可用或调用失败: fetch failed`);
  });

  it('fetch 抛出字符串时降级信息包含该字符串', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue('boom'));

    const result = await fn(makeState({ [queryKey]: 'q' } as never));

    expect(result[outputKey]).toBe(`${label} Agent 不可用或调用失败: boom`);
  });

  it('fetch 抛出普通对象时降级信息包含序列化结果', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue({ code: 1 }));

    const result = await fn(makeState({ [queryKey]: 'q' } as never));

    expect(result[outputKey]).toBe(
      `${label} Agent 不可用或调用失败: {"code":1}`,
    );
  });

  it('data.data 缺失时输出空对象', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeRes({ success: true })));

    const result = await fn(makeState({ [queryKey]: 'q' } as never));

    expect(result[outputKey]).toBe(JSON.stringify({}, null, 2));
  });
});
