use anyhow::Result;
use crate::pty::PtySession;
use crate::ws::WsClient;
use super::executor::TaskAssignment;

pub struct ClaudeCodeAgent;

impl ClaudeCodeAgent {
    pub async fn execute(assignment: &TaskAssignment, ws: &WsClient) -> Result<()> {
        // Spawn Claude Code in a PTY
        let mut session = PtySession::spawn(
            if cfg!(windows) { "powershell.exe" } else { "bash" },
            &[],
            None,
        )?;

        // Send the Claude Code command with the task input
        // Using --print flag for non-interactive mode
        let cmd = format!("claude --print \"{}\"", assignment.input.replace('"', "\\\""));
        session.send_command(&cmd)?;

        // Stream output back
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
