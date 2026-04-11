# 分页功能说明

## 文档头

- 结构编码：`ED-M-R-08`
- 文档属性：`参考`
- 主责模块：`ED`
- 文档职责：`分页功能说明 / 参考、研究或索引文档`
- 上游约束：`CORE-C-D-04`, `SYS-C-T-01`, `WS-M-T-01`, `ED-M-T-01`
- 直接承接：无
- 接口耦合：`WS-M-T-01`, `SYS-I-P-01`, `ENG-X-T-01`
- 汇聚影响：`CORE-C-R-01`, `ED-M-T-01`
- 扩散检查：`ED-M-T-02`, `ED-M-T-03`, `ED-M-T-04`, `ED-M-T-05`, `ED-M-T-06`
- 使用边界：`仅作参考，不直接替代主结构文档、协议文档和执行文档`
- 变更要求：`修改本文后，必须复核：上游约束、直接承接、接口耦合、汇聚影响、扩散检查文档`

---
> 本文档描述 Binder 编辑器中 T-DOCX 分页编辑功能的**当前实现状态**，供开发与维护参考。

---

## 一、功能概述

| 项目 | 说明 |
|------|------|
| **作用范围** | 仅 DOCX 编辑模式（`.docx`、`.draft.docx`、`.doc`、`.odt`、`.rtf` 可编辑时） |
| **技术方案** | tiptap-pagination-plus 扩展 + 定制 |
| **布局模式** | `layoutMode='page'` 时启用分页，其他文件类型为 `layoutMode='flow'` 流式布局 |

---

## 二、实现状态

| 功能 | 状态 | 说明 |
|------|------|------|
| 分页扩展 | ✅ | PaginationPlus 在 `layoutMode='page'` 时启用，A4 默认 794×1123px |
| 页码导航 | ✅ | 工具栏内显示 ◀ 当前页/总页数 ▶，多页时显示，随滚动实时更新 |
| 页面尺寸 | ✅ | PageSizeDropdown：A4/A3/Letter 竖排/横排 |
| 页边距 | ✅ | MarginsModal：上下、左右边距可调（0–200px） |
| 编辑窗口缩放 | ✅ | 50%–150%，CSS transform scale，支持横向滚动 |
| 背景色 | ✅ | 纸张内白色，外部/页缝淡灰 `#f0f0f0` |
| 光标与遮罩 | ✅ | PageTopCaretExtension 模拟光标，PaginationPlus 内置遮罩 |
| 文字遮挡修复 | ✅ | 容器 overflow-visible，EditorContent 无水平 padding |

---

## 三、组件与代码路径

### 3.1 核心组件

| 组件 | 路径 | 职责 |
|------|------|------|
| TipTapEditor | `src/components/Editor/TipTapEditor.tsx` | layoutMode、PaginationPlus 配置、PageTopCaretExtension |
| EditorToolbar | `src/components/Editor/EditorToolbar.tsx` | 页码导航、缩放、PageSizeDropdown、MarginsModal |
| EditorPanel | `src/components/Editor/EditorPanel.tsx` | zoom 容器、T-DOCX 淡灰背景、layoutMode 传递 |
| usePaginationFromEditor | `src/hooks/usePaginationFromEditor.ts` | currentPage、totalPages、scrollToPage |
| PageSizeDropdown | `src/components/Editor/PageSizeDropdown.tsx` | 页面尺寸切换（A4/A3/Letter 竖/横） |
| MarginsModal | `src/components/Editor/MarginsModal.tsx` | 页边距弹窗 |
| PageTopCaretExtension | `src/components/Editor/extensions/PageTopCaretExtension.ts` | 分页模式模拟光标 |

### 3.2 辅助组件

| 组件 | 路径 | 说明 |
|------|------|------|
| PageNavigator | `src/components/Editor/PageNavigator.tsx` | 通用页码导航 UI（含输入框），可被 DocxPageNavigator 复用 |
| DocxPageNavigator | `src/components/Editor/DocxPageNavigator.tsx` | 封装 usePaginationFromEditor + PageNavigator，当前未在 EditorPanel 中使用（页码已集成到 EditorToolbar） |

### 3.3 样式与状态

| 位置 | 说明 |
|------|------|
| `index.css` | `.rm-with-pagination` 白色、`.ProseMirror` 无 outline、`.rm-page-top-caret` |
| layoutStore | `editor.zoom` 存储缩放比例 |

---

## 四、布局与滚动

- **滚动容器**：分页模式下所有滚动由 `editor-zoom-scroll` 统一处理
- **缩放实现**：`width=794*(zoom/100)` 使 scrollWidth 正确；内层 `transform: scale()` 实现视觉缩放
- **当前页检测**：`usePaginationFromEditor` 从 `[data-rm-pagination]` 下的 `.rm-page-break` 获取页信息，以滚动容器视口中心所在页为准

详见：`R-ED-M-R-09_分页布局逻辑梳理.md`

---

## 五、光标与遮罩

分页模式下跨页长光标会露出，通过以下方式处理：

- **方案 A**：PageTopCaretExtension 全篇模拟光标，隐藏原生光标
- **方案 B**：PaginationPlus 内置页顶/页底遮罩

详见：`R-ED-M-R-10_分页模式光标与遮罩完整方案.md`

---

## 六、相关文档

| 文档 | 内容 |
|------|------|
| **R-ED-M-R-09_分页布局逻辑梳理.md** | 容器层级、overflow、滚动、当前页检测 |
| **R-ED-M-R-10_分页模式光标与遮罩完整方案.md** | 模拟光标、遮罩、缩放依赖 |
| **R-ED-M-R-07_T-DOCX编辑器分页模式优化方案.md** | 方案选型、稳定性分析、历史任务拆解 |

---

## 七、构建与开发

```bash
# 分页扩展为本地依赖，构建时自动包含
npm run build

# 仅构建分页扩展（如需单独验证）
npm run build:pagination
```