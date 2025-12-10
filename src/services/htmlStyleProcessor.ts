/**
 * HTML 样式处理器
 * 用于将 Pandoc 生成的 HTML 中的 CSS 类转换为内联样式
 * 确保 TipTap 编辑器能够正确解析和保留格式
 */

/**
 * 将 CSS 类转换为内联样式
 * 处理常见的格式：颜色、对齐、字号等
 */
export function processHTMLStyles(html: string): string {
  // 创建一个临时 DOM 元素来解析 HTML
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  
  // 处理所有元素，将样式信息转换为内联样式
  const processElement = (element: Element) => {
    // 转换为 HTMLElement 以访问 style 属性
    const htmlElement = element as HTMLElement;
    
    // 获取计算样式（如果可能）
    const computedStyle = window.getComputedStyle(htmlElement);
    
    // 检查是否有需要保留的样式
    const styles: string[] = [];
    
    // 颜色
    const color = element.getAttribute('data-color') || 
                  (htmlElement.style?.color || '') || 
                  (computedStyle && computedStyle.color !== 'rgb(0, 0, 0)' ? computedStyle.color : null);
    if (color && color !== 'rgb(0, 0, 0)' && color !== '#000000') {
      styles.push(`color: ${color}`);
    }
    
    // 文本对齐
    const textAlign = (htmlElement.style?.textAlign || '') || 
                      (computedStyle && computedStyle.textAlign !== 'start' ? computedStyle.textAlign : null);
    if (textAlign && textAlign !== 'start' && textAlign !== 'left') {
      styles.push(`text-align: ${textAlign}`);
    }
    
    // 字号
    const fontSize = (htmlElement.style?.fontSize || '') || 
                    (computedStyle && computedStyle.fontSize ? computedStyle.fontSize : null);
    if (fontSize) {
      styles.push(`font-size: ${fontSize}`);
    }
    
    // 字体族
    const fontFamily = (htmlElement.style?.fontFamily || '') || 
                       (computedStyle && computedStyle.fontFamily ? computedStyle.fontFamily : null);
    if (fontFamily && fontFamily !== 'inherit') {
      styles.push(`font-family: ${fontFamily}`);
    }
    
    // 如果有样式，添加到元素的 style 属性
    if (styles.length > 0) {
      const existingStyle = element.getAttribute('style') || '';
      const newStyle = existingStyle 
        ? `${existingStyle}; ${styles.join('; ')}`
        : styles.join('; ');
      element.setAttribute('style', newStyle);
    }
    
    // 递归处理子元素
    Array.from(element.children).forEach(child => {
      processElement(child as Element);
    });
  };
  
  // 处理 body 中的所有元素
  const body = doc.body;
  if (body) {
    Array.from(body.children).forEach(child => {
      processElement(child as Element);
    });
  }
  
  // 返回处理后的 HTML
  return body ? body.innerHTML : html;
}

/**
 * 增强 HTML 内容，确保样式信息完整
 * 主要用于处理 Pandoc 转换后的 HTML
 */
export function enhanceHTMLContent(html: string): string {
  // 使用 DOM 解析器处理 HTML，更可靠
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  
  // 0. 先检查实际的 HTML 结构
  const bodyContent = doc.body ? doc.body.innerHTML.substring(0, 500) : '';
  console.log('📄 HTML body 内容预览:', bodyContent);
  
  // 检查所有元素，看看格式是如何表示的
  const allElementsForCheck = doc.querySelectorAll('*');
  console.log(`📄 总共有 ${allElementsForCheck.length} 个元素`);
  
  // 检查前几个元素的属性
  let foundElements = 0;
  try {
    Array.from(allElementsForCheck).forEach((el, idx) => {
      if (foundElements >= 10) return;
      const tagName = el.tagName.toLowerCase();
      const className = typeof el.className === 'string' ? el.className : '';
      const style = el.getAttribute('style');
      const align = el.getAttribute('align');
      const textContent = el.textContent?.trim();
      
      // 只记录有意义的元素（有内容或属性）
      if (className || style || align || (textContent && textContent.length > 0 && ['p', 'h1', 'h2', 'h3', 'div', 'span'].includes(tagName))) {
        console.log(`📄 元素 ${idx} (${tagName}):`, {
          className: className || '(无)',
          style: style || '(无)',
          align: align || '(无)',
          textContent: textContent?.substring(0, 50) || '(空)',
          outerHTML: el.outerHTML?.substring(0, 100) || '(无法获取)'
        });
        foundElements++;
      }
    });
  } catch (error) {
    console.error('❌ 检查元素时出错:', error);
  }
  
  // 1. 提取 <style> 标签中的样式规则
  const styleRules: Map<string, string> = new Map();
  const styleElements = doc.querySelectorAll('style');
  
  let fullStyleContent = '';
  styleElements.forEach(styleEl => {
    const styleContent = styleEl.textContent || '';
    fullStyleContent += styleContent;
    
    // 解析 CSS 规则：.class-name { property: value; }
    const ruleRegex = /\.([a-zA-Z0-9_-]+)\s*\{([^}]+)\}/g;
    let ruleMatch;
    while ((ruleMatch = ruleRegex.exec(styleContent)) !== null) {
      const className = ruleMatch[1];
      const styles = ruleMatch[2].trim();
      // 合并相同类名的样式
      if (styleRules.has(className)) {
        styleRules.set(className, `${styleRules.get(className)}; ${styles}`);
      } else {
        styleRules.set(className, styles);
      }
    }
    
    // 也解析标签选择器（如 p { ... }, h1 { ... }）
    const tagRuleRegex = /(p|h[1-6]|div|span|td|th)\s*\{([^}]+)\}/g;
    let tagMatch;
    while ((tagMatch = tagRuleRegex.exec(styleContent)) !== null) {
      const tagName = tagMatch[1];
      const styles = tagMatch[2].trim();
      // 将标签样式应用到所有该标签的元素
      const elements = doc.querySelectorAll(tagName);
      elements.forEach(element => {
        const existingStyle = element.getAttribute('style') || '';
        const mergedStyle = mergeStyles(existingStyle, styles);
        element.setAttribute('style', mergedStyle);
      });
      console.log(`✅ 为 ${elements.length} 个 <${tagName}> 元素应用样式`);
    }
  });
  
  console.log('📝 完整 style 内容长度:', fullStyleContent.length);
  console.log('📝 style 内容预览:', fullStyleContent.substring(0, 300));
  
  console.log(`📝 提取到 ${styleRules.size} 个 CSS 类规则`);
  if (styleRules.size > 0) {
    console.log('📝 CSS 类规则详情:', Array.from(styleRules.entries()).map(([k, v]) => `${k}: ${v.substring(0, 50)}`));
  }
  
  // 2. 将 CSS 类转换为内联样式
  let convertedCount = 0;
  styleRules.forEach((styles, className) => {
    // 查找所有使用该类的元素
    const elements = doc.querySelectorAll(`.${className}`);
    console.log(`🔍 查找类 "${className}": 找到 ${elements.length} 个元素`);
    elements.forEach(element => {
      const existingStyle = element.getAttribute('style') || '';
      // 合并样式，避免重复属性
      const mergedStyle = mergeStyles(existingStyle, styles);
      element.setAttribute('style', mergedStyle);
      convertedCount++;
    });
  });
  console.log(`✅ 转换了 ${convertedCount} 个元素的样式`);
  
  // 2.5 处理所有带有 class 属性的元素（即使没有在 style 标签中定义）
  // 这可以处理一些特殊情况
  const allClassElements = doc.querySelectorAll('[class]');
  console.log(`🔍 找到 ${allClassElements.length} 个带 class 属性的元素`);
  
  allClassElements.forEach(element => {
    const classList = element.className;
    if (typeof classList === 'string') {
      const classes = classList.split(/\s+/).filter(c => c);
      classes.forEach(className => {
        // 如果这个类在 styleRules 中，确保样式已应用
        if (styleRules.has(className)) {
          const existingStyle = element.getAttribute('style') || '';
          const styles = styleRules.get(className)!;
          const mergedStyle = mergeStyles(existingStyle, styles);
          if (mergedStyle !== existingStyle) {
            element.setAttribute('style', mergedStyle);
            console.log(`✅ 为元素应用类 "${className}" 的样式`);
          }
        }
      });
    }
  });
  
  // 3. 处理特定的格式标记
  // 处理居中对齐（center, text-center 类）
  ['center', 'text-center'].forEach(className => {
    const elements = doc.querySelectorAll(`.${className}`);
    console.log(`🔍 查找居中对齐类 "${className}": 找到 ${elements.length} 个元素`);
    elements.forEach(element => {
      const existingStyle = element.getAttribute('style') || '';
      if (!existingStyle.includes('text-align')) {
        const newStyle = existingStyle
          ? `${existingStyle}; text-align: center`
          : 'text-align: center';
        element.setAttribute('style', newStyle);
        console.log(`✅ 为元素添加居中对齐样式`);
      }
    });
  });
  
  // 3.5 处理 align 属性（Pandoc 可能使用 align 属性而不是 CSS）
  const alignElements = doc.querySelectorAll('[align]');
  console.log(`🔍 找到 ${alignElements.length} 个带 align 属性的元素`);
  alignElements.forEach(element => {
    const align = element.getAttribute('align');
    if (align) {
      const existingStyle = element.getAttribute('style') || '';
      if (!existingStyle.includes('text-align:')) {
        const newStyle = existingStyle
          ? `${existingStyle}; text-align: ${align}`
          : `text-align: ${align}`;
        element.setAttribute('style', newStyle);
        console.log(`✅ 将 align="${align}" 转换为内联样式`);
      }
    }
  });
  
  // 4. 处理内联样式中的颜色信息
  // 确保所有颜色信息都被保留和规范化
  const allElementsForNormalize = doc.querySelectorAll('*');
  allElementsForNormalize.forEach(element => {
    const style = element.getAttribute('style');
    if (style) {
      // 规范化样式格式
      const normalizedStyle = normalizeStyle(style);
      element.setAttribute('style', normalizedStyle);
    }
  });
  
  // 5. 确保所有格式属性都被保留
  // 处理可能丢失的格式信息
  preserveFormatting(doc);
  
  // 最终诊断：检查转换结果
  const finalInlineStyleCount = doc.querySelectorAll('[style]').length;
  const finalCenterStyleCount = doc.querySelectorAll('[style*="text-align: center"], [style*="text-align:center"]').length;
  const finalColorStyleCount = doc.querySelectorAll('[style*="color:"]').length;
  
  console.log('🎨 最终样式统计:', {
    inlineStyles: finalInlineStyleCount,
    centerStyles: finalCenterStyleCount,
    colorStyles: finalColorStyleCount
  });
  
  // 返回处理后的 HTML
  // 如果是完整 HTML（包含 <html>, <head>, <body>），返回完整文档
  // 如果只是 body 内容，返回 body 内容
  const hasHtmlTag = html.includes('<html') || html.includes('<!DOCTYPE') || html.includes('<HTML');
  
  if (hasHtmlTag) {
    // 完整 HTML 文档，返回完整内容（包括 <style> 标签）
    // 这对于 iframe 预览很重要，需要保留 <style> 标签
    const result = doc.documentElement.outerHTML;
    // 验证结果
    const resultInlineStyleCount = (result.match(/style="[^"]*"/gi) || []).length;
    console.log('📄 返回完整 HTML，内联样式数:', resultInlineStyleCount);
    return result;
  } else {
    // 只是 body 内容，返回 body 内容
    const result = doc.body ? doc.body.innerHTML : html;
    const resultInlineStyleCount = (result.match(/style="[^"]*"/gi) || []).length;
    console.log('📄 返回 body 内容，内联样式数:', resultInlineStyleCount);
    return result;
  }
}

/**
 * 合并样式字符串，避免重复属性
 */
function mergeStyles(existingStyle: string, newStyles: string): string {
  if (!existingStyle) return newStyles;
  if (!newStyles) return existingStyle;
  
  // 解析现有样式
  const existingProps = new Map<string, string>();
  existingStyle.split(';').forEach(part => {
    const [prop, value] = part.split(':').map(s => s.trim());
    if (prop && value) {
      existingProps.set(prop.toLowerCase(), value);
    }
  });
  
  // 解析新样式
  newStyles.split(';').forEach(part => {
    const [prop, value] = part.split(':').map(s => s.trim());
    if (prop && value) {
      existingProps.set(prop.toLowerCase(), value);
    }
  });
  
  // 重新组合
  return Array.from(existingProps.entries())
    .map(([prop, value]) => `${prop}: ${value}`)
    .join('; ');
}

/**
 * 规范化样式字符串
 */
function normalizeStyle(style: string): string {
  // 移除多余空格
  let normalized = style.replace(/\s+/g, ' ').trim();
  
  // 确保每个属性后都有分号（最后一个除外）
  const parts = normalized.split(';').map(p => p.trim()).filter(p => p);
  return parts.join('; ');
}

/**
 * 保留格式信息
 */
function preserveFormatting(doc: Document): void {
  // 处理可能丢失的颜色信息
  const colorElements = doc.querySelectorAll('[data-color], [color]');
  colorElements.forEach(element => {
    const color = element.getAttribute('data-color') || element.getAttribute('color');
    if (color) {
      const existingStyle = element.getAttribute('style') || '';
      if (!existingStyle.includes('color:')) {
        element.setAttribute('style', `${existingStyle}; color: ${color}`.trim());
      }
    }
  });
  
  // 处理可能丢失的对齐信息
  const alignElements = doc.querySelectorAll('[align]');
  alignElements.forEach(element => {
    const align = element.getAttribute('align');
    if (align) {
      const existingStyle = element.getAttribute('style') || '';
      if (!existingStyle.includes('text-align:')) {
        element.setAttribute('style', `${existingStyle}; text-align: ${align}`.trim());
      }
    }
  });
  
  // 关键：处理所有可能包含颜色或对齐信息的元素
  // 检查所有元素的内联样式，确保颜色和对齐信息完整
  const allElements = doc.querySelectorAll('*');
  allElements.forEach(element => {
    const style = element.getAttribute('style') || '';
    
    // 检查是否有颜色相关的类或属性，但没有内联颜色样式
    const hasColorClass = element.className && (
      element.className.includes('color') || 
      element.className.includes('red') ||
      element.className.includes('blue') ||
      element.className.includes('green')
    );
    
    if (hasColorClass && !style.includes('color:')) {
      // 尝试从类名推断颜色（简化处理）
      // 这里可以扩展更复杂的颜色映射逻辑
      const newStyle = style ? `${style}; color: inherit` : 'color: inherit';
      element.setAttribute('style', newStyle);
    }
    
    // 检查是否有对齐相关的类或属性，但没有内联对齐样式
    const hasAlignClass = element.className && (
      element.className.includes('center') ||
      element.className.includes('left') ||
      element.className.includes('right') ||
      element.className.includes('justify')
    );
    
    if (hasAlignClass && !style.includes('text-align:')) {
      // 从类名推断对齐方式
      let alignValue = 'left';
      if (element.className.includes('center')) alignValue = 'center';
      else if (element.className.includes('right')) alignValue = 'right';
      else if (element.className.includes('justify')) alignValue = 'justify';
      
      const newStyle = style ? `${style}; text-align: ${alignValue}` : `text-align: ${alignValue}`;
      element.setAttribute('style', newStyle);
    }
  });
}

