/**
 * 对定位真源 L（或任意 UTF-8 正文）做 SHA-256，供 diff 元数据 contentSnapshotHash（P5 / §九）
 */
export async function sha256HexUtf8(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Accept 前门禁：当前编辑器 HTML（须与注入 L 同源，如 serializeForPositioning）与快照哈希一致。
 * 未记录快照哈希时放行（兼容旧 diff / workspace 路径）。
 */
export async function editorMatchesContentSnapshot(
  currentHtml: string,
  snapshotHash: string | undefined | null
): Promise<boolean> {
  if (snapshotHash == null || snapshotHash === '') return true;
  const h = await sha256HexUtf8(currentHtml);
  return h === snapshotHash;
}

/** 文档顺序下所有 `data-block-id` 的序列指纹（与 Resolver 块序一致），用于补充「HTML 字节相同但块树已变」的 Accept 门禁 */
export async function blockOrderSnapshotHashFromHtml(html: string): Promise<string> {
  if (typeof document === 'undefined') {
    return await sha256HexUtf8('');
  }
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const els = doc.querySelectorAll('[data-block-id]');
  const ids: string[] = [];
  els.forEach((el) => {
    const id = el.getAttribute('data-block-id');
    if (id) ids.push(id);
  });
  return sha256HexUtf8(ids.join('\u001e'));
}

/** Accept 前：当前编辑器 HTML 的块序指纹须与生成 diff 时一致（未记录则放行） */
export async function editorMatchesBlockOrderSnapshot(
  currentHtml: string,
  snapshotHash: string | undefined | null
): Promise<boolean> {
  if (snapshotHash == null || snapshotHash === '') return true;
  const h = await blockOrderSnapshotHashFromHtml(currentHtml);
  return h === snapshotHash;
}
