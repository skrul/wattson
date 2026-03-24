use std::sync::Mutex;
use tauri_plugin_sql::{Builder as SqlBuilder, Migration, MigrationKind};

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
    let migrations = vec![
        Migration {
            version: 1,
            description: "create_schema",
            sql: "CREATE TABLE workouts (
                id TEXT PRIMARY KEY,
                peloton_id TEXT,
                date INTEGER,
                duration_seconds INTEGER,
                discipline TEXT,
                title TEXT,
                instructor TEXT,
                avg_output REAL,
                calories REAL,
                distance REAL,
                avg_heart_rate REAL,
                avg_cadence REAL,
                avg_resistance REAL,
                avg_speed REAL,
                strive_score REAL,
                source TEXT,
                is_live INTEGER,
                workout_type TEXT,
                total_work REAL,
                avg_incline REAL,
                avg_pace REAL,
                raw_json TEXT,
                raw_detail_json TEXT,
                raw_performance_graph_json TEXT,
                raw_ride_details_json TEXT,
                class_type TEXT,
                class_type_version INTEGER,
                class_subtype TEXT,
                ride_id TEXT,
                max_heart_rate REAL,
                hr_zone1_pct REAL,
                hr_zone2_pct REAL,
                hr_zone3_pct REAL,
                hr_zone4_pct REAL,
                hr_zone5_pct REAL,
                detail_fetched_at INTEGER,
                perf_graph_fetched_at INTEGER,
                ride_details_fetched_at INTEGER
            );

            CREATE TABLE user_profile (
                id TEXT PRIMARY KEY,
                first_name TEXT,
                total_workouts INTEGER,
                raw_json TEXT
            );

            CREATE TABLE chart_definitions (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                mark_type TEXT NOT NULL DEFAULT 'line',
                y_fields_json TEXT NOT NULL,
                group_by TEXT,
                filters_json TEXT NOT NULL DEFAULT '[]',
                x_axis_mode TEXT NOT NULL DEFAULT 'date',
                x_axis_field TEXT,
                x_axis_sequential INTEGER NOT NULL DEFAULT 0,
                agg_function TEXT,
                transposed INTEGER NOT NULL DEFAULT 0,
                stacked INTEGER NOT NULL DEFAULT 0,
                min_value REAL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );

            CREATE TABLE settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            CREATE TABLE dashboards (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL DEFAULT 'My Dashboard',
                default_key TEXT,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );

            CREATE TABLE dashboard_widgets (
                id TEXT PRIMARY KEY,
                dashboard_id TEXT NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
                widget_type TEXT NOT NULL,
                config_json TEXT NOT NULL DEFAULT '{}',
                layout_json TEXT NOT NULL DEFAULT '{}',
                sort_order INTEGER NOT NULL DEFAULT 0
            );

            CREATE INDEX idx_workouts_date ON workouts(date);
            CREATE INDEX idx_workouts_duration ON workouts(duration_seconds);
            CREATE INDEX idx_workouts_ride_id ON workouts(ride_id);",
            kind: MigrationKind::Up,
        },
    ];

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
