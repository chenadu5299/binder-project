use std::path::{Component, Path, PathBuf};

/// 路径验证错误
#[derive(Debug, Clone)]
pub enum PathValidationError {
  EmptyPath,
  NotAbsolute,
  OutsideWorkspace,
  InvalidCharacters,
  InvalidRelativePath,
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
      PathValidationError::InvalidRelativePath => write!(f, "路径必须是工作区内的相对路径"),
      PathValidationError::SymlinkNotAllowed => write!(f, "不支持符号链接"),
      PathValidationError::NotExists => write!(f, "路径不存在"),
    }
  }
}

impl std::error::Error for PathValidationError {}

/// 路径验证工具
pub struct PathValidator;

impl PathValidator {
  fn canonical_workspace_root(workspace_path: &Path) -> Result<PathBuf, PathValidationError> {
    if workspace_path.as_os_str().is_empty() {
      return Err(PathValidationError::EmptyPath);
    }
    if !workspace_path.is_absolute() {
      return Err(PathValidationError::NotAbsolute);
    }
    let canonical = workspace_path
      .canonicalize()
      .map_err(|_| PathValidationError::NotExists)?;
    if Self::path_is_symlink(&canonical)? {
      return Err(PathValidationError::SymlinkNotAllowed);
    }
    Ok(canonical)
  }

  fn path_is_symlink(path: &Path) -> Result<bool, PathValidationError> {
    Ok(
      std::fs::symlink_metadata(path)
        .map_err(|_| PathValidationError::NotExists)?
        .file_type()
        .is_symlink(),
    )
  }

  fn assert_existing_path_safe(
    path: &Path,
    workspace_root: &Path,
  ) -> Result<PathBuf, PathValidationError> {
    if !path.exists() {
      return Err(PathValidationError::NotExists);
    }
    if Self::path_is_symlink(path)? {
      return Err(PathValidationError::SymlinkNotAllowed);
    }
    let canonical = path
      .canonicalize()
      .map_err(|_| PathValidationError::NotExists)?;
    if !canonical.starts_with(workspace_root) {
      return Err(PathValidationError::OutsideWorkspace);
    }
    Ok(canonical)
  }

  fn sanitize_relative_path(relative: &Path) -> Result<PathBuf, PathValidationError> {
    if relative.as_os_str().is_empty() {
      return Err(PathValidationError::EmptyPath);
    }
    if relative.is_absolute() {
      return Err(PathValidationError::InvalidRelativePath);
    }

    let mut sanitized = PathBuf::new();
    for component in relative.components() {
      match component {
        Component::Normal(part) => sanitized.push(part),
        Component::CurDir => {}
        Component::ParentDir | Component::RootDir | Component::Prefix(_) => {
          return Err(PathValidationError::InvalidRelativePath);
        }
      }
    }

    if sanitized.as_os_str().is_empty() {
      return Err(PathValidationError::EmptyPath);
    }

    Ok(sanitized)
  }

  fn resolve_joined_path(
    workspace_root: &Path,
    candidate: &Path,
  ) -> Result<PathBuf, PathValidationError> {
    if !candidate.starts_with(workspace_root) {
      return Err(PathValidationError::OutsideWorkspace);
    }

    let mut current = workspace_root.to_path_buf();
    if Self::path_is_symlink(&current)? {
      return Err(PathValidationError::SymlinkNotAllowed);
    }

    let relative = candidate
      .strip_prefix(workspace_root)
      .map_err(|_| PathValidationError::OutsideWorkspace)?;
    for component in relative.components() {
      match component {
        Component::Normal(part) => {
          current.push(part);
          if current.exists() {
            Self::assert_existing_path_safe(&current, workspace_root)?;
          }
        }
        Component::CurDir => {}
        Component::ParentDir | Component::RootDir | Component::Prefix(_) => {
          return Err(PathValidationError::InvalidRelativePath);
        }
      }
    }

    Ok(current)
  }

  /// 验证已存在的绝对路径是否在工作区内，且链路上不经过符号链接。
  pub fn validate_workspace_path(
    path: &Path,
    workspace_path: &Path,
  ) -> Result<PathBuf, PathValidationError> {
    if path.as_os_str().is_empty() {
      return Err(PathValidationError::EmptyPath);
    }
    if !path.is_absolute() {
      return Err(PathValidationError::NotAbsolute);
    }

    let workspace_root = Self::canonical_workspace_root(workspace_path)?;
    Self::assert_existing_path_safe(path, &workspace_root)
  }

  /// 解析工作区内的相对写入目标。目标可以尚不存在，但现有祖先路径必须安全且不经过符号链接。
  pub fn resolve_workspace_relative_path(
    workspace_path: &Path,
    relative_path: &str,
  ) -> Result<PathBuf, PathValidationError> {
    let workspace_root = Self::canonical_workspace_root(workspace_path)?;
    let sanitized = Self::sanitize_relative_path(Path::new(relative_path))?;
    let candidate = workspace_root.join(sanitized);
    Self::resolve_joined_path(&workspace_root, &candidate)
  }

  /// 验证工作区内的绝对写入目标。目标可以不存在，但必须位于工作区内且现有祖先路径安全。
  pub fn validate_workspace_write_target(
    target_path: &Path,
    workspace_path: &Path,
  ) -> Result<PathBuf, PathValidationError> {
    if target_path.as_os_str().is_empty() {
      return Err(PathValidationError::EmptyPath);
    }
    if !target_path.is_absolute() {
      return Err(PathValidationError::NotAbsolute);
    }

    let workspace_root = Self::canonical_workspace_root(workspace_path)?;
    Self::resolve_joined_path(&workspace_root, target_path)
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
    let reserved_names = [
      "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8",
      "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
    ];
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
    let sanitized = Self::sanitize_relative_path(Path::new(relative))?;
    Ok(base.join(sanitized))
  }
}
