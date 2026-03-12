/**
 * 块遍历常量（与《文档定位系统方案》一致）
 * 所有块遍历逻辑共用，确保前后端、Diff、引用等场景一致
 */

/** 可定位块类型（与 BlockIdExtension 一致） */
export const BLOCK_NODE_NAMES = new Set([
  'paragraph',
  'heading',
  'blockquote',
  'codeBlock',
  'listItem',
  'tableCell',
]);

/** 必须排除的节点类型（分页、根节点等，不参与块计数与定位） */
export const EXCLUDED_NODE_NAMES = new Set([
  'doc',
  'rm-page-break',
  'rm-with-pagination',
  'rm-pagination-gap',
]);

/** 块间分隔符（与前端 getDocTextWithNewlines、后端块文本一致） */
export const BLOCK_SEPARATOR = '\n';
