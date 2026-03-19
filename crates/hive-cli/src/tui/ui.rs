use ratatui::{
    prelude::*,
    widgets::{Block, Borders, List, ListItem, Paragraph, Wrap},
};

use super::app::AppState;

pub fn render(f: &mut Frame, state: &AppState) {
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(3),  // Status bar
            Constraint::Min(10),   // Log area
            Constraint::Length(6), // Task info
        ])
        .split(f.area());

    // Status bar
    let connection_status = if state.connected { "CONNECTED" } else { "DISCONNECTED" };
    let status_color = if state.connected { Color::Green } else { Color::Red };

    let status = Paragraph::new(Line::from(vec![
        Span::styled(" HIVE ", Style::default().fg(Color::Black).bg(Color::Magenta).bold()),
        Span::raw("  "),
        Span::styled(connection_status, Style::default().fg(status_color).bold()),
        Span::raw("  "),
        Span::styled(&state.worker_id, Style::default().fg(Color::DarkGray)),
        Span::raw("  "),
        Span::styled(&state.status_message, Style::default().fg(Color::Yellow)),
        Span::raw("  "),
        Span::styled(
            format!("done:{} fail:{}", state.tasks_completed, state.tasks_failed),
            Style::default().fg(Color::Cyan),
        ),
    ]))
    .block(Block::default().borders(Borders::ALL).title(" Pajama Hive Agent [q=quit] "));

    f.render_widget(status, chunks[0]);

    // Log area
    let max_logs = (chunks[1].height as usize).saturating_sub(2);
    let log_items: Vec<ListItem> = state
        .logs
        .iter()
        .rev()
        .take(max_logs)
        .rev()
        .map(|log| {
            let style = if log.contains("error") || log.contains("failed") || log.contains("Error") {
                Style::default().fg(Color::Red)
            } else if log.contains("completed") || log.contains("confirmed") {
                Style::default().fg(Color::Green)
            } else if log.contains("assigned") || log.contains("Starting") {
                Style::default().fg(Color::Yellow)
            } else {
                Style::default().fg(Color::Gray)
            };
            ListItem::new(Line::from(Span::styled(log.as_str(), style)))
        })
        .collect();

    let log_list = List::new(log_items)
        .block(Block::default().borders(Borders::ALL).title(" Logs "));

    f.render_widget(log_list, chunks[1]);

    // Task info
    let task_info = if let Some(task) = &state.current_task {
        Paragraph::new(vec![
            Line::from(vec![
                Span::styled("Task: ", Style::default().fg(Color::Cyan).bold()),
                Span::raw(&task.task_id),
            ]),
            Line::from(vec![
                Span::styled("Agent: ", Style::default().fg(Color::Cyan).bold()),
                Span::raw(&task.agent_kind),
                Span::raw("  "),
                Span::styled("Lease: ", Style::default().fg(Color::Cyan).bold()),
                Span::raw(&task.lease_id),
            ]),
            Line::from(vec![
                Span::styled("Input: ", Style::default().fg(Color::Cyan).bold()),
                Span::styled(
                    if task.input.len() > 80 { format!("{}...", &task.input[..80]) } else { task.input.clone() },
                    Style::default().fg(Color::DarkGray),
                ),
            ]),
        ])
    } else {
        Paragraph::new(vec![
            Line::from(Span::styled(
                "No active task — waiting for assignment...",
                Style::default().fg(Color::DarkGray),
            )),
            Line::from(Span::styled(
                "Create a graph and start a run in the dashboard to dispatch tasks.",
                Style::default().fg(Color::DarkGray).italic(),
            )),
        ])
    };

    let task_block = task_info
        .block(Block::default().borders(Borders::ALL).title(" Current Task "))
        .wrap(Wrap { trim: true });

    f.render_widget(task_block, chunks[2]);
}
