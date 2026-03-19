mod auth;
mod ws;
mod pty;
mod agent;
mod tui;
mod config;

use clap::{Parser, Subcommand};
use anyhow::Result;

#[derive(Parser)]
#[command(name = "hive", version, about = "Pajama Hive - Agent Orchestration CLI")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Authenticate with Pajama Hive
    Login,

    /// Connect to the Hive server and start accepting tasks
    Connect {
        /// Server URL (default: wss://hive-api.pajamadot.com)
        #[arg(short, long, default_value = "wss://hive-api.pajamadot.com")]
        url: String,

        /// Agent kinds to advertise (cc, cx, generic)
        #[arg(short, long, default_values_t = vec!["cc".to_string(), "cx".to_string(), "generic".to_string()])]
        agents: Vec<String>,

        /// Capabilities to advertise
        #[arg(short, long)]
        capabilities: Vec<String>,

        /// Maximum concurrent tasks
        #[arg(long, default_value = "1")]
        max_concurrency: u32,
    },

    /// Show current status and configuration
    Status,

    /// Log out and clear credentials
    Logout,
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "hive_cli=info".into()),
        )
        .init();

    let cli = Cli::parse();

    match cli.command {
        Commands::Login => {
            auth::login().await?;
        }
        Commands::Connect {
            url,
            agents,
            capabilities,
            max_concurrency,
        } => {
            let cfg = config::load_config()?;
            let token = cfg.token.ok_or_else(|| anyhow::anyhow!("Not logged in. Run `hive login` first."))?;

            tui::run_tui(tui::TuiConfig {
                server_url: url,
                token,
                agent_kinds: agents,
                capabilities,
                max_concurrency,
            })
            .await?;
        }
        Commands::Status => {
            let cfg = config::load_config()?;
            if cfg.token.is_some() {
                println!("Logged in");
                println!("Server: {}", cfg.server_url.unwrap_or_default());
            } else {
                println!("Not logged in. Run `hive login`.");
            }
        }
        Commands::Logout => {
            config::clear_credentials()?;
            println!("Logged out.");
        }
    }

    Ok(())
}
