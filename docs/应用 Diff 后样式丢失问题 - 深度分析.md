# 应用 Diff 后样式丢失问题 - 深度分析

## 一、对比分析的准确性评估

### ✅ 准确识别的问题

1. **回退机制导致全文替换**（最严重）
   ```typescript
   // 如果应用失败，回退到使用 newContent
   if (currentTab.newContent) {
     editor.commands.setContent(currentTab.newContent, false);
   }
   ```
   - 这会直接替换整个文档
   - 如果 `newContent` 是纯文本或格式不一致，所有样式都会丢失

2. **纯文本插入丢失格式**
   ```typescript
   const paragraph = schema.nodes.paragraph.create();
   const textNode = schema.text(newCode);
   ```
   - 创建的是纯文本节点，没有保留原有的 marks（粗体、斜体等）

3. **位置计算错误风险**
   - 如果 `diff.from/diff.to` 不准确，可能修改到错误位置

---

## 二、**遗漏的核心问题**（更严重）

### 🔴 问题：后端行级 Diff 导致 `original_code` 过大

从文档中发现的关键信息：

```rust
// 后端 diff_service.rs 第 164 行
TextDiff::from_lines(old_content, new_content)
```

**问题根源**：
- 对于 HTML 内容，`<p>长段落内容</p>` 被视为**一行**
- 如果只修改段落中的几个字，`original_code` 会包含**整个段落**
- 前端匹配时，如果段落很长，可能匹配到**整个文档**
- 导致 `diff.from = 0, diff.to = 文档总长度`，标红全文

**示例**：
```html
<!-- 原文档 -->
<p>这是一个很长很长很长的段落，包含很多内容...</p>

<!-- AI 只想修改 "很长" 为 "非常长" -->
<!-- 但后端行级 Diff 会把整个 <p> 标签作为 original_code -->
{
  "original_code": "<p>这是一个很长很长很长的段落，包含很多内容...</p>",
  "new_code": "<p>这是一个非常长非常长非常长的段落，包含很多内容...</p>"
}

<!-- 前端匹配时，original_code 太长，可能匹配到全文 -->
<!-- 应用修改后，整个文档被替换 -->
```

---

## 三、样式丢失的完整链路分析

### 链路 1：后端生成 Diff（根本原因）

```
用户输入："把第二段的'机器学习'改成'深度学习'"
    ↓
AI 分析：定位到第二段
    ↓
后端 Diff 计算（问题所在）：
  - 使用行级 Diff：TextDiff::from_lines()
  - HTML 的一个段落 = 一行
  - original_code = 整个段落（可能很长）
    ↓
返回给前端：{
  "original_code": "<p>很长的段落...</p>",
  "new_code": "<p>修改后的段落...</p>"
}
```

### 链路 2：前端匹配位置（问题放大）

```
前端收到 Diff
    ↓
在文档中搜索 original_code
    ↓
如果 original_code 很长（例如整个段落）：
  - 可能匹配到多个位置
  - 可能匹配失败（因为格式微小差异）
  - 可能匹配到全文（如果段落占文档大部分）
    ↓
计算出错误的 diff.from 和 diff.to
```

### 链路 3：应用修改（样式丢失）

```
onApplyDiff 被调用
    ↓
遍历 diffs，按从后往前顺序应用
    ↓
情况 A：位置正确但 new_code 是纯文本
  - tr.delete(from, to)：删除原内容（包括格式）
  - tr.insert(from, 纯文本节点)：插入纯文本
  - 结果：格式丢失
    ↓
情况 B：位置计算错误（from=0, to=文档长度）
  - 删除整个文档
  - 插入新内容
  - 结果：全文被替换，所有样式丢失
    ↓
情况 C：应用失败触发回退机制
  - editor.commands.setContent(newContent)
  - 结果：整个文档被替换
```

---

## 四、解决方案（按优先级）

### 🔥 优先级 1：修复后端 Diff 计算（根本解决）

**方案 A：改用字符级 Diff**
```rust
// diff_service.rs
// 原代码：
// let diff = TextDiff::from_lines(old_content, new_content);

// 修改为：
let diff = TextDiff::from_chars(old_content, new_content);
// 或
let diff = TextDiff::from_str(old_content, new_content);
```

**优势**：
- `original_code` 只包含实际修改的文字，不会包含整个段落
- 前端匹配更精确
- 避免标红全文的问题

**示例效果**：
```javascript
// 字符级 Diff 结果
{
  "original_code": "机器学习",
  "new_code": "深度学习",
  "context_before": "这是一个",
  "context_after": "的例子"
}
// 而不是整个段落
```

---

**方案 B：对 HTML 内容先提取纯文本再 Diff**
```rust
fn diff_html_content(old_html: &str, new_html: &str) -> Vec<Diff> {
    // 1. 提取纯文本
    let old_text = extract_text_from_html(old_html);
    let new_text = extract_text_from_html(new_html);
    
    // 2. 字符级 Diff
    let diff = TextDiff::from_chars(&old_text, &new_text);
    
    // 3. 映射回 HTML 位置
    map_diff_to_html_positions(diff, old_html)
}
```

---

### 🔥 优先级 2：前端增强格式保留（核心修复）

**问题**：即使位置正确，插入纯文本也会丢失格式

**解决方案**：在应用修改时，保留原有节点的 marks

```typescript
// 修改 onApplyDiff 中的插入逻辑
function applyDiffWithFormatPreservation(tr, diff, doc) {
  const { from, to } = diff;
  
  // 1. 获取原节点的格式（marks）
  const originalNode = doc.nodeAt(from);
  const originalMarks = originalNode?.marks || [];
  
  // 2. 删除旧内容
  tr.delete(from, to);
  
  // 3. 解析新内容
  const newCode = diff.new_code || '';
  const isHTML = /<[^>]+>/.test(newCode);
  
  let nodesToInsert;
  
  if (isHTML) {
    // HTML：解析并保留格式
    const parser = DOMParser.fromSchema(schema);
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = newCode;
    const fragment = parser.parse(tempDiv);
    nodesToInsert = fragment.content;
  } else {
    // 纯文本：创建文本节点并应用原有 marks
    const textNode = schema.text(newCode, originalMarks); // ⚠️ 关键：应用原有格式
    nodesToInsert = Fragment.from(textNode);
  }
  
  // 4. 插入新内容
  tr.insert(from, nodesToInsert);
}
```

**关键点**：
- `schema.text(newCode, originalMarks)`：创建文本节点时应用原有的粗体、斜体等格式
- 保留原节点的 marks，避免格式丢失

---

### 🔥 优先级 3：移除或优化回退机制

**当前问题**：
```typescript
// 如果应用失败，回退到使用 newContent
if (currentTab.newContent) {
  editor.commands.setContent(currentTab.newContent, false);
}
```

**解决方案 A：完全移除回退机制**
```typescript
// 不再使用 newContent 作为回退
// 如果应用失败，只清除 Diff 标记，保持文档不变
if (failedDiffs.length > 0) {
  console.error('[onApplyDiff] 应用失败的 diffs:', failedDiffs);
  // 清除失败的 Diff 标记
  clearTabDiff(tabId);
  // 通知用户
  showNotification('部分修改应用失败，请重试');
}
```

**解决方案 B：智能回退**（仅在特定情况下使用）
```typescript
// 只在确认 newContent 包含格式时才回退
if (currentTab.newContent && isValidHTML(currentTab.newContent)) {
  // 确保 newContent 是完整的 HTML，包含格式
  editor.commands.setContent(currentTab.newContent, false);
} else {
  // 否则只清除 Diff，不修改文档
  clearTabDiff(tabId);
}
```

---

### 🔥 优先级 4：增强位置验证

```typescript
function validateDiffPosition(diff, docSize) {
  const { from, to } = diff;
  
  // 1. 基本验证
  if (from < 0 || to > docSize || from >= to) {
    console.error('[validateDiffPosition] 位置无效:', { from, to, docSize });
    return false;
  }
  
  // 2. 长度验证：不允许修改超过文档 50%
  const diffLength = to - from;
  if (diffLength > docSize * 0.5) {
    console.error('[validateDiffPosition] Diff 过长（超过 50%）:', {
      diffLength,
      docSize,
      percentage: (diffLength / docSize * 100).toFixed(1) + '%'
    });
    return false;
  }
  
  // 3. 置信度验证
  if (diff.confidence && diff.confidence < 0.7) {
    console.warn('[validateDiffPosition] 置信度过低:', diff.confidence);
    return false;
  }
  
  return true;
}

// 在 onApplyDiff 中使用
sortedDiffs.forEach(diff => {
  if (!validateDiffPosition(diff, doc.content.size)) {
    console.error('[onApplyDiff] 跳过无效 diff:', diff);
    return; // 跳过这个 diff
  }
  
  // 应用 diff...
});
```

---

## 五、修复后的完整流程

```
1. 后端修复：
   ✓ 使用字符级 Diff（TextDiff::from_chars）
   ✓ 减小 original_code 的长度
   ✓ 提供更精确的上下文

2. 前端增强：
   ✓ 在应用修改时保留原有 marks（格式）
   ✓ 增强位置验证（长度、置信度）
   ✓ 移除全文替换的回退机制

3. 效果：
   ✓ 只修改指定部分
   ✓ 保留未修改部分的格式
   ✓ 保留修改部分的原有格式（粗体、斜体等）
   ✓ 避免标红全文
   ✓ 避免样式丢失
```

---

## 六、总结与建议

### 对比分析的准确性：**80% 准确**

**准确的部分**：
- ✅ 识别了回退机制问题
- ✅ 识别了纯文本插入问题
- ✅ 识别了位置计算风险

**遗漏的部分**：
- ❌ **未识别后端行级 Diff 的根本问题**（这是导致标红全文的主因）
- ❌ 未提出保留 marks 的具体方案

### 修复优先级

1. **立即修复**：后端改用字符级 Diff（彻底解决）
2. **立即修复**：前端应用修改时保留 marks（核心修复）
3. **立即修复**：移除回退机制（避免全文替换）
4. **可选优化**：增强位置验证（提高稳定性）

### 预期效果

修复后：
- ✅ 不会标红全文
- ✅ 不会丢失样式
- ✅ 只修改 AI 指定的部分
- ✅ 保留文档原有格式

---

## 七、立即行动建议

### Step 1: 修复后端（15分钟）
```rust
// diff_service.rs
- let diff = TextDiff::from_lines(old_content, new_content);
+ let diff = TextDiff::from_chars(old_content, new_content);
```

### Step 2: 修复前端格式保留（30分钟）
```typescript
// 在 onApplyDiff 中，插入文本时应用原有 marks
const originalMarks = doc.nodeAt(from)?.marks || [];
const textNode = schema.text(newCode, originalMarks);
```

### Step 3: 移除回退机制（5分钟）
```typescript
// 删除或注释掉这段代码
// if (currentTab.newContent) {
//   editor.commands.setContent(currentTab.newContent, false);
// }
```

### Step 4: 测试验证（30分钟）
1. 测试修改文本（保留粗体、斜体）
2. 测试修改长段落（不标红全文）
3. 测试多处修改（格式正确）

**总耗时：约 1.5 小时**，即可彻底解决样式丢失问题。