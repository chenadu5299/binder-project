/**
 * 统一内容摘要标签：
 * - 中文按 5 个全宽字符近似
 * - ASCII / 半宽字符按 0.5 宽度计算，约等于 10 个英文字符
 * - 标题/标签一律基于内容摘要，不再以行号作为主命名
 */

function normalizeSourceText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function charDisplayUnits(ch: string): number {
  return /^[\u0000-\u00ff]$/.test(ch) ? 0.5 : 1;
}

export function clipContentLabel(
  text: string,
  options?: {
    maxUnits?: number;
    ellipsis?: string;
  },
): string {
  const normalized = normalizeSourceText(text);
  if (!normalized) return '';

  const maxUnits = options?.maxUnits ?? 5;
  const ellipsis = options?.ellipsis ?? '…';

  let used = 0;
  let result = '';
  let truncated = false;

  for (const ch of normalized) {
    const nextUnits = charDisplayUnits(ch);
    if (used + nextUnits > maxUnits) {
      truncated = true;
      break;
    }
    result += ch;
    used += nextUnits;
  }

  if (!result) {
    return normalized.slice(0, 1);
  }

  return truncated ? `${result}${ellipsis}` : result;
}

export function buildContentLabel(
  primaryText: string | null | undefined,
  fallbackText: string,
  options?: {
    maxUnits?: number;
  },
): string {
  const primary = typeof primaryText === 'string' ? clipContentLabel(primaryText, options) : '';
  if (primary) return primary;
  return clipContentLabel(fallbackText, options) || fallbackText;
}

