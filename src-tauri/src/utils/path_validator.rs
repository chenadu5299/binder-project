use std::path::{Path, PathBuf};
use std::fs;

/// 路径验证错误
#[derive(Debug, Clone)]
pub enum PathValidationError {
    EmptyPath,
    NotAbsolute,
    OutsideWorkspace,
    InvalidCharacters,
    SymlinkNotAllowed,
    NotExists,
}

impl std::fmt::Display for PathValidationError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            PathValidationError::EmptyPath => write!(f, "路径不能为空"),
            PathValidationError::NotAbsolute => write!(f, "路径必须是绝对路径"),
            PathValidationError::OutsideWorkspace => write!(f, "路径在工作区之外"),
            PathValidationError::InvalidCharacters => write!(f, "路径包含非法字符"),
            PathValidationError::SymlinkNotAllowed => write!(f, "不支持符号链接"),
            PathValidationError::NotExists => write!(f, "路径不存在"),
        }
    }
}

impl std::error::Error for PathValidationError {}

/// 路径验证工具
pub struct PathValidator;

impl PathValidator {
    /// 验证路径是否安全且在工作区内
    pub fn validate_workspace_path(
        path: &Path,
        workspace_path: &Path,
    ) -> Result<PathBuf, PathValidationError> {
        // 检查路径是否为空
        if path.as_os_str().is_empty() {
            return Err(PathValidationError::EmptyPath);
        }

        // 规范化路径
        let normalized_path = path.canonicalize()
            .map_err(|_| PathValidationError::NotExists)?;

        // 检查是否为符号链接（安全检查）
        if normalized_path.is_symlink() {
            return Err(PathValidationError::SymlinkNotAllowed);
        }

        // 规范化工作区路径
        let normalized_workspace = workspace_path.canonicalize()
            .map_err(|_| PathValidationError::NotExists)?;

        // 检查路径是否在工作区内
        if !normalized_path.starts_with(&normalized_workspace) {
            return Err(PathValidationError::OutsideWorkspace);
        }

        // 检查路径遍历攻击（包含 ..）
        let path_str = normalized_path.to_string_lossy();
        if path_str.contains("..") {
            return Err(PathValidationError::OutsideWorkspace);
        }

        Ok(normalized_path)
    }

    /// 验证文件名是否安全
    pub fn validate_filename(filename: &str) -> Result<(), PathValidationError> {
        if filename.is_empty() {
            return Err(PathValidationError::EmptyPath);
        }

        // 检查非法字符（Windows 和 Unix 通用）
        let invalid_chars = ['/', '\\', ':', '*', '?', '"', '<', '>', '|'];
        if filename.chars().any(|c| invalid_chars.contains(&c)) {
            return Err(PathValidationError::InvalidCharacters);
        }

        // 检查保留名称（Windows）
        let reserved_names = ["CON", "PRN", "AUX", "NUL",
            "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
            "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9"];
        let upper_filename = filename.to_uppercase();
        if reserved_names.iter().any(|&name| upper_filename == name) {
            return Err(PathValidationError::InvalidCharacters);
        }

        // 检查结尾的点和空格（Windows）
        if filename.trim_end().ends_with('.') || filename.trim_end().ends_with(' ') {
            return Err(PathValidationError::InvalidCharacters);
        }

        Ok(())
    }

    /// 安全地拼接路径
    pub fn join_paths(base: &Path, relative: &str) -> Result<PathBuf, PathValidationError> {
        // 先验证相对路径
        if relative.contains("..") {
            return Err(PathValidationError::OutsideWorkspace);
        }

        let joined = base.join(relative);
        
        // 规范化并检查
        joined.canonicalize()
            .map_err(|_| PathValidationError::NotExists)
    }
}

