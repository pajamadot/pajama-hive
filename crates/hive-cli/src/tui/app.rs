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
}

pub async fn run_tui(config: TuiConfig) -> Result<()> {
    // Setup terminal
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
    };

    // Connect to server
    state.logs.push(format!("Connecting to {}...", config.server_url));
    let ws = match WsClient::connect(&config.server_url, &config.token).await {
        Ok(ws) => {
            state.connected = true;
            state.status_message = "Connected".to_string();
            state.logs.push("Connected to server".to_string());
            ws
        }
        Err(e) => {
            state.logs.push(format!("Connection failed: {}", e));
            state.status_message = format!("Error: {}", e);

            // Still show TUI with error
            loop {
                terminal.draw(|f| ui::render(f, &state))?;
                if event::poll(Duration::from_millis(100))? {
                    if let Event::Key(key) = event::read()? {
                        if key.kind == KeyEventKind::Press && key.code == KeyCode::Char('q') {
                            break;
                        }
                    }
                }
            }

            disable_raw_mode()?;
            execute!(terminal.backend_mut(), LeaveAlternateScreen)?;
            return Err(e);
        }
    };

    // Register worker
    ws.register(
        &worker_id,
        &config.agent_kinds,
        &config.capabilities,
        config.max_concurrency,
    )
    .await?;
    state.logs.push(format!("Registered as worker {}", worker_id));

    // Request initial task
    ws.pull_task(&worker_id, 1).await?;

    // Main loop
    let mut heartbeat_interval = interval(Duration::from_secs(30));
    let mut poll_interval = interval(Duration::from_secs(5));

    loop {
        // Render
        terminal.draw(|f| ui::render(f, &state))?;

        // Handle keyboard events
        if event::poll(Duration::from_millis(50))? {
            if let Event::Key(key) = event::read()? {
                if key.kind == KeyEventKind::Press {
                    match key.code {
                        KeyCode::Char('q') => {
                            state.should_quit = true;
                            break;
                        }
                        _ => {}
                    }
                }
            }
        }

        // Handle heartbeat
        tokio::select! {
            _ = heartbeat_interval.tick() => {
                let _ = ws.heartbeat(&worker_id).await;
            }
            _ = poll_interval.tick() => {
                if state.current_task.is_none() {
                    let _ = ws.pull_task(&worker_id, 1).await;
                }
            }
            else => {}
        }

        if state.should_quit {
            break;
        }
    }

    // Cleanup
    disable_raw_mode()?;
    execute!(terminal.backend_mut(), LeaveAlternateScreen)?;

    Ok(())
}
