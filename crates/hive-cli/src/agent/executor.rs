use anyhow::Result;
use crate::ws::WsClient;

pub struct TaskAssignment {
    pub task_id: String,
    pub lease_id: String,
    pub agent_kind: String,
    pub input: String,
    pub timeout_ms: u64,
}

impl TaskAssignment {
    pub fn from_ws_payload(payload: &serde_json::Value) -> Option<Self> {
        Some(Self {
            task_id: payload.get("taskId")?.as_str()?.to_string(),
            lease_id: payload.get("leaseId")?.as_str()?.to_string(),
            agent_kind: payload.get("agentKind")?.as_str()?.to_string(),
            input: payload.get("input")?.as_str()?.to_string(),
            timeout_ms: payload.get("timeoutMs")?.as_u64()?,
        })
    }
}

pub struct TaskExecutor;

impl TaskExecutor {
    /// Execute a task assignment using the appropriate agent
    pub async fn execute(
        assignment: &TaskAssignment,
        ws: &WsClient,
    ) -> Result<()> {
        tracing::info!(
            task_id = %assignment.task_id,
            agent = %assignment.agent_kind,
            "Starting task execution"
        );

        let result = match assignment.agent_kind.as_str() {
            "cc" => super::ClaudeCodeAgent::execute(assignment, ws).await,
            "cx" => super::CodexAgent::execute(assignment, ws).await,
            "generic" => super::GenericAgent::execute(assignment, ws).await,
            other => {
                anyhow::bail!("Unknown agent kind: {}", other);
            }
        };

        match &result {
            Ok(()) => {
                ws.send_result(
                    &assignment.task_id,
                    &assignment.lease_id,
                    "done",
                    Some("Task completed successfully"),
                    None,
                )
                .await?;
            }
            Err(e) => {
                ws.send_result(
                    &assignment.task_id,
                    &assignment.lease_id,
                    "failed",
                    None,
                    Some(&e.to_string()),
                )
                .await?;
            }
        }

        result
    }
}
