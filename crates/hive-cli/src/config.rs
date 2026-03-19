use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct HiveConfig {
    pub token: Option<String>,
    pub server_url: Option<String>,
    pub worker_id: Option<String>,
}

fn config_dir() -> PathBuf {
    dirs::home_dir()
        .expect("Could not find home directory")
        .join(".hive")
}

fn config_path() -> PathBuf {
    config_dir().join("config.toml")
}

fn credentials_path() -> PathBuf {
    config_dir().join("credentials.json")
}

pub fn load_config() -> Result<HiveConfig> {
    let creds_path = credentials_path();
    if creds_path.exists() {
        let content = fs::read_to_string(&creds_path)?;
        let config: HiveConfig = serde_json::from_str(&content)?;
        Ok(config)
    } else {
        Ok(HiveConfig::default())
    }
}

pub fn save_credentials(token: &str, server_url: Option<&str>) -> Result<()> {
    let dir = config_dir();
    fs::create_dir_all(&dir)?;

    let config = HiveConfig {
        token: Some(token.to_string()),
        server_url: server_url.map(|s| s.to_string()),
        worker_id: Some(uuid::Uuid::new_v4().to_string()),
    };

    let content = serde_json::to_string_pretty(&config)?;
    fs::write(credentials_path(), content)?;
    Ok(())
}

pub fn clear_credentials() -> Result<()> {
    let path = credentials_path();
    if path.exists() {
        fs::remove_file(path)?;
    }
    Ok(())
}
