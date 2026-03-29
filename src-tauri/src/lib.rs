use std::sync::Mutex;
use tauri_plugin_sql::{Builder as SqlBuilder, Migration, MigrationKind};

pub mod migrations;
pub mod schema_docs;

/// In-memory credential store used when WATTSON_NO_KEYCHAIN is set (e.g. E2E tests).
static IN_MEMORY_CREDENTIALS: Mutex<Option<String>> = Mutex::new(None);

fn no_keychain() -> bool {
    std::env::var("WATTSON_NO_KEYCHAIN").is_ok()
}

#[tauri::command]
fn save_credentials(user_id: String, access_token: String, email: String, password: String) -> Result<(), String> {
    let json =
        serde_json::json!({ "user_id": user_id, "access_token": access_token, "email": email, "password": password }).to_string();
    if no_keychain() {
        *IN_MEMORY_CREDENTIALS.lock().map_err(|e| e.to_string())? = Some(json);
        return Ok(());
    }
    let entry = keyring::Entry::new("com.skrul.wattson", "peloton").map_err(|e| e.to_string())?;
    entry.set_password(&json).map_err(|e| e.to_string())
}

#[tauri::command]
fn load_credentials() -> Result<Option<serde_json::Value>, String> {
    if no_keychain() {
        let guard = IN_MEMORY_CREDENTIALS.lock().map_err(|e| e.to_string())?;
        return match guard.as_deref() {
            Some(json) => serde_json::from_str(json).map(Some).map_err(|e| e.to_string()),
            None => Ok(None),
        };
    }
    let entry = keyring::Entry::new("com.skrul.wattson", "peloton").map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(json) => serde_json::from_str(&json)
            .map(Some)
            .map_err(|e| e.to_string()),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn delete_credentials() -> Result<(), String> {
    if no_keychain() {
        *IN_MEMORY_CREDENTIALS.lock().map_err(|e| e.to_string())? = None;
        return Ok(());
    }
    let entry = keyring::Entry::new("com.skrul.wattson", "peloton").map_err(|e| e.to_string())?;
    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations: Vec<Migration> = migrations::migrations()
        .into_iter()
        .map(|m| Migration {
            version: m.version,
            description: m.description,
            sql: m.sql,
            kind: MigrationKind::Up,
        })
        .collect();

    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(
            SqlBuilder::default()
                .add_migrations("sqlite:wattson.db", migrations)
                .build(),
        );

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
    }

    #[cfg(debug_assertions)]
    {
        builder = builder.plugin(tauri_plugin_webdriver_automation::init());
    }

    builder
        .invoke_handler(tauri::generate_handler![
            save_credentials,
            load_credentials,
            delete_credentials
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
