// Event handling utilities for the TUI
// Currently keyboard events are handled inline in app.rs
// This module is reserved for more complex event routing as the TUI grows

use crossterm::event::{KeyCode, KeyEvent, KeyModifiers};

pub enum AppAction {
    Quit,
    ScrollUp,
    ScrollDown,
    SwitchPanel,
    Approve,
    None,
}

pub fn map_key_event(key: KeyEvent) -> AppAction {
    match key.code {
        KeyCode::Char('q') => AppAction::Quit,
        KeyCode::Char('c') if key.modifiers.contains(KeyModifiers::CONTROL) => AppAction::Quit,
        KeyCode::Up | KeyCode::Char('k') => AppAction::ScrollUp,
        KeyCode::Down | KeyCode::Char('j') => AppAction::ScrollDown,
        KeyCode::Tab => AppAction::SwitchPanel,
        KeyCode::Enter => AppAction::Approve,
        _ => AppAction::None,
    }
}
