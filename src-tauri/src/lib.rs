use tauri_plugin_sql::{Builder as SqlBuilder, Migration, MigrationKind};

#[tauri::command]
fn save_credentials(user_id: String, access_token: String) -> Result<(), String> {
    let entry = keyring::Entry::new("com.wattson.app", "peloton").map_err(|e| e.to_string())?;
    let json =
        serde_json::json!({ "user_id": user_id, "access_token": access_token }).to_string();
    entry.set_password(&json).map_err(|e| e.to_string())
}

#[tauri::command]
fn load_credentials() -> Result<Option<serde_json::Value>, String> {
    let entry = keyring::Entry::new("com.wattson.app", "peloton").map_err(|e| e.to_string())?;
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
    let entry = keyring::Entry::new("com.wattson.app", "peloton").map_err(|e| e.to_string())?;
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
            description: "create_initial_tables",
            sql: "CREATE TABLE workouts (
                id TEXT PRIMARY KEY,
                peloton_id TEXT,
                date INTEGER,
                duration_seconds INTEGER,
                discipline TEXT,
                title TEXT,
                instructor TEXT,
                output_watts REAL,
                calories REAL,
                distance REAL,
                avg_heart_rate REAL,
                avg_cadence REAL,
                avg_resistance REAL,
                avg_speed REAL,
                strive_score REAL,
                source TEXT
            );

            CREATE TABLE metrics (
                workout_id TEXT REFERENCES workouts(id),
                second INTEGER,
                output REAL,
                cadence REAL,
                resistance REAL,
                heart_rate REAL,
                speed REAL,
                PRIMARY KEY (workout_id, second)
            );

            CREATE INDEX idx_workouts_date ON workouts(date);
            CREATE INDEX idx_workouts_duration ON workouts(duration_seconds);
            CREATE INDEX idx_metrics_workout ON metrics(workout_id);",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "add_workout_columns",
            sql: "ALTER TABLE workouts ADD COLUMN is_live INTEGER;
            ALTER TABLE workouts ADD COLUMN workout_type TEXT;
            ALTER TABLE workouts ADD COLUMN total_output REAL;
            ALTER TABLE workouts ADD COLUMN avg_incline REAL;
            ALTER TABLE workouts ADD COLUMN avg_pace REAL;",
            kind: MigrationKind::Up,
        },
    ];

    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(
            SqlBuilder::default()
                .add_migrations("sqlite:wattson.db", migrations)
                .build(),
        );

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
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
