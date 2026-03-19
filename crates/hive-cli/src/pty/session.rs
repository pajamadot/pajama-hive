use anyhow::Result;
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use std::io::{BufRead, BufReader, Write};
use std::sync::{Arc, Mutex};
use tokio::sync::mpsc;

pub struct PtySession {
    writer: Box<dyn Write + Send>,
    output_rx: mpsc::Receiver<String>,
    _child: Box<dyn portable_pty::Child + Send + Sync>,
}

impl PtySession {
    /// Spawn a new PTY session with the given shell (e.g., "powershell.exe" or "bash")
    pub fn spawn(shell: &str, args: &[&str], cwd: Option<&str>) -> Result<Self> {
        let pty_system = native_pty_system();

        let pair = pty_system.openpty(PtySize {
            rows: 40,
            cols: 120,
            pixel_width: 0,
            pixel_height: 0,
        })?;

        let mut cmd = CommandBuilder::new(shell);
        for arg in args {
            cmd.arg(arg);
        }
        if let Some(dir) = cwd {
            cmd.cwd(dir);
        }

        let child = pair.slave.spawn_command(cmd)?;
        let writer = pair.master.take_writer()?;
        let reader = pair.master.try_clone_reader()?;

        // Spawn reader thread that forwards output
        let (output_tx, output_rx) = mpsc::channel::<String>(256);

        std::thread::spawn(move || {
            let buf_reader = BufReader::new(reader);
            for line in buf_reader.lines() {
                match line {
                    Ok(text) => {
                        if output_tx.blocking_send(text).is_err() {
                            break;
                        }
                    }
                    Err(_) => break,
                }
            }
        });

        Ok(Self {
            writer,
            output_rx,
            _child: child,
        })
    }

    /// Write input to the PTY
    pub fn write(&mut self, input: &str) -> Result<()> {
        self.writer.write_all(input.as_bytes())?;
        self.writer.flush()?;
        Ok(())
    }

    /// Read the next output line (non-blocking via channel)
    pub async fn read_line(&mut self) -> Option<String> {
        self.output_rx.recv().await
    }

    /// Write a command followed by Enter
    pub fn send_command(&mut self, cmd: &str) -> Result<()> {
        self.write(&format!("{}\r\n", cmd))
    }
}
