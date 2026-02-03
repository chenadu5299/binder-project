# Excel 编辑模式技术方案详细分析

## 一、Excel 文件复杂性分析

### 1.1 Excel 核心特性

**数据结构特性：**
- ✅ **单元格数据**：文本、数字、日期、公式
- ✅ **单元格格式**：字体、颜色、对齐、边框、背景色
- ✅ **行高列宽**：可调整的行高和列宽
- ✅ **合并单元格**：跨行跨列的单元格合并
- ⚠️ **公式计算**：复杂的公式系统（SUM、IF、VLOOKUP 等）
- ⚠️ **多工作表**：一个文件包含多个工作表（Sheet）
- ⚠️ **图表**：各种图表类型（柱状图、折线图、饼图等）
- ⚠️ **数据验证**：下拉列表、数据范围限制
- ⚠️ **条件格式**：基于条件的自动格式化
- ⚠️ **数据透视表**：复杂的数据分析功能
- ⚠️ **宏和 VBA**：自动化脚本

### 1.2 与 DOCX 的对比

| 特性 | DOCX | Excel |
|------|------|-------|
| 主要结构 | 段落、标题、列表 | 单元格、工作表 |
| 格式复杂度 | 中等（样式、对齐） | 高（公式、图表、多表） |
| 编辑难度 | 低（富文本编辑） | 高（需要专业编辑器） |
| 转换难度 | 低（Pandoc 支持） | 高（需要 LibreOffice） |
| 数据完整性 | 高（文本为主） | 中（公式可能丢失） |

## 二、技术方案对比

### 2.1 方案A：LibreOffice + ODS + HTML 表格（推荐）

**技术路线：**
```
XLSX → LibreOffice → ODS → HTML表格 → TipTap编辑器 → HTML → ODS → XLSX
```

**实现步骤：**

1. **打开编辑模式：**
   - 使用 LibreOffice 将 XLSX 转换为 ODS（OpenDocument Spreadsheet）
   - 使用 LibreOffice 将 ODS 转换为 HTML（表格格式）
   - 在 TipTap 编辑器中编辑 HTML 表格

2. **保存编辑：**
   - 将 TipTap 编辑器的 HTML 表格转换为 ODS
   - 使用 LibreOffice 将 ODS 转换回 XLSX

**优势：**
- ✅ 复用现有 LibreOffice 基础设施
- ✅ ODS 是开放格式，转换稳定
- ✅ HTML 表格在 TipTap 中编辑体验好
- ✅ 技术风险低（LibreOffice 已集成）

**劣势：**
- ⚠️ 可能丢失复杂功能（公式、图表、多工作表）
- ⚠️ 需要处理 ODS 格式转换

**适用场景：**
- 简单表格编辑（数据录入、格式调整）
- 不需要公式和图表的基础编辑

### 2.2 方案B：LibreOffice + CSV（简化方案）

**技术路线：**
```
XLSX → LibreOffice → CSV → 文本编辑器 → CSV → LibreOffice → XLSX
```

**实现步骤：**

1. **打开编辑模式：**
   - 使用 LibreOffice 将 XLSX 转换为 CSV
   - 在文本编辑器中编辑 CSV（或转换为 HTML 表格显示）

2. **保存编辑：**
   - 将编辑后的 CSV 转换回 XLSX

**优势：**
- ✅ 实现简单，技术风险极低
- ✅ CSV 格式简单，易于处理
- ✅ 适合纯数据编辑场景

**劣势：**
- ❌ 完全丢失格式（颜色、字体、边框等）
- ❌ 丢失公式（转换为计算结果）
- ❌ 丢失图表和多工作表
- ❌ 用户体验差（纯文本编辑）

**适用场景：**
- 仅数据录入，不需要格式
- 作为降级方案（复杂文件无法编辑时）

### 2.3 方案C：集成专业表格编辑器（Luckysheet/SpreadJS）

**技术路线：**
```
XLSX → 解析为 JSON → Luckysheet → JSON → XLSX
```

**实现步骤：**

1. **打开编辑模式：**
   - 使用 Rust 库（如 `calamine`）解析 XLSX
   - 转换为 Luckysheet 的 JSON 格式
   - 在 Luckysheet 中编辑

2. **保存编辑：**
   - 将 Luckysheet JSON 转换回 XLSX

**优势：**
- ✅ 功能完整（支持公式、图表、多工作表）
- ✅ 用户体验好（专业表格编辑器）
- ✅ 支持复杂 Excel 功能

**劣势：**
- ❌ 工作量大（需要深度集成）
- ❌ 依赖第三方库（增加包体积）
- ❌ 技术复杂度高
- ❌ 可能影响应用稳定性

**适用场景：**
- 需要完整 Excel 功能
- 长期规划的高级功能

### 2.4 方案D：LibreOffice + 多工作表处理（折中方案）

**技术路线：**
```
XLSX → LibreOffice → 多个HTML表格（每个工作表一个） → TipTap编辑器（多标签） → HTML → ODS → XLSX
```

**实现步骤：**

1. **打开编辑模式：**
   - 使用 LibreOffice 将 XLSX 转换为 ODS
   - 解析 ODS，提取每个工作表
   - 每个工作表转换为独立的 HTML 表格
   - 在 TipTap 编辑器中，每个工作表一个标签页

2. **保存编辑：**
   - 将多个 HTML 表格合并为 ODS
   - 使用 LibreOffice 转换回 XLSX

**优势：**
- ✅ 支持多工作表
- ✅ 复用现有技术栈
- ✅ 用户体验较好（多标签页）

**劣势：**
- ⚠️ 仍可能丢失公式和图表
- ⚠️ 需要处理 ODS 解析和合并

**适用场景：**
- 需要多工作表支持
- 不需要复杂公式和图表

## 三、基于 AI 工具调用能力的功能评估

### 3.1 AI 工具调用能力分析

**AI 可用的工具：**
- ✅ `read_file`：读取文件内容（可读取 HTML 表格）
- ✅ `edit_current_editor_document`：编辑当前编辑器中的文档（HTML 格式）
- ✅ `update_file`：更新文件内容
- ✅ `create_file`：创建新文件

**AI 操作表格的方式：**
1. **读取表格**：通过 `read_file` 读取 HTML 表格内容
2. **理解表格结构**：AI 可以理解 HTML 表格标签（`<table>`, `<tr>`, `<td>`, `<th>` 等）
3. **修改表格**：通过 `edit_current_editor_document` 修改 HTML 表格内容
4. **保存表格**：通过 `update_file` 保存修改后的 HTML，然后转换回 Excel

**AI 无法操作的功能：**
- ❌ 复杂的 Excel 公式（AI 无法理解公式语法）
- ❌ 图表（图表是二进制对象，无法通过 HTML 表示）
- ❌ 数据透视表（复杂的数据结构）
- ❌ 数据验证（Excel 特有的功能）
- ❌ 条件格式（复杂的规则系统）
- ❌ 宏和 VBA（代码执行）

### 3.2 基于 AI 能力的表格功能需求

#### P0 功能（AI 可以操作，必须支持）

**通过 HTML 表格，AI 可以：**
- ✅ **单元格文本编辑**：修改 `<td>` 标签内的文本
- ✅ **插入/删除行**：添加/删除 `<tr>` 标签
- ✅ **插入/删除列**：在每行中添加/删除 `<td>` 标签
- ✅ **合并单元格**：使用 `rowspan` 和 `colspan` 属性
- ✅ **基础格式**：通过内联样式（`style` 属性）设置字体、颜色、对齐
- ✅ **表格边框**：通过 CSS 样式设置边框
- ✅ **背景色**：通过 CSS 样式设置背景色
- ✅ **表头**：使用 `<th>` 标签区分表头

**HTML 表格示例（AI 可以理解和修改）：**
```html
<table style="border-collapse: collapse; width: 100%;">
  <thead>
    <tr>
      <th style="border: 1px solid #000; padding: 8px; background-color: #f0f0f0;">姓名</th>
      <th style="border: 1px solid #000; padding: 8px; background-color: #f0f0f0;">年龄</th>
      <th style="border: 1px solid #000; padding: 8px; background-color: #f0f0f0;">城市</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="border: 1px solid #000; padding: 8px;">张三</td>
      <td style="border: 1px solid #000; padding: 8px;">25</td>
      <td style="border: 1px solid #000; padding: 8px;">北京</td>
    </tr>
    <tr>
      <td style="border: 1px solid #000; padding: 8px;">李四</td>
      <td style="border: 1px solid #000; padding: 8px;">30</td>
      <td style="border: 1px solid #000; padding: 8px;">上海</td>
    </tr>
  </tbody>
</table>
```

#### P1 功能（AI 可以部分操作，尽量支持）

**多工作表支持：**
- ⚠️ **方案**：每个工作表转换为独立的 HTML 表格
- ⚠️ **AI 操作**：AI 可以读取和修改每个 HTML 表格
- ⚠️ **限制**：AI 需要知道当前操作哪个工作表（通过文件路径或标签页）

**数字格式：**
- ⚠️ **方案**：在 HTML 中保留数字格式信息（通过 `data-*` 属性或样式）
- ⚠️ **AI 操作**：AI 可以修改数字，但可能不理解格式规则
- ⚠️ **建议**：转换为文本显示，AI 可以修改文本

#### P2 功能（AI 可以操作，需要特殊处理）

**公式功能（重新评估后支持）：**
- ✅ **基础公式**：AI 可以理解常见公式语法（SUM, AVERAGE, IF, VLOOKUP 等）
- ✅ **公式表示**：使用 `data-formula` 属性在 HTML 表格中保留公式
- ✅ **AI 操作**：AI 可以读取、修改和创建公式
- ⚠️ **限制**：复杂嵌套公式（>10层）、数组公式、动态数组不支持
- 📝 **详细分析**：参见 `Excel公式功能AI支持分析.md`

#### P3 功能（AI 无法操作，明确不支持）

**这些功能 AI 无法通过 HTML 表格操作，因此不需要支持：**
- ❌ **图表**：图表是二进制对象，无法通过 HTML 表示
- ❌ **数据透视表**：复杂的数据结构，AI 无法理解
- ❌ **数据验证**：Excel 特有的功能，HTML 表格无法表示
- ❌ **条件格式**：复杂的规则系统，AI 无法理解
- ❌ **宏和 VBA**：代码执行，AI 无法操作
- ❌ **工作表保护**：Excel 特有的安全功能

### 3.3 功能简化策略（基于 AI 能力）

**核心原则：**
> **如果 AI 无法通过工具调用操作的功能，就不需要支持**

**功能分级：**

**P0（必须支持）- AI 可以完全操作：**
- ✅ 单元格文本编辑
- ✅ 插入/删除行和列
- ✅ 合并/拆分单元格
- ✅ 基础格式（字体、颜色、对齐、边框、背景色）
- ✅ 表头支持
- ✅ 单工作表编辑

**P1（尽量支持）- AI 可以部分操作：**
- ⚠️ 多工作表支持（每个工作表独立 HTML 表格）
- ⚠️ 数字格式（转换为文本，AI 可以修改）

**P2（支持，需要特殊处理）- AI 可以操作：**
- ✅ 基础公式（SUM, AVERAGE, IF, VLOOKUP 等）- 使用 `data-formula` 属性
- ⚠️ 复杂嵌套公式（3-5层支持，>10层不支持）
- ⚠️ 查找函数（需要多工作表支持）

**P3（不支持）- AI 无法操作：**
- ❌ 图表、数据透视表、数据验证、条件格式、宏和 VBA

### 3.4 AI 工具调用示例

**AI 修改表格的典型流程：**

1. **读取表格**：
```json
{
  "tool": "read_file",
  "arguments": {
    "path": "data.xlsx"
  }
}
```
返回：HTML 表格内容

2. **理解表格结构**：
AI 分析 HTML 表格，识别：
- 表头行（`<th>`）
- 数据行（`<tr>`）
- 单元格内容（`<td>`）
- 格式信息（`style` 属性）

3. **修改表格**：
```json
{
  "tool": "edit_current_editor_document",
  "arguments": {
    "content": "<table>...</table>",
    "instruction": "在表格中添加一行新数据：王五，28，深圳"
  }
}
```

4. **保存表格**：
系统自动将 HTML 转换回 Excel 格式

**AI 可以执行的表格操作示例：**
- "在表格第一行添加表头：姓名、年龄、城市"
- "删除表格中年龄大于 30 的行"
- "将表格中所有城市为'北京'的行的背景色改为黄色"
- "合并表格第一列的前三个单元格"
- "在表格末尾添加一行：赵六，35，广州"

### 3.4 用户提示策略

**编辑模式警告：**
```
⚠️ Excel 编辑模式限制：
- ✅ 支持：单元格编辑、行列操作、基础格式
- ⚠️ 部分支持：多工作表、简单公式
- ❌ 不支持：复杂公式、图表、数据透视表

编辑后，不支持的功能将被保留（不丢失），但无法在编辑器中修改。
```

## 四、基于 AI 能力的最终功能需求

### 4.1 核心原则

**设计原则：**
> **只支持 AI 可以通过工具调用操作的功能**

**理由：**
- Binder 是 AI 原生应用，核心价值是 AI 辅助编辑
- 如果功能无法被 AI 操作，用户需要手动编辑，失去了 AI 原生的优势
- 简化功能可以降低技术复杂度，提高稳定性

### 4.2 最终功能清单

#### 必须支持的功能（P0）- AI 可以完全操作

| 功能 | AI 操作方式 | HTML 表格支持 | 优先级 |
|------|------------|--------------|--------|
| 单元格文本编辑 | 修改 `<td>` 内容 | ✅ 完全支持 | P0 |
| 插入行 | 添加 `<tr>` 标签 | ✅ 完全支持 | P0 |
| 删除行 | 删除 `<tr>` 标签 | ✅ 完全支持 | P0 |
| 插入列 | 在每行添加 `<td>` | ✅ 完全支持 | P0 |
| 删除列 | 在每行删除 `<td>` | ✅ 完全支持 | P0 |
| 合并单元格 | 使用 `rowspan`/`colspan` | ✅ 完全支持 | P0 |
| 拆分单元格 | 移除 `rowspan`/`colspan` | ✅ 完全支持 | P0 |
| 字体格式 | `style="font-family: ..."` | ✅ 完全支持 | P0 |
| 字体大小 | `style="font-size: ..."` | ✅ 完全支持 | P0 |
| 字体颜色 | `style="color: ..."` | ✅ 完全支持 | P0 |
| 背景色 | `style="background-color: ..."` | ✅ 完全支持 | P0 |
| 文本对齐 | `style="text-align: ..."` | ✅ 完全支持 | P0 |
| 表格边框 | `style="border: ..."` | ✅ 完全支持 | P0 |
| 表头支持 | 使用 `<th>` 标签 | ✅ 完全支持 | P0 |
| 单元格内边距 | `style="padding: ..."` | ✅ 完全支持 | P0 |

#### 尽量支持的功能（P1）- AI 可以部分操作

| 功能 | AI 操作方式 | HTML 表格支持 | 优先级 |
|------|------------|--------------|--------|
| 多工作表 | 每个工作表独立 HTML 表格 | ⚠️ 部分支持 | P1 |
| 数字格式 | 转换为文本显示 | ⚠️ 部分支持 | P1 |
| 行高列宽 | CSS `height`/`width` | ⚠️ 部分支持 | P1 |

#### 不支持的功能（P2）- AI 无法操作

| 功能 | AI 操作方式 | HTML 表格支持 | 优先级 |
|------|------------|--------------|--------|
| **基础公式** | 通过 `data-formula` 属性 | ✅ 完全支持 | P2（支持） |
| SUM, AVERAGE, IF | AI 可以理解和修改 | ✅ 完全支持 | P2（支持） |
| VLOOKUP, INDEX | AI 可以理解（需多工作表） | ⚠️ 部分支持 | P2（支持） |
| 嵌套公式（3-5层） | AI 可以理解 | ⚠️ 部分支持 | P2（支持） |
| 数组公式 | AI 难以理解 | ❌ 不支持 | P3（不支持） |
| 动态数组 | AI 难以理解 | ❌ 不支持 | P3（不支持） |
| 图表 | 无法通过 HTML 表示 | ❌ 不支持 | P3（不支持） |
| 数据透视表 | 复杂数据结构 | ❌ 不支持 | P3（不支持） |
| 数据验证 | Excel 特有功能 | ❌ 不支持 | P3（不支持） |
| 条件格式 | 复杂规则系统 | ❌ 不支持 | P3（不支持） |
| 宏和 VBA | 代码执行 | ❌ 不支持 | P3（不支持） |
| 工作表保护 | Excel 特有安全功能 | ❌ 不支持 | P3（不支持） |

### 4.3 AI 工具调用场景示例

**场景1：添加表格行**
```
用户："在表格末尾添加一行：产品D，价格500，库存20"

AI 操作：
1. read_file("data.xlsx") → 获取 HTML 表格
2. 分析表格结构，找到最后一行
3. edit_current_editor_document({
     content: "<table>...<tr><td>产品D</td><td>500</td><td>20</td></tr></table>",
     instruction: "在表格末尾添加新行"
   })
4. 系统自动保存并转换回 Excel
```

**场景2：修改单元格格式**
```
用户："将表格中所有价格列的背景色改为黄色"

AI 操作：
1. read_file("data.xlsx") → 获取 HTML 表格
2. 识别价格列（可能是第二列）
3. edit_current_editor_document({
     content: "<table>...<td style='background-color: yellow'>...</td>...</table>",
     instruction: "将价格列背景色改为黄色"
   })
4. 系统自动保存并转换回 Excel
```

**场景3：合并单元格**
```
用户："合并表格第一行的前三个单元格作为标题"

AI 操作：
1. read_file("data.xlsx") → 获取 HTML 表格
2. 识别第一行，前三个单元格
3. edit_current_editor_document({
     content: "<table><tr><th colspan='3'>标题</th>...</tr>...</table>",
     instruction: "合并第一行前三个单元格"
   })
4. 系统自动保存并转换回 Excel
```

### 4.4 技术实现要求

**HTML 表格格式要求：**
- 必须使用标准的 HTML 表格标签（`<table>`, `<tr>`, `<td>`, `<th>`）
- 格式信息必须通过内联样式（`style` 属性）表示，便于 AI 理解和修改
- 合并单元格必须使用 `rowspan` 和 `colspan` 属性
- 表头必须使用 `<th>` 标签，便于 AI 识别
- **公式信息必须通过 `data-formula` 属性保留**，例如：
  ```html
  <td data-formula="=SUM(A1:A10)" data-value="100">100</td>
  ```

**转换要求：**
- Excel → HTML：保留所有 AI 可操作的格式信息
- HTML → Excel：正确还原格式信息
- 不支持的功能：在转换时保留原文件中的内容（不丢失），但不在编辑器中显示

## 五、推荐方案：方案A + AI 能力评估

### 5.1 技术实现

**Phase 1：基础编辑（MVP）**

1. **后端实现（Rust）：**
```rust
// 1. Excel → ODS 转换
pub fn convert_excel_to_ods(&self, excel_path: &Path) -> Result<PathBuf, String> {
    // 使用 LibreOffice：soffice --headless --convert-to ods file.xlsx
}

// 2. ODS → HTML 转换（提取第一个工作表）
pub fn convert_ods_to_html(&self, ods_path: &Path) -> Result<String, String> {
    // 使用 LibreOffice：soffice --headless --convert-to html file.ods
    // 或使用 Rust 库解析 ODS（如 ods-reader）
}

// 3. HTML → ODS 转换
pub fn convert_html_to_ods(&self, html_content: &str, ods_path: &Path) -> Result<(), String> {
    // 使用 LibreOffice：soffice --headless --convert-to ods file.html
}

// 4. ODS → Excel 转换
pub fn convert_ods_to_excel(&self, ods_path: &Path, excel_path: &Path) -> Result<(), String> {
    // 使用 LibreOffice：soffice --headless --convert-to xlsx file.ods
}
```

2. **前端实现（TypeScript）：**
```typescript
// 1. 文件类型扩展
export type FileType = 
  | 'markdown' | 'text' | 'docx' | 'html' | 'pdf' | 'image'
  | 'excel';  // 新增

// 2. 打开策略
excel: {
  new: { fileType: 'excel', source: 'new', canEdit: true, previewMode: false, requiresConversion: true },
  external: { fileType: 'excel', source: 'external', canEdit: false, previewMode: true, requiresConversion: true },
  ai_generated: { fileType: 'excel', source: 'ai_generated', canEdit: true, previewMode: false, requiresConversion: true },
}

// 3. 编辑模式打开
case 'excel': {
  if (requiresConversion) {
    const isReadOnly = previewMode && !forceEdit && !isDraft;
    
    if (isReadOnly) {
      // 预览模式：转换为 PDF
      useEditorStore.getState().addTab(filePath, fileName, '', true, isDraft, lastModifiedTime);
    } else {
      // 编辑模式：转换为 HTML 表格
      const htmlContent = await invoke<string>('open_excel_for_edit', { path: filePath });
      useEditorStore.getState().addTab(filePath, fileName, htmlContent, false, isDraft, lastModifiedTime);
    }
  }
  break;
}

// 4. 保存
if (ext === 'xlsx' || ext === 'xls') {
  await invoke('save_excel', { path: filePath, htmlContent: content });
}
```

**Phase 2：功能增强（后续版本）**

1. **多工作表支持：**
   - 解析 ODS，提取所有工作表
   - 每个工作表一个标签页
   - 保存时合并多个工作表

2. **基础公式支持：**
   - 检测简单公式（SUM、AVERAGE、COUNT）
   - 转换为计算结果显示
   - 保存时尝试保留公式（如果可能）

### 4.2 技术难点与解决方案

**难点1：ODS 格式解析**
- **问题**：ODS 是 ZIP 压缩的 XML 文件，需要解析
- **解决**：使用 Rust 库 `zip` 和 `quick-xml` 解析，或直接使用 LibreOffice 转换

**难点2：HTML 表格到 ODS 转换**
- **问题**：HTML 表格需要转换为 ODS 格式
- **解决**：使用 LibreOffice 的 HTML → ODS 转换功能

**难点3：公式丢失**
- **问题**：HTML 表格无法保留 Excel 公式
- **解决**：
  - 明确告知用户限制
  - 尝试在转换时检测公式，转换为计算结果
  - 保存时保留原文件的公式（如果未修改相关单元格）

**难点4：多工作表处理**
- **问题**：Excel 文件可能包含多个工作表
- **解决**：
  - MVP：仅处理第一个工作表
  - 后续：解析 ODS 提取所有工作表，多标签页显示

**难点5：格式丢失**
- **问题**：HTML 表格可能丢失部分格式
- **解决**：
  - 保留基础格式（字体、颜色、对齐、边框）
  - 明确告知用户不支持的功能

### 4.3 稳定性保障

**1. 错误处理：**
```rust
// 转换失败时的降级方案
if convert_to_html_failed {
    // 降级到 CSV 方案
    let csv_content = convert_to_csv(excel_path)?;
    return Ok(format_csv_as_html_table(csv_content));
}
```

**2. 数据完整性：**
- 转换前备份原文件
- 转换失败时恢复原文件
- 保存前验证数据完整性

**3. 性能优化：**
- 缓存转换结果（类似 DOCX 的缓存机制）
- 大文件分块处理
- 异步转换，不阻塞 UI

**4. 用户提示：**
- 编辑前显示功能限制警告
- 转换失败时提供清晰的错误信息
- 保存时提示可能丢失的功能

## 五、实施计划

### 5.4 MVP 1.0 范围（基于 AI 能力）

**必须实现（AI 可以完全操作）：**
- ✅ Excel 预览模式（PDF 转换）
- ✅ Excel 基础编辑模式（单工作表、HTML 表格）
- ✅ 单元格文本编辑（AI 可以修改 `<td>` 内容）
- ✅ 插入/删除行和列（AI 可以添加/删除 `<tr>` 和 `<td>`）
- ✅ 合并/拆分单元格（AI 可以修改 `rowspan`/`colspan`）
- ✅ 基础格式（字体、颜色、对齐、边框、背景色，通过内联样式）
- ✅ 表头支持（使用 `<th>` 标签，AI 可以识别）
- ✅ 明确的功能限制提示（告知用户 AI 无法操作的功能）

**不实现（AI 无法操作）：**
- ❌ 多工作表支持（Phase 2，需要特殊处理）
- ❌ 数组公式和动态数组（AI 难以理解）
- ❌ 图表支持（无法通过 HTML 表示）
- ❌ 数据透视表（复杂数据结构）
- ❌ 数据验证（Excel 特有功能）
- ❌ 条件格式（复杂规则系统）
- ❌ 宏和 VBA（代码执行）

**实现（AI 可以操作）：**
- ✅ Excel 基础公式支持（SUM, AVERAGE, IF, VLOOKUP 等）
- ✅ 公式通过 `data-formula` 属性在 HTML 表格中保留
- ✅ AI 可以读取、修改和创建公式
- ⚠️ 复杂嵌套公式（>10层）不支持

**AI 工具调用支持：**
- ✅ `read_file`：可以读取 HTML 表格内容
- ✅ `edit_current_editor_document`：可以修改 HTML 表格内容
- ✅ `update_file`：可以保存修改后的 HTML 表格

### 5.2 工作量估算

**后端开发：**
- Excel → ODS → HTML 转换：2-3 天
- HTML → ODS → Excel 转换：2-3 天
- 错误处理和降级方案：1 天
- 测试和优化：1-2 天
- **小计：6-9 天**

**前端开发：**
- 文件类型扩展：0.5 天
- ExcelPreview 组件（复用 DocxPdfPreview）：0.5 天
- Excel 编辑模式集成：1 天
- 功能限制提示 UI：0.5 天
- 测试和优化：1 天
- **小计：3.5 天**

**总计：9.5-12.5 天（约 2-2.5 周）**

### 5.3 风险评估

**技术风险：中低**
- LibreOffice 转换稳定性：中等（已有 DOCX 经验）
- ODS 格式处理：中等（需要解析 XML）
- 格式丢失：高（但已明确告知用户）

**业务风险：低**
- 功能限制已明确告知用户
- 预览模式完整支持
- 编辑模式作为可选功能

## 六、结论

### 6.1 推荐方案

**采用方案A（LibreOffice + ODS + HTML 表格）+ AI 能力评估策略**

**核心原则：**
> **只支持 AI 可以通过工具调用操作的功能**

**理由：**
1. ✅ **AI 原生设计**：所有功能都可以被 AI 操作，符合 Binder 的 AI 原生定位
2. ✅ **技术风险低**：复用现有基础设施（LibreOffice、HTML 表格）
3. ✅ **开发成本可控**：2-2.5 周（基于 AI 能力简化功能）
4. ✅ **用户体验好**：AI 可以完全操作所有支持的功能
5. ✅ **稳定性有保障**：明确的限制和降级方案
6. ✅ **功能聚焦**：不实现 AI 无法操作的功能，避免浪费开发资源

### 6.2 实施建议

1. **先实现预览模式**（1-2 天），验证 LibreOffice Excel 转换稳定性
2. **再实现基础编辑模式**（单工作表、HTML 表格，AI 可操作的功能）
3. **明确告知用户限制**：
   - ✅ 支持的功能：AI 可以完全操作
   - ❌ 不支持的功能：AI 无法操作（公式、图表等）
4. **验证 AI 工具调用**：确保 AI 可以正确读取和修改 HTML 表格
5. **后续版本逐步增强**（多工作表支持，但仅限 AI 可操作的功能）

### 6.3 AI 工具调用验证清单

**开发完成后，需要验证：**
- [ ] AI 可以通过 `read_file` 读取 HTML 表格内容
- [ ] AI 可以理解 HTML 表格结构（`<table>`, `<tr>`, `<td>`, `<th>`）
- [ ] AI 可以通过 `edit_current_editor_document` 修改表格内容
- [ ] AI 可以添加/删除行和列
- [ ] AI 可以合并/拆分单元格
- [ ] AI 可以修改格式（字体、颜色、对齐、边框、背景色）
- [ ] **AI 可以读取公式（`data-formula` 属性）**
- [ ] **AI 可以修改公式（修改 `data-formula` 属性）**
- [ ] **AI 可以创建新公式（根据用户指令生成公式）**
- [ ] 修改后的 HTML 可以正确转换回 Excel
- [ ] **公式在转换时正确保留和恢复**
- [ ] 不支持的功能（图表等）在转换时保留原文件内容

### 6.3 长期规划

- **Phase 2**：多工作表支持
- **Phase 3**：基础公式支持（简单公式）
- **Phase 4**：考虑集成专业表格编辑器（如果需要完整功能）

---

**文档版本**：v1.0  
**创建日期**：2025-01-XX  
**状态**：技术方案分析，待评审

