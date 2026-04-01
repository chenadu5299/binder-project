/**
 * 定位真源 L：有 filePath 时使用逻辑状态（baseline + 已接受 diffs），与 ai_chat_stream 注入及 P5 门禁一致。
 * 无 filePath 时等价于 editor.getHTML()（兼容仅持有 Editor 实例的调用方）。
 */
import type { Editor } from '@tiptap/react';
import { getLogicalContent } from '../stores/diffStore';

export function serializeForPositioning(editor: Editor, filePath?: string | null): string {
  if (filePath) {
    // getLogicalContent 已知边界（与 diffStore / sendMessage 协作）：
    // - baseline 由业务在适当时机 setBaseline(filePath, html) 写入；常见为每轮 sendMessage 与 RequestContext.L 对齐，用于「逻辑态」重放与快照哈希。
    // - 仅将 baselineSetAt 之后、status===accepted 的 diff 按 acceptedAt 正序重放到 baseline 上；pending/rejected/expired 不参与，故结果不含未接受修改。
    // - 若某 filePath 尚无 baseline，getLogicalContent 退回 editor.getHTML()（与旧行为一致）。
    // - 若编辑器仍显示 pending 装饰而序列化结果已是逻辑态，字节可与「纯 getHTML 显示态」不同；P5 contentSnapshotHash 门禁依赖与入库时 old_content 同源策略。
    return getLogicalContent(editor, filePath);
  }
  return editor.getHTML();
}
