export interface FileTreeNode {
  name: string;
  path: string;
  is_directory: boolean;
  children?: FileTreeNode[];
}

// 文件类型枚举
export type FileType = 
  | 'markdown'  // .md
  | 'text'      // .txt
  | 'docx'      // .docx, .doc, .odt, .rtf (文档格式，通过 Pandoc 转换)
  | 'html'      // .html
  | 'pdf'       // .pdf
  | 'image';    // .png, .jpg, etc.

// 文件来源类型
export type FileSource = 
  | 'new'           // 新建
  | 'external'      // 外部导入
  | 'ai_generated'; // AI生成

// 文件打开策略
export interface FileOpenStrategy {
  fileType: FileType;
  source: FileSource;
  canEdit: boolean;
  previewMode: boolean;
  requiresConversion: boolean;
}

