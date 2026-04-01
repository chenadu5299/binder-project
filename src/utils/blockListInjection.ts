/**
 * 块列表注入收口工具：
 * - 若内容已含 data-block-id，保持原样透传
 * - 若缺失 data-block-id，按段落注入 block-ws-{uuid}，确保后端可构建 block_map
 */

export interface BlockListInjectionResult {
  html: string;
  injected: boolean;
  blockCount: number;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function makeBlockWsId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `block-ws-${crypto.randomUUID()}`;
  }
  return `block-ws-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function hasBlockIds(html: string): boolean {
  return /data-block-id\s*=\s*["'][^"']+["']/i.test(html);
}

function estimateBlockCount(html: string): number {
  const matches = html.match(/data-block-id\s*=\s*["'][^"']+["']/gi);
  return matches?.length ?? 0;
}

function splitParagraphs(raw: string): string[] {
  const normalized = raw
    .replace(/\r\n?/g, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h1|h2|h3|h4|h5|h6)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\u00a0/g, ' ')
    .trim();
  if (!normalized) {
    return [];
  }
  return normalized
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);
}

function toInjectedParagraphHtml(paragraphs: string[]): string {
  return paragraphs
    .map((paragraph) => {
      const safe = escapeHtml(paragraph).replace(/\n/g, '<br />');
      return `<p data-block-id="${makeBlockWsId()}">${safe}</p>`;
    })
    .join('\n');
}

export function normalizeHtmlForBlockListInjection(inputHtml: string | null | undefined): BlockListInjectionResult {
  const html = (inputHtml ?? '').trim();
  if (!html) {
    return { html: '', injected: false, blockCount: 0 };
  }

  if (hasBlockIds(html)) {
    return {
      html,
      injected: false,
      blockCount: estimateBlockCount(html),
    };
  }

  const paragraphs = splitParagraphs(html);
  if (paragraphs.length === 0) {
    return {
      html,
      injected: false,
      blockCount: 0,
    };
  }

  return {
    html: toInjectedParagraphHtml(paragraphs),
    injected: true,
    blockCount: paragraphs.length,
  };
}
