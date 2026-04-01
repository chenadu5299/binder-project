//! 流式对话统一状态机：区分正常完成与用户取消，避免重复收口与误写 assistant。

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StreamState {
  Streaming,
  Completed,
  Cancelled,
}

#[derive(Debug, Clone)]
pub struct StreamContext {
  pub state: StreamState,
}

impl Default for StreamContext {
  fn default() -> Self {
    Self {
      state: StreamState::Streaming,
    }
  }
}

/// 统一收口：仅从 `Streaming` 进入终态，重复调用无效。
pub fn finalize_stream(ctx: &mut StreamContext, reason: StreamState) {
  if ctx.state != StreamState::Streaming {
    return;
  }
  match reason {
    StreamState::Streaming => {}
    StreamState::Completed => {
      ctx.state = StreamState::Completed;
    }
    StreamState::Cancelled => {
      ctx.state = StreamState::Cancelled;
    }
  }
}

/// 工具轮次等多段 `chat_stream` 之前：从上一轮的 `Completed` 回到 `Streaming`。
/// 已取消的会话不会恢复。
pub fn begin_next_stream_round(ctx: &mut StreamContext) {
  if ctx.state == StreamState::Cancelled {
    return;
  }
  if ctx.state == StreamState::Completed {
    ctx.state = StreamState::Streaming;
  }
}

pub fn stream_state_label(state: StreamState) -> &'static str {
  match state {
    StreamState::Streaming => "streaming",
    StreamState::Completed => "completed",
    StreamState::Cancelled => "cancelled",
  }
}
