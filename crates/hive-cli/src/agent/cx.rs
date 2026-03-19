use anyhow::Result;
use crate::pty::PtySession;
use crate::ws::WsClient;
use super::executor::TaskAssignment;

pub struct CodexAgent;

impl CodexAgent {
    pub async fn execute(assignment: &TaskAssignment, ws: &WsClient) -> Result<()> {
        let mut session = PtySession::spawn(
            if cfg!(windows) { "powershell.exe" } else { "bash" },
            &[],
            None,
        )?;

        // Send the Codex CLI command with the task input
        let cmd = format!("codex \"{}\"", assignment.input.replace('"', "\\\""));
        session.send_command(&cmd)?;

        while let Some(line) = session.read_line().await {
            ws.send_log(
                &assignment.task_id,
                &assignment.lease_id,
                "stdout",
                &format!("{}\r\n", line),
            )
            .await?;
        }

        Ok(())
    }
}
