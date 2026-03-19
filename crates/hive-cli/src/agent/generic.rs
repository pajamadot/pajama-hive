use anyhow::Result;
use crate::pty::PtySession;
use crate::ws::WsClient;
use super::executor::TaskAssignment;

pub struct GenericAgent;

impl GenericAgent {
    pub async fn execute(assignment: &TaskAssignment, ws: &WsClient) -> Result<()> {
        let mut session = PtySession::spawn(
            if cfg!(windows) { "powershell.exe" } else { "bash" },
            &[],
            None,
        )?;

        // For generic agent, the input IS the command to run
        session.send_command(&assignment.input)?;

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
