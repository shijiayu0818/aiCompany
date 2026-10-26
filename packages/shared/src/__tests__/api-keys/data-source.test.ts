import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getDataSource } from '../../api-keys';

beforeEach(() => {
  vi.unstubAllEnvs();
  delete process.env.DATA_SOURCE;
  delete process.env.GRAPH_DATA_SOURCE;
  delete process.env.QICHACHA_DATA_SOURCE;
});

describe('getDataSource 数据源粒度解析', () => {
  it('未配置任何变量时默认 mock', () => {
    expect(getDataSource()).toBe('mock');
    expect(getDataSource('company')).toBe('mock');
  });

  it('全局 DATA_SOURCE=real 时默认走 real', () => {
    process.env.DATA_SOURCE = 'real';
    expect(getDataSource()).toBe('real');
    expect(getDataSource('company')).toBe('real');
    expect(getDataSource('graph')).toBe('real');
  });

  it('作用域覆盖变量优先于全局 DATA_SOURCE', () => {
    process.env.DATA_SOURCE = 'real';
    process.env.GRAPH_DATA_SOURCE = 'mock';
    process.env.QICHACHA_DATA_SOURCE = 'mock';
    expect(getDataSource('graph')).toBe('mock');
    expect(getDataSource('qichacha')).toBe('mock');
    // 未覆盖的作用域仍跟随全局
    expect(getDataSource('company')).toBe('real');
    expect(getDataSource('business')).toBe('real');
  });

  it('覆盖变量取非法值时忽略并回退全局', () => {
    process.env.DATA_SOURCE = 'real';
    process.env.GRAPH_DATA_SOURCE = 'yes';
    expect(getDataSource('graph')).toBe('real');
  });
});
