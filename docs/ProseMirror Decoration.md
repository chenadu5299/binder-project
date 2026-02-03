import React, { useState } from 'react';
import { FileText, Table, Image, Code, CheckCircle, XCircle, AlertCircle } from 'lucide-react';

const EditorDiffSystem = () => {
  const [activeTab, setActiveTab] = useState('architecture');

  const TabButton = ({ id, label }) => (
    <button
      onClick={() => setActiveTab(id)}
      className={`px-4 py-2 font-medium transition-colors ${
        activeTab === id
          ? 'text-blue-600 border-b-2 border-blue-600'
          : 'text-gray-600 hover:text-gray-900'
      }`}
    >
      {label}
    </button>
  );

  const ArchitectureView = () => (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-6 rounded-lg border border-blue-200">
        <h3 className="text-xl font-bold text-gray-900 mb-3">核心问题重新定义</h3>
        <div className="space-y-2 text-gray-700">
          <p className="flex items-start gap-2">
            <span className="text-blue-600 font-bold">×</span>
            <span>不是简单的"定位-修改-返回"</span>
          </p>
          <p className="flex items-start gap-2">
            <span className="text-green-600 font-bold">✓</span>
            <span>是"定位-Diff渲染-用户确认-应用修改"</span>
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-lg border-2 border-gray-200 hover:border-blue-400 transition-colors">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <span className="text-blue-600 font-bold">1</span>
            </div>
            <h4 className="font-semibold text-gray-900">AI 识别层</h4>
          </div>
          <ul className="text-sm text-gray-600 space-y-1">
            <li>• 识别修改意图</li>
            <li>• 提取目标内容</li>
            <li>• 生成修改建议</li>
            <li>• 返回结构化数据</li>
          </ul>
        </div>

        <div className="bg-white p-5 rounded-lg border-2 border-gray-200 hover:border-green-400 transition-colors">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <span className="text-green-600 font-bold">2</span>
            </div>
            <h4 className="font-semibold text-gray-900">Diff 渲染层</h4>
          </div>
          <ul className="text-sm text-gray-600 space-y-1">
            <li>• 计算修改差异</li>
            <li>• 生成 Diff 标记</li>
            <li>• 渲染到编辑器</li>
            <li>• 保持原格式</li>
          </ul>
        </div>

        <div className="bg-white p-5 rounded-lg border-2 border-gray-200 hover:border-purple-400 transition-colors">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
              <span className="text-purple-600 font-bold">3</span>
            </div>
            <h4 className="font-semibold text-gray-900">用户交互层</h4>
          </div>
          <ul className="text-sm text-gray-600 space-y-1">
            <li>• 接受/拒绝修改</li>
            <li>• 逐行确认</li>
            <li>• 撤销/重做</li>
            <li>• 批量操作</li>
          </ul>
        </div>
      </div>
    </div>
  );

  const DiffRenderingView = () => (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-lg border border-gray-200">
        <h3 className="text-lg font-bold text-gray-900 mb-4">核心技术方案：ProseMirror Decoration</h3>
        
        <div className="space-y-4">
          <div className="bg-blue-50 p-4 rounded-lg">
            <h4 className="font-semibold text-blue-900 mb-2">为什么用 Decoration？</h4>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• 不修改文档结构，只是视觉层标记</li>
              <li>• 可以跨节点渲染（包括表格、图片）</li>
              <li>• 支持 inline、node、widget 三种模式</li>
              <li>• 性能好，不触发文档重新计算</li>
            </ul>
          </div>

          <div className="bg-gray-50 p-4 rounded-lg font-mono text-sm">
            <div className="text-gray-600 mb-2">// Decoration 概念示例</div>
            <pre className="text-gray-800 whitespace-pre-wrap text-xs">
{`// 1. 删除标记（红色删除线）
Decoration.inline(from, to, {
  class: 'diff-deletion',
  style: 'background: #fee; text-decoration: line-through;'
})

// 2. 新增标记（绿色背景）
Decoration.inline(from, to, {
  class: 'diff-insertion',
  style: 'background: #efe;'
})

// 3. 表格单元格标记
Decoration.node(tablePos, tablePos + tableNode.nodeSize, {
  class: 'diff-table-change'
})

// 4. 图片替换标记（Widget）
Decoration.widget(imagePos, () => {
  const dom = document.createElement('div');
  dom.className = 'diff-image-replace';
  // 并排显示旧图和新图
  return dom;
})`}
            </pre>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white p-5 rounded-lg border border-gray-200">
          <div className="flex items-center gap-2 mb-3">
            <FileText className="w-5 h-5 text-blue-600" />
            <h4 className="font-semibold text-gray-900">文本 Diff</h4>
          </div>
          <div className="space-y-2 text-sm">
            <div className="p-2 bg-red-50 rounded border-l-4 border-red-400">
              <span className="line-through text-red-700">旧文本内容</span>
            </div>
            <div className="p-2 bg-green-50 rounded border-l-4 border-green-400">
              <span className="text-green-700">新文本内容</span>
            </div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-lg border border-gray-200">
          <div className="flex items-center gap-2 mb-3">
            <Table className="w-5 h-5 text-purple-600" />
            <h4 className="font-semibold text-gray-900">表格 Diff</h4>
          </div>
          <div className="text-sm">
            <table className="w-full border-collapse">
              <tbody>
                <tr>
                  <td className="border p-2">单元格</td>
                  <td className="border p-2 bg-yellow-50">修改的单元格</td>
                </tr>
                <tr className="bg-green-50">
                  <td className="border p-2">新增行</td>
                  <td className="border p-2">新增行</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );

  const ElementHandlingView = () => (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-purple-50 to-pink-50 p-6 rounded-lg border border-purple-200">
        <h3 className="text-xl font-bold text-gray-900 mb-3">按元素类型分别处理</h3>
        <p className="text-gray-700">不同元素类型使用不同的 Diff 渲染策略</p>
      </div>

      <div className="space-y-4">
        {[
          {
            icon: FileText,
            color: 'blue',
            title: '纯文本元素',
            strategy: '字符级 Diff',
            steps: [
              '使用 diff-match-patch 算法计算差异',
              '标记删除部分（红色删除线）',
              '标记新增部分（绿色背景）',
              '保持原有格式（粗体、斜体等）'
            ],
            code: `// 文本 Diff 算法（需要引入 diff-match-patch 库）
const dmp = new DiffMatchPatch();
const diffs = dmp.diff_main(oldText, newText);
dmp.diff_cleanupSemantic(diffs);

// 转换为 Decoration
let pos = startPos;
const decorations = [];

diffs.forEach(([op, text]) => {
  if (op === -1) { // 删除
    decorations.push({
      type: 'inline',
      from: pos,
      to: pos + text.length,
      attrs: { class: 'diff-deletion' }
    });
    pos += text.length;
  } else if (op === 1) { // 新增
    decorations.push({
      type: 'widget',
      pos: pos,
      content: text,
      attrs: { class: 'diff-insertion' }
    });
  } else { // 不变
    pos += text.length;
  }
});`
          },
          {
            icon: Table,
            color: 'purple',
            title: '表格元素',
            strategy: '单元格级 Diff',
            steps: [
              '定位目标表格节点',
              '遍历单元格，比对内容',
              '标记修改的单元格（黄色背景）',
              '标记新增/删除的行/列（绿色/红色）',
              '保持表格结构'
            ],
            code: `// 表格 Diff 处理
function diffTable(oldTable, newTable, tableNode) {
  const decorations = [];
  
  // 1. 定位表格
  const tablePos = findNodePosition(tableNode);
  
  // 2. 遍历所有行
  oldTable.rows.forEach((row, rowIndex) => {
    row.cells.forEach((cell, cellIndex) => {
      const oldContent = cell.content;
      const newContent = newTable.rows[rowIndex]?.cells[cellIndex]?.content;
      
      if (oldContent !== newContent) {
        // 3. 标记修改的单元格
        const cellPos = getCellPosition(tablePos, rowIndex, cellIndex);
        decorations.push({
          type: 'node',
          pos: cellPos,
          attrs: { class: 'diff-cell-modified' }
        });
      }
    });
  });
  
  return decorations;
}`
          },
          {
            icon: Image,
            color: 'green',
            title: '图片/媒体元素',
            strategy: '节点级 Diff',
            steps: [
              '定位图片节点',
              '并排显示旧图和新图',
              '使用 Widget Decoration 插入对比视图',
              '提供"接受新图"按钮'
            ],
            code: `// 图片 Diff 处理
function diffImage(oldImage, newImage, imageNode) {
  const imagePos = findNodePosition(imageNode);
  
  // 创建对比视图 DOM
  const compareWidget = document.createElement('div');
  compareWidget.className = 'diff-image-compare';
  compareWidget.innerHTML = \`
    <div class="flex gap-4 p-4 bg-gray-50 rounded border-2 border-yellow-300">
      <div class="flex-1">
        <div class="text-xs text-red-600 font-semibold mb-1">删除</div>
        <img src="\${oldImage.src}" class="w-full opacity-50" />
      </div>
      <div class="flex-1">
        <div class="text-xs text-green-600 font-semibold mb-1">新增</div>
        <img src="\${newImage.src}" class="w-full" />
      </div>
    </div>
  \`;
  
  return {
    type: 'widget',
    pos: imagePos,
    element: compareWidget
  };
}`
          },
          {
            icon: Code,
            color: 'orange',
            title: '代码块元素',
            strategy: '行级 Diff',
            steps: [
              '使用代码 Diff 算法（类似 Git）',
              '显示行号',
              '标记修改的行（左侧 -，右侧 +）',
              '保持语法高亮'
            ],
            code: `// 代码块 Diff 处理（行级）
function diffCodeBlock(oldCode, newCode, codeNode) {
  const oldLines = oldCode.split('\\n');
  const newLines = newCode.split('\\n');
  const decorations = [];
  
  // 简单的行级 Diff
  const maxLines = Math.max(oldLines.length, newLines.length);
  let pos = getNodeStartPos(codeNode);
  
  for (let i = 0; i < maxLines; i++) {
    const oldLine = oldLines[i];
    const newLine = newLines[i];
    
    if (oldLine !== newLine) {
      if (oldLine && newLine) {
        // 修改行
        decorations.push({
          type: 'line',
          pos: pos,
          length: oldLine.length,
          attrs: { class: 'diff-code-modified' }
        });
      } else if (oldLine && !newLine) {
        // 删除行
        decorations.push({
          type: 'line',
          pos: pos,
          length: oldLine.length,
          attrs: { class: 'diff-code-removed' }
        });
      } else if (!oldLine && newLine) {
        // 新增行
        decorations.push({
          type: 'line',
          pos: pos,
          attrs: { class: 'diff-code-added' }
        });
      }
    }
    
    if (oldLine) pos += oldLine.length + 1; // +1 for newline
  }
  
  return decorations;
}`
          }
        ].map((item, index) => (
          <div key={index} className="bg-white p-5 rounded-lg border-2 border-gray-200">
            <div className="flex items-center gap-3 mb-4">
              <div className={`w-12 h-12 bg-${item.color}-100 rounded-lg flex items-center justify-center`}>
                <item.icon className={`w-6 h-6 text-${item.color}-600`} />
              </div>
              <div>
                <h4 className="font-bold text-gray-900">{item.title}</h4>
                <p className="text-sm text-gray-600">{item.strategy}</p>
              </div>
            </div>
            
            <div className="mb-3">
              <h5 className="font-semibold text-gray-800 mb-2">处理步骤：</h5>
              <ul className="space-y-1">
                {item.steps.map((step, i) => (
                  <li key={i} className="text-sm text-gray-600 flex items-start gap-2">
                    <span className="text-gray-400">•</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ul>
            </div>
            
            <details className="mt-3">
              <summary className="cursor-pointer text-sm font-medium text-gray-700 hover:text-gray-900">
                查看代码示例
              </summary>
              <pre className="mt-2 p-3 bg-gray-50 rounded text-xs overflow-x-auto">
                <code className="text-gray-800">{item.code}</code>
              </pre>
            </details>
          </div>
        ))}
      </div>
    </div>
  );

  const WorkflowView = () => (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-lg border border-gray-200">
        <h3 className="text-lg font-bold text-gray-900 mb-4">完整工作流程</h3>
        
        <div className="space-y-4">
          {[
            {
              step: '1',
              title: 'AI 分析与定位',
              desc: '用户输入 → AI 理解意图 → 返回修改建议',
              details: [
                '用户："把第二段的'机器学习'改成'深度学习'"',
                'AI 返回：{ type: "text_replace", target: {...}, old: "机器学习", new: "深度学习" }'
              ],
              color: 'blue'
            },
            {
              step: '2',
              title: '内容匹配与定位',
              desc: '多策略匹配 → 找到目标节点 → 计算编辑器位置',
              details: [
                '策略1：精确内容匹配（包含上下文）',
                '策略2：模糊匹配（相似度阈值）',
                '策略3：结构位置（"第N段第M句"）',
                '失败 → 用户确认候选位置'
              ],
              color: 'green'
            },
            {
              step: '3',
              title: 'Diff 计算',
              desc: '根据元素类型选择 Diff 算法',
              details: [
                '文本：diff-match-patch（字符级）',
                '表格：单元格级比对',
                '图片：节点替换',
                '代码：行级 Diff'
              ],
              color: 'purple'
            },
            {
              step: '4',
              title: 'Decoration 渲染',
              desc: '生成标记 → 应用到编辑器 → 不修改文档',
              details: [
                '创建 Decoration 对象集合',
                '通过编辑器 API 应用视觉标记',
                '编辑器实时渲染 Diff 效果',
                '文档内容保持不变（只是视觉层）'
              ],
              color: 'orange'
            },
            {
              step: '5',
              title: '用户交互',
              desc: '显示接受/拒绝按钮 → 用户选择 → 执行修改',
              details: [
                '接受：应用修改 → 生成编辑操作 → 更新文档',
                '拒绝：移除 Decoration → 恢复原状',
                '逐行确认：表格/代码块支持单行操作',
                '撤销/重做：保存修改历史'
              ],
              color: 'red'
            }
          ].map((item, index) => (
            <div key={index} className="flex gap-4">
              <div className={`flex-shrink-0 w-12 h-12 bg-${item.color}-100 rounded-full flex items-center justify-center`}>
                <span className={`text-${item.color}-600 font-bold text-lg`}>{item.step}</span>
              </div>
              <div className="flex-1">
                <h4 className="font-bold text-gray-900 mb-1">{item.title}</h4>
                <p className="text-sm text-gray-600 mb-2">{item.desc}</p>
                <div className="bg-gray-50 p-3 rounded-lg">
                  {item.details.map((detail, i) => (
                    <p key={i} className={`text-xs text-gray-700 ${i > 0 ? 'mt-1' : ''}`}>
                      {detail}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-gradient-to-r from-green-50 to-emerald-50 p-6 rounded-lg border border-green-200">
        <h3 className="text-lg font-bold text-gray-900 mb-3">关键技术点</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[
            { icon: CheckCircle, text: 'Decoration 不修改文档，只是视觉标记', color: 'green' },
            { icon: CheckCircle, text: '用户确认后才真正修改文档', color: 'green' },
            { icon: CheckCircle, text: '支持批量操作和撤销/重做', color: 'green' },
            { icon: CheckCircle, text: '按元素类型分别处理 Diff', color: 'green' }
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-2">
              <item.icon className="w-5 h-5 text-green-600" />
              <span className="text-sm text-gray-700">{item.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const ChallengesView = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[
          {
            icon: AlertCircle,
            title: '跨节点 Diff',
            problem: '修改跨越多个段落、表格、图片',
            solution: [
              '分解为多个 Decoration',
              '每个节点单独处理',
              '保持逻辑关联性',
              '统一的接受/拒绝操作'
            ],
            color: 'red'
          },
          {
            icon: AlertCircle,
            title: '嵌套结构 Diff',
            problem: '表格中的表格、列表中的列表',
            solution: [
              '递归处理嵌套结构',
              '维护节点路径',
              '层级化的 Decoration',
              '从内到外渲染'
            ],
            color: 'orange'
          },
          {
            icon: AlertCircle,
            title: '格式保留',
            problem: '粗体、斜体、链接等格式如何在 Diff 中保留',
            solution: [
              'Diff 计算时保留格式信息',
              'Decoration 只影响视觉，不改变格式',
              '应用修改时重新应用格式',
              '支持格式级别的 Diff'
            ],
            color: 'yellow'
          },
          {
            icon: AlertCircle,
            title: '并发编辑',
            problem: 'AI 建议修改时用户继续编辑',
            solution: [
              '实时检测文档变化',
              '位置自动调整（OT 算法）',
              'Decoration 失效时重新计算',
              '提示用户"内容已变化"'
            ],
            color: 'purple'
          },
          {
            icon: AlertCircle,
            title: '性能优化',
            problem: '大文档、多处修改时性能问题',
            solution: [
              '虚拟滚动（只渲染可见区域）',
              'Decoration 按需计算',
              '增量更新（不重建整个标记集）',
              '节流处理用户交互'
            ],
            color: 'blue'
          },
          {
            icon: AlertCircle,
            title: '用户体验',
            problem: '如何让 Diff 效果清晰易懂',
            solution: [
              '颜色编码（红=删除，绿=新增，黄=修改）',
              '悬浮提示（显示修改详情）',
              '快捷键操作（Tab 跳转，Enter 接受）',
              '批量接受/拒绝'
            ],
            color: 'green'
          }
        ].map((item, index) => (
          <div key={index} className="bg-white p-5 rounded-lg border-2 border-gray-200">
            <div className="flex items-center gap-3 mb-3">
              <item.icon className="w-6 h-6 text-gray-600" />
              <h4 className="font-bold text-gray-900">{item.title}</h4>
            </div>
            <div className="mb-3 p-3 bg-gray-50 rounded">
              <p className="text-sm text-gray-800 font-medium">问题：</p>
              <p className="text-sm text-gray-700">{item.problem}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">解决方案：</p>
              <ul className="space-y-1">
                {item.solution.map((sol, i) => (
                  <li key={i} className="text-sm text-gray-600 flex items-start gap-2">
                    <span className="text-gray-400">•</span>
                    <span>{sol}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-gradient-to-r from-red-50 to-pink-50 p-6 rounded-lg border border-red-200">
        <h3 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
          <XCircle className="w-6 h-6 text-red-600" />
          最大的挑战：AI 定位不准确
        </h3>
        <div className="space-y-3">
          <div className="bg-white p-4 rounded-lg">
            <p className="font-semibold text-gray-900 mb-2">问题描述：</p>
            <p className="text-sm text-gray-700">
              即使有上下文匹配，AI 仍可能定位错误位置。如果 Diff 渲染在错误位置，用户接受后会破坏文档。
            </p>
          </div>
          <div className="bg-white p-4 rounded-lg">
            <p className="font-semibold text-gray-900 mb-2">解决策略（多层防护）：</p>
            <ol className="space-y-2 text-sm text-gray-700">
              <li className="flex items-start gap-2">
                <span className="text-red-600 font-bold">1.</span>
                <span><strong>置信度评分：</strong>AI 返回匹配置信度，低于阈值时要求用户确认</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-red-600 font-bold">2.</span>
                <span><strong>高亮预览：</strong>渲染 Diff 时自动滚动到目标位置并高亮闪烁</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-red-600 font-bold">3.</span>
                <span><strong>候选位置：</strong>找到多个相似位置时让用户选择</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-red-600 font-bold">4.</span>
                <span><strong>撤销机制：</strong>应用修改后支持一键撤销（保存修改历史）</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-red-600 font-bold">5.</span>
                <span><strong>人工校正：</strong>用户可手动调整 Diff 范围</span>
              </li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );

  const ImplementationView = () => (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-lg border border-gray-200">
        <h3 className="text-lg font-bold text-gray-900 mb-4">核心代码架构</h3>
        
        <div className="space-y-4">
          <div className="bg-gray-50 p-4 rounded-lg">
            <h4 className="font-semibold text-gray-900 mb-2">1. TipTap/ProseMirror 插件架构</h4>
            <pre className="text-xs overflow-x-auto bg-white p-3 rounded border">
{`// 使用 TipTap 扩展系统创建 Diff 插件
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

const DiffExtension = Extension.create({
  name: 'diff',
  
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('diff'),
        
        state: {
          init() {
            return DecorationSet.empty;
          },
          
          apply(tr, oldState) {
            // 文档变化时调整 Decoration 位置
            let decorations = oldState.map(tr.mapping, tr.doc);
            
            // 处理自定义命令
            const meta = tr.getMeta('diff');
            if (meta?.type === 'add') {
              decorations = this.createDecorations(tr.doc, meta.changes);
            } else if (meta?.type === 'clear') {
              decorations = DecorationSet.empty;
            }
            
            return decorations;
          }
        },
        
        props: {
          decorations(state) {
            return this.getState(state);
          }
        }
      })
    ];
  },
  
  addCommands() {
    return {
      // 添加 Diff 标记
      addDiff: (changes) => ({ tr, dispatch }) => {
        if (dispatch) {
          tr.setMeta('diff', { type: 'add', changes });
        }
        return true;
      },
      
      // 清除 Diff 标记
      clearDiff: () => ({ tr, dispatch }) => {
        if (dispatch) {
          tr.setMeta('diff', { type: 'clear' });
        }
        return true;
      },
      
      // 接受修改
      acceptChange: (changeId) => ({ tr, state, dispatch }) => {
        const change = this.findChange(state, changeId);
        if (change && dispatch) {
          this.applyChange(tr, change);
        }
        return true;
      }
    };
  }
});`}
            </pre>
          </div>

          <div className="bg-gray-50 p-4 rounded-lg">
            <h4 className="font-semibold text-gray-900 mb-2">2. AI 响应处理流程</h4>
            <pre className="text-xs overflow-x-auto bg-white p-3 rounded border">
{`// 处理 AI 返回的修改建议
class DiffManager {
  constructor(editor) {
    this.editor = editor;
  }
  
  async handleAIResponse(aiResponse) {
    const { modifications } = aiResponse;
    
    // 1. 定位所有修改
    const changes = await this.locateChanges(modifications);
    
    // 2. 过滤低置信度的修改
    const valid = changes.filter(c => c.confidence > 0.7);
    const uncertain = changes.filter(c => c.confidence <= 0.7);
    
    // 3. 请求用户确认不确定的修改
    if (uncertain.length > 0) {
      await this.confirmChanges(uncertain);
    }
    
    // 4. 应用 Diff 标记
    this.editor.commands.addDiff(valid);
    
    // 5. 显示操作面板
    this.showDiffPanel(valid);
  }
  
  async locateChanges(modifications) {
    return Promise.all(
      modifications.map(mod => this.locateSingleChange(mod))
    );
  }
  
  async locateSingleChange(mod) {
    // 多策略匹配
    const strategies = [
      this.exactMatch,
      this.fuzzyMatch,
      this.contextMatch
    ];
    
    for (const strategy of strategies) {
      const result = await strategy.call(this, mod);
      if (result.found) {
        return {
          ...mod,
          from: result.from,
          to: result.to,
          confidence: result.confidence
        };
      }
    }
    
    return { ...mod, found: false, confidence: 0 };
  }
  
  exactMatch(mod) {
    const doc = this.editor.state.doc;
    const { target, contextBefore, contextAfter } = mod;
    
    // 遍历文档查找精确匹配
    let bestMatch = null;
    let bestScore = 0;
    
    doc.descendants((node, pos) => {
      if (node.isText && node.text.includes(target)) {
        const score = this.calculateMatchScore(
          node, pos, target, contextBefore, contextAfter
        );
        if (score > bestScore) {
          bestScore = score;
          bestMatch = { 
            found: true, 
            from: pos, 
            to: pos + target.length,
            confidence: score 
          };
        }
      }
    });
    
    return bestMatch || { found: false };
  }
}`}
            </pre>
          </div>

          <div className="bg-gray-50 p-4 rounded-lg">
            <h4 className="font-semibold text-gray-900 mb-2">3. 用户交互组件</h4>
            <pre className="text-xs overflow-x-auto bg-white p-3 rounded border">
{`// React 组件：Diff 操作面板
function DiffPanel({ changes, editor }) {
  const [pending, setPending] = useState(changes);
  
  const handleAccept = (changeId) => {
    editor.commands.acceptChange(changeId);
    setPending(prev => prev.filter(c => c.id !== changeId));
  };
  
  const handleReject = (changeId) => {
    editor.commands.rejectChange(changeId);
    setPending(prev => prev.filter(c => c.id !== changeId));
  };
  
  const handleAcceptAll = () => {
    pending.forEach(c => editor.commands.acceptChange(c.id));
    setPending([]);
  };
  
  const handleRejectAll = () => {
    editor.commands.clearDiff();
    setPending([]);
  };
  
  return (
    <div className="fixed bottom-4 right-4 bg-white shadow-xl rounded-lg p-4 border max-w-md">
      <div className="mb-3">
        <h3 className="font-bold text-gray-900">
          发现 {pending.length} 处修改
        </h3>
        <p className="text-sm text-gray-600">
          请审查并选择接受或拒绝
        </p>
      </div>
      
      <div className="space-y-2 max-h-60 overflow-y-auto mb-3">
        {pending.map((change, i) => (
          <div key={change.id} className="border rounded p-2">
            <div className="flex justify-between items-start mb-1">
              <span className="text-xs font-medium">修改 {i + 1}</span>
              <div className="flex gap-1">
                <button
                  onClick={() => handleAccept(change.id)}
                  className="px-2 py-1 bg-green-500 text-white text-xs rounded hover:bg-green-600"
                >
                  ✓
                </button>
                <button
                  onClick={() => handleReject(change.id)}
                  className="px-2 py-1 bg-red-500 text-white text-xs rounded hover:bg-red-600"
                >
                  ✗
                </button>
              </div>
            </div>
            <div className="text-xs">
              <span className="text-red-600 line-through">
                {change.oldText}
              </span>
              <span className="mx-1">→</span>
              <span className="text-green-600">
                {change.newText}
              </span>
            </div>
          </div>
        ))}
      </div>
      
      <div className="flex gap-2">
        <button
          onClick={handleAcceptAll}
          className="flex-1 px-3 py-2 bg-green-600 text-white text-sm rounded hover:bg-green-700"
        >
          全部接受
        </button>
        <button
          onClick={handleRejectAll}
          className="flex-1 px-3 py-2 bg-red-600 text-white text-sm rounded hover:bg-red-700"
        >
          全部拒绝
        </button>
      </div>
    </div>
  );
}`}
            </pre>
          </div>
        </div>
      </div>

      <div className="bg-gradient-to-r from-blue-50 to-cyan-50 p-6 rounded-lg border border-blue-200">
        <h3 className="text-lg font-bold text-gray-900 mb-3">CSS 样式定义</h3>
        <pre className="text-xs overflow-x-auto bg-white p-3 rounded">
{`/* Diff 视觉样式 */
.diff-deletion {
  background-color: #fee;
  text-decoration: line-through;
  color: #c00;
  padding: 2px 0;
}

.diff-insertion {
  background-color: #efe;
  color: #080;
  border-bottom: 2px solid #0a0;
  padding: 2px 0;
}

.diff-table-cell-modified {
  background-color: #fffbeb;
  outline: 2px solid #fbbf24;
  outline-offset: -2px;
}

.diff-image-compare {
  margin: 1rem 0;
  animation: highlight-pulse 2s ease-in-out;
}

@keyframes highlight-pulse {
  0%, 100% { box-shadow: 0 0 0 rgba(59, 130, 246, 0); }
  50% { box-shadow: 0 0 20px rgba(59, 130, 246, 0.5); }
}

.diff-code-removed {
  background-color: #fee;
  border-left: 4px solid #c00;
  padding-left: 8px;
}

.diff-code-added {
  background-color: #efe;
  border-left: 4px solid #0a0;
  padding-left: 8px;
}

.diff-code-modified {
  background-color: #fffbeb;
  border-left: 4px solid #f59e0b;
  padding-left: 8px;
}`}
        </pre>
      </div>

      <div className="bg-white p-6 rounded-lg border border-gray-200">
        <h3 className="text-lg font-bold text-gray-900 mb-4">实施路线图</h3>
        
        <div className="space-y-3">
          {[
            {
              phase: '第一阶段（2周）',
              title: '基础 Diff 系统',
              tasks: [
                '实现 TipTap Diff 扩展和 Decoration 渲染',
                '支持纯文本的 Diff（删除、新增、替换）',
                '基础 UI（接受/拒绝按钮）',
                '单个修改的完整流程'
              ],
              color: 'blue'
            },
            {
              phase: '第二阶段（2周）',
              title: '多元素支持',
              tasks: [
                '表格 Diff 支持（单元格级）',
                '图片 Diff 支持（对比视图）',
                '代码块 Diff 支持（行级）',
                '列表、标题等其他元素'
              ],
              color: 'green'
            },
            {
              phase: '第三阶段（1-2周）',
              title: '定位优化',
              tasks: [
                '多策略匹配系统（精确、模糊、上下文）',
                '置信度评分机制',
                '候选位置选择界面',
                '上下文增强匹配算法'
              ],
              color: 'purple'
            },
            {
              phase: '第四阶段（1-2周）',
              title: '用户体验优化',
              tasks: [
                '批量操作（全部接受/拒绝）',
                '快捷键支持（Tab 跳转，Enter 接受）',
                '撤销/重做系统',
                '高亮滚动定位'
              ],
              color: 'orange'
            },
            {
              phase: '第五阶段（持续）',
              title: '性能与稳定性',
              tasks: [
                '性能优化（大文档处理）',
                '边缘情况处理（嵌套、跨节点）',
                '并发编辑支持（OT 算法）',
                '用户反馈迭代'
              ],
              color: 'red'
            }
          ].map((item, index) => (
            <div key={index} className="border-l-4 border-gray-400 pl-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-bold text-gray-900">{item.title}</h4>
                <span className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded">
                  {item.phase}
                </span>
              </div>
              <ul className="space-y-1">
                {item.tasks.map((task, i) => (
                  <li key={i} className="text-sm text-gray-600 flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                    <span>{task}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold text-gray-900 mb-3">
            富文本编辑器 Diff 系统完整方案
          </h1>
          <p className="text-lg text-gray-600">
            AI 驱动的文档修改预览与交互系统
          </p>
        </div>

        <div className="bg-white rounded-lg shadow-lg overflow-hidden mb-6">
          <div className="border-b border-gray-200 flex overflow-x-auto">
            <TabButton id="architecture" label="系统架构" />
            <TabButton id="diff-rendering" label="Diff 渲染" />
            <TabButton id="element-handling" label="元素处理" />
            <TabButton id="workflow" label="工作流程" />
            <TabButton id="challenges" label="挑战与解决" />
            <TabButton id="implementation" label="代码实现" />
          </div>

          <div className="p-6">
            {activeTab === 'architecture' && <ArchitectureView />}
            {activeTab === 'diff-rendering' && <DiffRenderingView />}
            {activeTab === 'element-handling' && <ElementHandlingView />}
            {activeTab === 'workflow' && <WorkflowView />}
            {activeTab === 'challenges' && <ChallengesView />}
            {activeTab === 'implementation' && <ImplementationView />}
          </div>
        </div>

        <div className="bg-gradient-to-r from-green-500 to-emerald-600 text-white p-6 rounded-lg shadow-lg">
          <h3 className="text-2xl font-bold mb-3">核心方案总结</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h4 className="font-semibold mb-2">✓ 技术方案</h4>
              <ul className="space-y-1 text-sm">
                <li>• ProseMirror Decoration（不修改文档）</li>
                <li>• 按元素类型分别处理 Diff</li>
                <li>• 多策略位置匹配</li>
                <li>• 用户确认后才应用修改</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-2">✓ 优势</h4>
              <ul className="space-y-1 text-sm">
                <li>• 可视化 Diff 预览</li>
                <li>• 支持复杂元素（表格、图片）</li>
                <li>• 安全（可撤销）</li>
                <li>• 用户体验好</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EditorDiffSystem;