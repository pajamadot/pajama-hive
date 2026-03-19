use anyhow::Result;
use std::sync::mpsc;
use tiny_http::{Response, Server};

use crate::config;

/// Browser-based OAuth login flow:
/// 1. Start local HTTP server on random port
/// 2. Open browser to Clerk sign-in with redirect to localhost
/// 3. Capture the token from the callback
/// 4. Store token in ~/.hive/credentials.json
pub async fn login() -> Result<()> {
    // Start local server on a random available port
    let server = Server::http("127.0.0.1:0").map_err(|e| anyhow::anyhow!("{}", e))?;
    let port = server.server_addr().to_ip().unwrap().port();
    let callback_url = format!("http://127.0.0.1:{}/callback", port);

    println!("Starting auth server on {}", callback_url);

    // Open browser to Clerk sign-in
    // The frontend at hive.pajamadot.com/cli-auth will handle the Clerk flow
    // and redirect back to our local server with the token
    let auth_url = format!(
        "https://hive.pajamadot.com/cli-auth?redirect_uri={}",
        urlencoding::encode(&callback_url)
    );

    println!("Opening browser for authentication...");
    if let Err(e) = open::that(&auth_url) {
        println!("Could not open browser automatically: {}", e);
        println!("Please open this URL manually:\n{}", auth_url);
    }

    // Wait for callback
    let (tx, rx) = mpsc::channel::<String>();

    println!("Waiting for authentication...");

    // Handle the callback in a blocking manner
    tokio::task::spawn_blocking(move || {
        for request in server.incoming_requests() {
            let url = request.url().to_string();

            if url.starts_with("/callback") {
                // Parse token from query params
                if let Some(query) = url.split('?').nth(1) {
                    for param in query.split('&') {
                        let mut parts = param.splitn(2, '=');
                        if parts.next() == Some("token") {
                            if let Some(token) = parts.next() {
                                let _ = tx.send(token.to_string());
                            }
                        }
                    }
                }

                let html = r#"
                    <!DOCTYPE html>
                    <html>
                    <body style="background:#0a0a0f;color:#e4e4e7;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
                        <div style="text-align:center">
                            <h1>Authenticated!</h1>
                            <p>You can close this window and return to the terminal.</p>
                        </div>
                    </body>
                    </html>
                "#;
                let response = Response::from_string(html)
                    .with_header(tiny_http::Header::from_bytes("Content-Type", "text/html").unwrap());
                let _ = request.respond(response);
                break;
            } else {
                let _ = request.respond(Response::from_string("Not found").with_status_code(404));
            }
        }
    });

    let token = rx.recv().map_err(|_| anyhow::anyhow!("Authentication failed: no token received"))?;

    // Store credentials
    config::save_credentials(&token, Some("wss://hive-api.pajamadot.com"))?;

    println!("Successfully authenticated! Token stored in ~/.hive/credentials.json");
    Ok(())
}

mod urlencoding {
    pub fn encode(s: &str) -> String {
        let mut result = String::new();
        for c in s.bytes() {
            match c {
                b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                    result.push(c as char);
                }
                _ => {
                    result.push_str(&format!("%{:02X}", c));
                }
            }
        }
        result
    }
}
