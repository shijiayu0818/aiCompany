import { describe, expect, it } from 'vitest';
import { computeRiskFlags } from '../../risk/change-alert';
import type { ChangeType, EntityChange } from '../../types';

const NOW = new Date('2026-10-25T00:00:00Z');

function makeChange(
  id: string,
  type: ChangeType,
  date: string,
): EntityChange {
  return { id, enterpriseId: 'e1', type, date };
}

describe('computeRiskFlags', () => {
  it('无变更记录时返回空预警', () => {
    expect(computeRiskFlags([], NOW)).toEqual([]);
  });

  it('单次法定代表人变更不触发预警', () => {
    const flags = computeRiskFlags(
      [makeChange('c1', '法定代表人变更', '2026-03-01')],
      NOW,
    );
    expect(flags).toEqual([]);
  });

  it('近 12 个月法定代表人变更 2 次触发红色预警', () => {
    const flags = computeRiskFlags(
      [
        makeChange('c1', '法定代表人变更', '2026-01-10'),
        makeChange('c2', '法定代表人变更', '2026-08-20'),
      ],
      NOW,
    );
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({
      code: 'FREQUENT_LEGAL_PERSON',
      label: '短期频繁更换法定代表人',
      level: 'red',
      detail: '近 12 个月法定代表人变更 2 次',
    });
  });

  it('超出 12 个月的变更不计入统计', () => {
    const flags = computeRiskFlags(
      [
        makeChange('c1', '法定代表人变更', '2025-01-01'),
        makeChange('c2', '法定代表人变更', '2025-10-01'),
      ],
      NOW,
    );
    expect(flags).toEqual([]);
  });

  it('无效日期与未来日期不参与统计', () => {
    const flags = computeRiskFlags(
      [
        makeChange('c1', '法定代表人变更', 'not-a-date'),
        makeChange('c2', '法定代表人变更', '2026-12-31'),
      ],
      NOW,
    );
    expect(flags).toEqual([]);
  });

  it('近 12 个月股东变更 3 次触发黄色预警', () => {
    const flags = computeRiskFlags(
      [
        makeChange('c1', '股东变更', '2026-01-01'),
        makeChange('c2', '股东变更', '2026-04-01'),
        makeChange('c3', '股东变更', '2026-09-01'),
      ],
      NOW,
    );
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({
      code: 'FREQUENT_SHAREHOLDER',
      label: '股东频繁变更',
      level: 'yellow',
    });
  });

  it('近 12 个月累计变更 5 次触发高频变更预警', () => {
    const flags = computeRiskFlags(
      [
        makeChange('c1', '经营范围变更', '2026-01-01'),
        makeChange('c2', '注册资本变更', '2026-02-01'),
        makeChange('c3', '地址变更', '2026-03-01'),
        makeChange('c4', '名称变更', '2026-04-01'),
        makeChange('c5', '经营范围变更', '2026-05-01'),
      ],
      NOW,
    );
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({
      code: 'FREQUENT_CHANGE',
      label: '高频变更',
      level: 'red',
      detail: '近 12 个月累计变更 5 次',
    });
  });

  it('多条规则同时命中时返回全部预警（高频 → 法人 → 股东）', () => {
    const flags = computeRiskFlags(
      [
        makeChange('c1', '法定代表人变更', '2026-01-01'),
        makeChange('c2', '法定代表人变更', '2026-02-01'),
        makeChange('c3', '股东变更', '2026-03-01'),
        makeChange('c4', '股东变更', '2026-04-01'),
        makeChange('c5', '股东变更', '2026-05-01'),
      ],
      NOW,
    );
    expect(flags.map((flag) => flag.code)).toEqual([
      'FREQUENT_CHANGE',
      'FREQUENT_LEGAL_PERSON',
      'FREQUENT_SHAREHOLDER',
    ]);
  });
});
