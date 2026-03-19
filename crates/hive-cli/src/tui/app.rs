use anyhow::Result;
use crossterm::{
    event::{self, Event, KeyCode, KeyEventKind},
    execute,
    terminal::{disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen},
};
use ratatui::prelude::*;
use std::io;
use std::time::Duration;
use tokio::time::interval;

use crate::agent::executor::{TaskAssignment, TaskExecutor};
use crate::ws::WsClient;
use super::ui;

pub struct TuiConfig {
    pub server_url: String,
    pub token: String,
    pub agent_kinds: Vec<String>,
    pub capabilities: Vec<String>,
    pub max_concurrency: u32,
}

pub struct AppState {
    pub connected: bool,
    pub worker_id: String,
    pub current_task: Option<TaskAssignment>,
    pub logs: Vec<String>,
    pub status_message: String,
    pub should_quit: bool,
    pub tasks_completed: u32,
    pub tasks_failed: u32,
}

pub async fn run_tui(config: TuiConfig) -> Result<()> {
    enable_raw_mode()?;
    let mut stdout = io::stdout();
    execute!(stdout, EnterAlternateScreen)?;
    let backend = CrosstermBackend::new(stdout);
    let mut terminal = Terminal::new(backend)?;

    let worker_id = crate::config::load_config()?
        .worker_id
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());

    let mut state = AppState {
        connected: false,
        worker_id: worker_id.clone(),
        current_task: None,
        logs: vec!["Starting Pajama Hive agent...".to_string()],
        status_message: "Connecting...".to_string(),
        should_quit: false,
        tasks_completed: 0,
        tasks_failed: 0,
    };

    state.logs.push(format!("Connecting to {}...", config.server_url));

    let mut ws = match WsClient::connect(&config.server_url, &config.token).await {
        Ok(ws) => {
            state.connected = true;
            state.status_message = "Connected".to_string();
            state.logs.push("Connected to server".to_string());
            ws
        }
        Err(e) => {
            state.logs.push(format!("Connection failed: {}", e));
            state.status_message = format!("Error: {}", e);
            show_error_tui(&mut terminal, &state).await?;
            disable_raw_mode()?;
            execute!(terminal.backend_mut(), LeaveAlternateScreen)?;
            return Err(e);
        }
    };

    ws.register(&worker_id, &config.agent_kinds, &config.capabilities, config.max_concurrency).await?;
    state.logs.push(format!("Registered as worker {}", worker_id));

    ws.pull_task(&worker_id, 1).await?;
    state.logs.push("Waiting for task assignment...".to_string());

    let mut heartbeat_interval = interval(Duration::from_secs(30));
    let mut pull_interval = interval(Duration::from_secs(3));

    loop {
        terminal.draw(|f| ui::render(f, &state))?;

        // Handle keyboard events (non-blocking)
        if event::poll(Duration::from_millis(50))? {
            if let Event::Key(key) = event::read()? {
                if key.kind == KeyEventKind::Press {
                    match key.code {
                        KeyCode::Char('q') => { state.should_quit = true; break; }
                        KeyCode::Char('c') if key.modifiers.contains(crossterm::event::KeyModifiers::CONTROL) => {
                            state.should_quit = true; break;
                        }
                        _ => {}
                    }
                }
            }
        }

        // Check for incoming WS messages
        match ws.incoming.try_recv() {
            Ok(msg) => {
                match msg.msg_type.as_str() {
                    "task.assign" => {
                        if let Some(assignment) = TaskAssignment::from_ws_payload(&msg.payload) {
                            state.logs.push(format!(
                                "Task assigned: {} (agent: {})",
                                assignment.task_id, assignment.agent_kind
                            ));
                            state.status_message = format!("Executing: {}", assignment.task_id);
                            state.current_task = Some(assignment);

                            // Execute the task
                            let task = state.current_task.as_ref().unwrap();
                            state.logs.push(format!("Starting {} execution...", task.agent_kind));

                            match TaskExecutor::execute(task, &ws).await {
                                Ok(()) => {
                                    state.tasks_completed += 1;
                                    state.logs.push(format!("Task {} completed", task.task_id));
                                }
                                Err(e) => {
                                    state.tasks_failed += 1;
                                    state.logs.push(format!("Task {} failed: {}", task.task_id, e));
                                }
                            }

                            state.current_task = None;
                            state.status_message = "Idle — waiting for task".to_string();

                            // Pull next task
                            let _ = ws.pull_task(&worker_id, 1).await;
                        }
                    }
                    "task.cancel" => {
                        state.logs.push("Task canceled by server".to_string());
                        state.current_task = None;
                        state.status_message = "Idle — task was canceled".to_string();
                    }
                    "worker.registered" => {
                        state.logs.push("Registration confirmed by server".to_string());
                    }
                    "error" => {
                        let err_msg = msg.payload.get("message")
                            .and_then(|v| v.as_str())
                            .unwrap_or("Unknown error");
                        state.logs.push(format!("Server error: {}", err_msg));
                    }
                    other => {
                        state.logs.push(format!("Received: {}", other));
                    }
                }
            }
            Err(tokio::sync::mpsc::error::TryRecvError::Empty) => {}
            Err(tokio::sync::mpsc::error::TryRecvError::Disconnected) => {
                state.connected = false;
                state.status_message = "Disconnected from server".to_string();
                state.logs.push("WebSocket connection lost".to_string());
                break;
            }
        }

        // Periodic tasks
        tokio::select! {
            biased;
            _ = heartbeat_interval.tick() => {
                if state.connected {
                    let _ = ws.heartbeat(&worker_id).await;
                }
            }
            _ = pull_interval.tick() => {
                if state.connected && state.current_task.is_none() {
                    let _ = ws.pull_task(&worker_id, 1).await;
                }
            }
        }

        if state.should_quit { break; }
    }

    disable_raw_mode()?;
    execute!(terminal.backend_mut(), LeaveAlternateScreen)?;
    Ok(())
}

async fn show_error_tui(terminal: &mut Terminal<CrosstermBackend<io::Stdout>>, state: &AppState) -> Result<()> {
    loop {
        terminal.draw(|f| ui::render(f, state))?;
        if event::poll(Duration::from_millis(100))? {
            if let Event::Key(key) = event::read()? {
                if key.kind == KeyEventKind::Press && key.code == KeyCode::Char('q') {
                    break;
                }
            }
        }
    }
    Ok(())
}
