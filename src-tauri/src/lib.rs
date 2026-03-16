use tauri_plugin_sql::{Builder as SqlBuilder, Migration, MigrationKind};

#[tauri::command]
fn save_credentials(user_id: String, access_token: String, email: String, password: String) -> Result<(), String> {
    let entry = keyring::Entry::new("com.wattson.app", "peloton").map_err(|e| e.to_string())?;
    let json =
        serde_json::json!({ "user_id": user_id, "access_token": access_token, "email": email, "password": password }).to_string();
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
        Migration {
            version: 3,
            description: "add_raw_json_column",
            sql: "ALTER TABLE workouts ADD COLUMN raw_json TEXT;",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "create_user_profile_table",
            sql: "CREATE TABLE user_profile (
                id TEXT PRIMARY KEY,
                first_name TEXT,
                total_workouts INTEGER,
                raw_json TEXT
            );",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "rename_total_output_to_total_work",
            sql: "ALTER TABLE workouts RENAME COLUMN total_output TO total_work;",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "rename_output_watts_to_avg_output",
            sql: "ALTER TABLE workouts RENAME COLUMN output_watts TO avg_output;",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 7,
            description: "add_raw_detail_and_performance_json",
            sql: "ALTER TABLE workouts ADD COLUMN raw_detail_json TEXT;
            ALTER TABLE workouts ADD COLUMN raw_performance_graph_json TEXT;",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 8,
            description: "create_chart_definitions_table",
            sql: "CREATE TABLE chart_definitions (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                mark_type TEXT NOT NULL DEFAULT 'line',
                y_fields_json TEXT NOT NULL,
                group_by TEXT,
                filters_json TEXT NOT NULL DEFAULT '[]',
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 9,
            description: "add_raw_ride_details_json",
            sql: "ALTER TABLE workouts ADD COLUMN raw_ride_details_json TEXT;",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 10,
            description: "add_class_type_columns",
            sql: "ALTER TABLE workouts ADD COLUMN class_type TEXT;
            ALTER TABLE workouts ADD COLUMN class_type_version INTEGER;",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 11,
            description: "add_class_subtype_column",
            sql: "ALTER TABLE workouts ADD COLUMN class_subtype TEXT;",
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

    builder
        .invoke_handler(tauri::generate_handler![
            save_credentials,
            load_credentials,
            delete_credentials
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
