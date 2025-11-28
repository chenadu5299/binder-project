/**
 * 增强型 JSON 修复工具
 * 专门处理 AI 模型（特别是 DeepSeek）返回的畸形 JSON
 */

/**
 * 修复常见的 JSON 语法错误
 * @param brokenJson 损坏的 JSON 字符串
 * @returns 修复后的 JSON 对象，如果修复失败则返回 null
 */
export function aggressiveJSONRepair(brokenJson: string): any | null {
    if (!brokenJson || typeof brokenJson !== 'string') {
        return null;
    }

    let repaired = brokenJson.trim();

    // 如果完全为空，返回空对象
    if (!repaired) {
        return {};
    }

    // 1. 确保以 { 开头
    if (!repaired.startsWith('{')) {
        repaired = '{' + repaired;
    }

    // 2. 修复键名缺少引号的问题
    // 匹配 pattern: {key: 或 ,key: 或 { key: 或 , key:
    repaired = repaired.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');

    // 3. 修复值缺少引号的问题（字符串值）
    // 匹配 pattern: "key": value（value 没有引号但应该是字符串）
    // 排除：数字、布尔值、null、已引号的值、对象、数组
    repaired = repaired.replace(/:\s*([^",\[\]{}]+?)([,}])/g, (match, value, suffix) => {
        const trimmed = value.trim();
        
        // 跳过数字、布尔值、null
        if (/^(true|false|null|-?\d+\.?\d*)$/.test(trimmed)) {
            return match;
        }
        
        // 跳过已经引号的值
        if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
            return match;
        }
        
        // 跳过空值
        if (!trimmed) {
            return match;
        }
        
        // 处理转义字符：如果值中包含转义字符，需要正确处理
        let escapedValue = trimmed
            .replace(/\\/g, '\\\\')  // 转义反斜杠
            .replace(/"/g, '\\"')    // 转义双引号
            .replace(/\n/g, '\\n')   // 转义换行
            .replace(/\r/g, '\\r')   // 转义回车
            .replace(/\t/g, '\\t');  // 转义制表符
        
        return `: "${escapedValue}"${suffix}`;
    });

    // 4. 修复不匹配的引号
    // 处理 "key":value" 这种情况（值只有结束引号）
    repaired = repaired.replace(/:\s*([^"]+?)"/g, (match, value) => {
        const trimmed = value.trim();
        if (trimmed && !trimmed.startsWith('"')) {
            return `: "${trimmed}"`;
        }
        return match;
    });

    // 5. 修复缺失的结束括号
    if (repaired.startsWith('{') && !repaired.endsWith('}')) {
        // 计算未闭合的括号
        let openBraces = (repaired.match(/{/g) || []).length;
        let closeBraces = (repaired.match(/}/g) || []).length;
        let missing = openBraces - closeBraces;
        
        // 移除末尾的逗号（如果有）
        repaired = repaired.replace(/,\s*$/, '');
        
        // 检查是否有未闭合的字符串值
        // 例如：{"path": "test.md", "content": "" 这种情况
        // 如果最后一个值没有闭合引号，先闭合它
        const lastQuoteIndex = repaired.lastIndexOf('"');
        const lastColonIndex = repaired.lastIndexOf(':');
        if (lastColonIndex > lastQuoteIndex && lastQuoteIndex !== -1) {
            // 最后一个值可能是未闭合的字符串
            const afterColon = repaired.substring(lastColonIndex + 1).trim();
            if (afterColon && !afterColon.endsWith('"') && !afterColon.match(/^(true|false|null|-?\d+\.?\d*)$/)) {
                // 如果值不是布尔值、null 或数字，且没有闭合引号，添加引号
                repaired = repaired.replace(/:([^:]*)$/, (match, value) => {
                    const trimmed = value.trim();
                    if (trimmed && !trimmed.startsWith('"') && !trimmed.endsWith('"')) {
                        return `: "${trimmed}"`;
                    }
                    return match;
                });
            }
        }
        
        // 添加缺失的闭合括号
        for (let i = 0; i < missing; i++) {
            repaired += '}';
        }
    }

    // 6. 修复转义字符问题
    // 处理 \\" 这种情况（应该是一个转义的双引号）
    repaired = repaired.replace(/\\\\"/g, '\\"');
    
    // 7. 修复多余的逗号
    // 移除对象/数组末尾的逗号
    repaired = repaired.replace(/,(\s*[}\]])/g, '$1');

    // 8. 尝试解析修复后的 JSON
    try {
        return JSON.parse(repaired);
    } catch (e) {
        console.warn('JSON 修复失败，尝试提取关键参数:', e, '修复后的 JSON:', repaired);
        
        // 如果修复失败，尝试提取关键参数
        return extractKeyParams(brokenJson);
    }
}

/**
 * 从损坏的 JSON 中提取关键参数
 * @param brokenJson 损坏的 JSON 字符串
 * @returns 提取的参数对象
 */
export function extractKeyParams(brokenJson: string): any {
    const params: any = {};

    // 提取 path 参数
    const pathPatterns = [
        /["']?path["']?\s*[:=]\s*["']?([^"',}\s]+)["']?/i,
        /path\s*[:=]\s*([^\s,}]+)/i,
    ];
    for (const pattern of pathPatterns) {
        const match = brokenJson.match(pattern);
        if (match && match[1]) {
            params.path = match[1].trim().replace(/^["']|["']$/g, '');
            break;
        }
    }

    // 提取 content 参数
    const contentPatterns = [
        /["']?content["']?\s*[:=]\s*["']?([^"']+)["']?/i,
        /content\s*[:=]\s*["']?([^"']+)["']?/i,
    ];
    for (const pattern of contentPatterns) {
        const match = brokenJson.match(pattern);
        if (match && match[1]) {
            params.content = match[1].trim().replace(/^["']|["']$/g, '');
            break;
        }
    }

    // 提取 source 参数
    const sourceMatch = brokenJson.match(/["']?source["']?\s*[:=]\s*["']?([^"',}]+)["']?/i);
    if (sourceMatch && sourceMatch[1]) {
        params.source = sourceMatch[1].trim().replace(/^["']|["']$/g, '');
    }

    // 提取 destination 参数
    const destMatch = brokenJson.match(/["']?destination["']?\s*[:=]\s*["']?([^"',}]+)["']?/i);
    if (destMatch && destMatch[1]) {
        params.destination = destMatch[1].trim().replace(/^["']|["']$/g, '');
    }

    // 提取 new_name 参数
    const newNameMatch = brokenJson.match(/["']?new_name["']?\s*[:=]\s*["']?([^"',}]+)["']?/i);
    if (newNameMatch && newNameMatch[1]) {
        params.new_name = newNameMatch[1].trim().replace(/^["']|["']$/g, '');
    }

    // 提取 query 参数
    const queryMatch = brokenJson.match(/["']?query["']?\s*[:=]\s*["']?([^"',}]+)["']?/i);
    if (queryMatch && queryMatch[1]) {
        params.query = queryMatch[1].trim().replace(/^["']|["']$/g, '');
    }

    return Object.keys(params).length > 0 ? params : null;
}

/**
 * 验证 JSON 是否有效
 * @param jsonStr JSON 字符串
 * @returns 是否有效
 */
export function isValidJSON(jsonStr: string): boolean {
    try {
        JSON.parse(jsonStr);
        return true;
    } catch {
        return false;
    }
}

