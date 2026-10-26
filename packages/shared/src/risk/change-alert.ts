// 企业变更预警：基于近 12 个月工商变更记录识别高频变更风险
import type { EntityChange, RiskFlag } from '../types';

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

/** 筛选近 12 个月内的变更记录（无效日期不参与统计） */
function recentChanges(changes: EntityChange[], now: Date): EntityChange[] {
  const nowTime = now.getTime();
  const threshold = nowTime - ONE_YEAR_MS;
  return changes.filter((change) => {
    const time = new Date(change.date).getTime();
    return Number.isFinite(time) && time >= threshold && time <= nowTime;
  });
}

/**
 * 计算企业变更预警
 * - 近 12 个月变更 ≥5 次：高频变更
 * - 近 12 个月法定代表人变更 ≥2 次：短期频繁更换法定代表人
 * - 近 12 个月股东变更 ≥3 次：股东频繁变更
 */
export function computeRiskFlags(
  changes: EntityChange[],
  now: Date = new Date(),
): RiskFlag[] {
  const recent = recentChanges(changes, now);
  const flags: RiskFlag[] = [];

  if (recent.length >= 5) {
    flags.push({
      code: 'FREQUENT_CHANGE',
      label: '高频变更',
      level: 'red',
      detail: `近 12 个月累计变更 ${recent.length} 次`,
    });
  }

  const legalPersonChanges = recent.filter(
    (change) => change.type === '法定代表人变更',
  ).length;
  if (legalPersonChanges >= 2) {
    flags.push({
      code: 'FREQUENT_LEGAL_PERSON',
      label: '短期频繁更换法定代表人',
      level: 'red',
      detail: `近 12 个月法定代表人变更 ${legalPersonChanges} 次`,
    });
  }

  const shareholderChanges = recent.filter(
    (change) => change.type === '股东变更',
  ).length;
  if (shareholderChanges >= 3) {
    flags.push({
      code: 'FREQUENT_SHAREHOLDER',
      label: '股东频繁变更',
      level: 'yellow',
      detail: `近 12 个月股东变更 ${shareholderChanges} 次`,
    });
  }

  return flags;
}
