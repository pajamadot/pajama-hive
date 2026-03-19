use anyhow::Result;
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use tokio::sync::mpsc;
use tokio_tungstenite::{connect_async, tungstenite::Message};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WsMessage {
    #[serde(rename = "type")]
    pub msg_type: String,
    #[serde(rename = "requestId")]
    pub request_id: String,
    pub ts: String,
    pub payload: serde_json::Value,
}

impl WsMessage {
    pub fn new(msg_type: &str, payload: serde_json::Value) -> Self {
        Self {
            msg_type: msg_type.to_string(),
            request_id: uuid::Uuid::new_v4().to_string(),
            ts: chrono::Utc::now().to_rfc3339(),
            payload,
        }
    }
}

pub struct WsClient {
    pub outgoing: mpsc::Sender<WsMessage>,
    pub incoming: mpsc::Receiver<WsMessage>,
}

impl WsClient {
    pub async fn connect(url: &str, token: &str) -> Result<Self> {
        let ws_url = format!("{}/v1/ws?token={}&role=worker", url, token);

        let (ws_stream, _) = connect_async(&ws_url).await?;
        let (mut write, mut read) = ws_stream.split();

        let (outgoing_tx, mut outgoing_rx) = mpsc::channel::<WsMessage>(64);
        let (incoming_tx, incoming_rx) = mpsc::channel::<WsMessage>(64);

        // Writer task
        tokio::spawn(async move {
            while let Some(msg) = outgoing_rx.recv().await {
                if let Ok(json) = serde_json::to_string(&msg) {
                    if write.send(Message::Text(json)).await.is_err() {
                        break;
                    }
                }
            }
        });

        // Reader task
        tokio::spawn(async move {
            while let Some(Ok(msg)) = read.next().await {
                if let Message::Text(text) = msg {
                    if let Ok(ws_msg) = serde_json::from_str::<WsMessage>(&text) {
                        if incoming_tx.send(ws_msg).await.is_err() {
                            break;
                        }
                    }
                }
            }
        });

        Ok(Self {
            outgoing: outgoing_tx,
            incoming: incoming_rx,
        })
    }

    pub async fn send(&self, msg: WsMessage) -> Result<()> {
        self.outgoing.send(msg).await?;
        Ok(())
    }

    pub async fn register(
        &self,
        worker_id: &str,
        agent_kinds: &[String],
        capabilities: &[String],
        max_concurrency: u32,
    ) -> Result<()> {
        let msg = WsMessage::new(
            "worker.register",
            serde_json::json!({
                "workerId": worker_id,
                "agentKinds": agent_kinds,
                "capabilities": capabilities,
                "workspaces": [],
                "maxConcurrency": max_concurrency,
                "version": env!("CARGO_PKG_VERSION"),
            }),
        );
        self.send(msg).await
    }

    pub async fn heartbeat(&self, worker_id: &str) -> Result<()> {
        let msg = WsMessage::new(
            "worker.heartbeat",
            serde_json::json!({ "workerId": worker_id }),
        );
        self.send(msg).await
    }

    pub async fn pull_task(&self, worker_id: &str, idle_slots: u32) -> Result<()> {
        let msg = WsMessage::new(
            "task.pull",
            serde_json::json!({ "workerId": worker_id, "idleSlots": idle_slots }),
        );
        self.send(msg).await
    }

    pub async fn send_log(&self, task_id: &str, lease_id: &str, stream: &str, chunk: &str) -> Result<()> {
        let msg = WsMessage::new(
            "task.log",
            serde_json::json!({
                "taskId": task_id,
                "leaseId": lease_id,
                "stream": stream,
                "chunk": chunk,
            }),
        );
        self.send(msg).await
    }

    pub async fn send_result(
        &self,
        task_id: &str,
        lease_id: &str,
        status: &str,
        summary: Option<&str>,
        error_message: Option<&str>,
    ) -> Result<()> {
        let msg = WsMessage::new(
            "task.result",
            serde_json::json!({
                "taskId": task_id,
                "leaseId": lease_id,
                "status": status,
                "summary": summary,
                "errorMessage": error_message,
            }),
        );
        self.send(msg).await
    }
}
