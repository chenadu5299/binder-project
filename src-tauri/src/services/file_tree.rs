use std::path::{Path, PathBuf};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileTreeNode {
    pub name: String,
    pub path: String,
    pub is_directory: bool,
    pub children: Option<Vec<FileTreeNode>>,
}

pub struct FileTreeService;

impl FileTreeService {
    pub fn new() -> Self {
        Self
    }

    pub fn build_tree(&self, root: &Path, max_depth: usize) -> Result<FileTreeNode, String> {
        if !root.exists() {
            return Err(format!("路径不存在: {}", root.display()));
        }

        if !root.is_dir() {
            return Err(format!("路径不是目录: {}", root.display()));
        }

        self.build_node(root, max_depth, 0)
    }

    fn build_node(
        &self,
        path: &Path,
        max_depth: usize,
        current_depth: usize,
    ) -> Result<FileTreeNode, String> {
        let name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();

        let is_directory = path.is_dir();

        let children = if is_directory && current_depth < max_depth {
            match self.read_directory(path) {
                Ok(mut entries) => {
                    // 排序：目录在前，然后按名称排序
                    entries.sort_by(|a, b| {
                        match (a.is_directory, b.is_directory) {
                            (true, false) => std::cmp::Ordering::Less,
                            (false, true) => std::cmp::Ordering::Greater,
                            _ => a.name.cmp(&b.name),
                        }
                    });

                    Some(
                        entries
                            .into_iter()
                            .filter_map(|entry| {
                                self.build_node(&PathBuf::from(&entry.path), max_depth, current_depth + 1)
                                    .ok()
                            })
                            .collect(),
                    )
                }
                Err(_) => None,
            }
        } else {
            None
        };

        Ok(FileTreeNode {
            name,
            path: path.to_string_lossy().to_string(),
            is_directory,
            children,
        })
    }

    fn read_directory(&self, path: &Path) -> Result<Vec<FileTreeNode>, String> {
        let entries = std::fs::read_dir(path)
            .map_err(|e| format!("读取目录失败: {}", e))?;

        let mut nodes = Vec::new();

        for entry in entries {
            let entry = entry.map_err(|e| format!("读取目录项失败: {}", e))?;
            let path = entry.path();
            let name = entry
                .file_name()
                .to_string_lossy()
                .to_string();

            // 跳过隐藏文件（以 . 开头，除了 . 和 ..）
            if name.starts_with('.') && name != "." && name != ".." {
                continue;
            }

            nodes.push(FileTreeNode {
                name,
                path: path.to_string_lossy().to_string(),
                is_directory: path.is_dir(),
                children: None,
            });
        }

        Ok(nodes)
    }
}

