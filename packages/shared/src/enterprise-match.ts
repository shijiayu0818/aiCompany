// 企业名匹配：从自然语言查询中解析目标企业
// 用于 Mock 数据与企查查返回的企业列表，兼容全称、简称、括号地名等写法
import type { Enterprise } from './types';

/**
 * 取企业简称核心名：去掉括号内容与组织形式后缀
 * 例：阿里巴巴（中国）有限公司 → 阿里巴巴；星辰智能科技集团 → 星辰智能科技
 */
function coreName(name: string): string {
  return name
    .replace(/[（(][^）)]*[）)]/g, '')
    .replace(/(股份有限公司|有限责任公司|有限公司|集团|控股|公司)$/, '')
    .trim();
}

/**
 * 按查询文本匹配最佳企业
 * 优先级：全名精确匹配 > 全名包含于查询 > 查询包含于全名 > 简称核心名包含于查询
 */
export function matchEnterpriseByQuery(
  query: string,
  enterprises: Enterprise[],
): Enterprise | undefined {
  const q = query.trim();
  if (!q) return undefined;

  const exact = enterprises.find((c) => c.name === q);
  if (exact) return exact;

  const byFullName = enterprises.find((c) => q.includes(c.name));
  if (byFullName) return byFullName;

  if (q.length >= 2) {
    const byPartialName = enterprises.find((c) => c.name.includes(q));
    if (byPartialName) return byPartialName;
  }

  return enterprises.find((c) => {
    const core = coreName(c.name);
    return core.length >= 2 && q.includes(core);
  });
}
