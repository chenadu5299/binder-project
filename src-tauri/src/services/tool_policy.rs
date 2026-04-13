//! Tool execution continuation policy & delegation boundary definitions.
//!
//! Phase 8 (P3): 为工具密集型任务提供通用续轮策略。
//! 此模块不绑定任何构建模式主链；当前仅供 `ai_commands`
//! 在运行时判断是否允许 TPA 自动续轮、是否开放特定委派场景。

/// 允许 delegation 的场景枚举。
/// P3 阶段仅做预留，不真正开放多 agent。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[allow(dead_code)]
pub enum AllowedDelegationScene {
  /// 资料搜集（只读访问 memory / knowledge / template）
  InformationGathering,
  /// 递归文件检查（list_files + read_file 循环）
  RecursiveFileCheck,
  /// 文件整理（move_file / rename 等组织操作）
  FileOrganization,
}

/// 工具调用预算——限制单次会话中的自动继续轮次。
#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct ToolCallBudget {
  /// 单个会话允许的最大工具调用轮次
  pub max_tool_rounds: usize,
  /// 最大强制继续次数（TPA 驱动）
  pub max_force_continues: usize,
}

impl Default for ToolCallBudget {
  fn default() -> Self {
    Self {
      max_tool_rounds: 20,
      max_force_continues: 5,
    }
  }
}

/// 任务执行策略。
///
/// `active = false` 时（默认），TPA 的 force-continue 逻辑被完全跳过，
/// 模型自停即结束。只有 `active = true` 时才允许 TPA 驱动自动续轮。
///
/// 该策略当前只描述通用工具执行续轮边界，不构成任何构建模式实现。
#[derive(Debug, Clone)]
pub struct TaskExecutionPolicy {
  /// 是否允许自动续轮
  pub active: bool,
  /// 允许的 delegation 场景（空 = 不允许任何 delegation）
  #[allow(dead_code)]
  pub allowed_scenes: Vec<AllowedDelegationScene>,
  /// 工具调用预算
  #[allow(dead_code)]
  pub budget: ToolCallBudget,
}

impl Default for TaskExecutionPolicy {
  fn default() -> Self {
    Self {
      active: false,
      allowed_scenes: Vec::new(),
      budget: ToolCallBudget::default(),
    }
  }
}

impl TaskExecutionPolicy {
  /// 文档编辑链默认关闭自动续轮。
  pub fn for_document_editing() -> Self {
    Self::default()
  }

  /// 文件检查/整理类任务允许有限自动续轮。
  pub fn for_workspace_maintenance() -> Self {
    Self {
      active: true,
      allowed_scenes: vec![
        AllowedDelegationScene::RecursiveFileCheck,
        AllowedDelegationScene::FileOrganization,
      ],
      budget: ToolCallBudget::default(),
    }
  }

  /// TPA 驱动的 force-continue 是否允许
  pub fn allows_tpa_force_continue(&self) -> bool {
    self.active
  }

  /// 是否允许指定的 delegation 场景
  #[allow(dead_code)]
  pub fn allows_delegation(&self, scene: AllowedDelegationScene) -> bool {
    self.active && self.allowed_scenes.contains(&scene)
  }
}
