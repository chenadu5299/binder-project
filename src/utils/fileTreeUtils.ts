// 文件树工具函数
import { FileTreeNode } from '../types/file';

// 扁平化文件树为文件列表
export function flattenFileTree(node: FileTreeNode, basePath: string = ''): Array<{ name: string; path: string; isDirectory: boolean }> {
    const result: Array<{ name: string; path: string; isDirectory: boolean }> = [];
    const currentPath = basePath ? `${basePath}/${node.name}` : node.name;
    
    if (!node.is_directory) {
        result.push({
            name: node.name,
            path: currentPath,
            isDirectory: false,
        });
    }
    
    if (node.children) {
        for (const child of node.children) {
            result.push(...flattenFileTree(child, currentPath));
        }
    }
    
    return result;
}

// 过滤文件（只返回文件，不包括文件夹）
export function filterFiles(nodes: Array<{ name: string; path: string; isDirectory: boolean }>): Array<{ name: string; path: string }> {
    return nodes
        .filter(node => !node.isDirectory)
        .map(node => ({ name: node.name, path: node.path }));
}

