export interface FileTreeNode {
  name: string;
  path: string;
  is_directory: boolean;
  children?: FileTreeNode[];
}

