use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::fs;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Workspace {
    pub path: String,
    pub name: String,
    pub opened_at: String, // ISO 8601 格式
}

pub struct WorkspaceService {
    config_path: PathBuf,
}

impl WorkspaceService {
    pub fn new() -> Result<Self, String> {
        let config_dir = dirs::config_dir()
            .ok_or("无法获取配置目录")?;
        let binder_dir = config_dir.join("binder");
        
        // 创建配置目录
        fs::create_dir_all(&binder_dir)
            .map_err(|e| format!("创建配置目录失败: {}", e))?;

        Ok(Self {
            config_path: binder_dir.join("workspaces.json"),
        })
    }

    pub fn save_workspace(&self, workspace: &Workspace) -> Result<(), String> {
        let mut workspaces = self.load_workspaces()?;
        
        // 移除已存在的同路径工作区
        workspaces.retain(|w| w.path != workspace.path);
        
        // 添加到开头
        workspaces.insert(0, workspace.clone());
        
        // 只保留最近 10 个
        workspaces.truncate(10);
        
        // 保存到文件
        let json = serde_json::to_string_pretty(&workspaces)
            .map_err(|e| format!("序列化失败: {}", e))?;
        fs::write(&self.config_path, json)
            .map_err(|e| format!("写入配置文件失败: {}", e))?;

        Ok(())
    }

    pub fn load_workspaces(&self) -> Result<Vec<Workspace>, String> {
        if !self.config_path.exists() {
            return Ok(Vec::new());
        }

        let content = fs::read_to_string(&self.config_path)
            .map_err(|e| format!("读取配置文件失败: {}", e))?;
        
        serde_json::from_str(&content)
            .map_err(|e| format!("解析配置文件失败: {}", e))
    }

    pub fn open_workspace(&self, path: &str) -> Result<Workspace, String> {
        let workspace = Workspace {
            path: path.to_string(),
            name: PathBuf::from(path)
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("未命名工作区")
                .to_string(),
            opened_at: chrono::Utc::now().to_rfc3339(),
        };

        // 保存到最近工作区列表
        self.save_workspace(&workspace)?;

        Ok(workspace)
    }
}

