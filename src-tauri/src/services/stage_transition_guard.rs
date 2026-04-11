use serde::{Deserialize, Serialize};

#[allow(dead_code)]
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AgentStage {
  Draft,
  Structured,
  CandidateReady,
  ReviewReady,
  UserConfirmed,
  StageComplete,
  Invalidated,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StageTransitionDecision {
  pub allowed: bool,
  pub from_stage: AgentStage,
  pub to_stage: AgentStage,
  #[serde(skip_serializing_if = "Option::is_none", default)]
  pub reason: Option<String>,
}

pub struct StageTransitionGuard;

#[allow(dead_code)]
impl StageTransitionGuard {
  pub fn can_transition(from: AgentStage, to: AgentStage) -> bool {
    if from == to {
      return true;
    }

    matches!(
      (from, to),
      (AgentStage::Draft, AgentStage::Structured)
        | (AgentStage::Structured, AgentStage::CandidateReady)
        | (AgentStage::CandidateReady, AgentStage::ReviewReady)
        | (AgentStage::ReviewReady, AgentStage::UserConfirmed)
        | (AgentStage::UserConfirmed, AgentStage::StageComplete)
        | (_, AgentStage::Invalidated)
    )
  }

  pub fn decide(from: AgentStage, to: AgentStage, reason: Option<String>) -> StageTransitionDecision {
    StageTransitionDecision {
      allowed: Self::can_transition(from, to),
      from_stage: from,
      to_stage: to,
      reason,
    }
  }
}
