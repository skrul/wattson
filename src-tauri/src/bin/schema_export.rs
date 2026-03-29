use rusqlite::Connection;
use std::collections::BTreeMap;
use wattson_lib::migrations::migrations;
use wattson_lib::schema_docs::descriptions;

struct Column {
    name: String,
    col_type: String,
    is_pk: bool,
    is_fk: bool,
    nullable: bool,
}

struct ForeignKey {
    from_table: String,
    from_col: String,
    to_table: String,
}

fn main() {
    let conn = Connection::open_in_memory().expect("Failed to open in-memory SQLite DB");

    // Apply migrations in version order
    let mut migs = migrations();
    migs.sort_by_key(|m| m.version);
    for m in &migs {
        conn.execute_batch(m.sql)
            .unwrap_or_else(|e| panic!("Migration v{} failed: {}", m.version, e));
    }

    // Get all user tables
    let mut stmt = conn
        .prepare(
            "SELECT name, sql FROM sqlite_master \
             WHERE type = 'table' \
             AND name NOT LIKE 'sqlite_%' \
             AND name != '_sqlx_migrations' \
             ORDER BY name",
        )
        .unwrap();

    let tables: Vec<(String, String)> = stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
        .unwrap()
        .filter_map(|r| r.ok())
        .collect();

    let mut all_columns: BTreeMap<String, Vec<Column>> = BTreeMap::new();
    let mut all_fks: Vec<ForeignKey> = Vec::new();

    for (table_name, create_sql) in &tables {
        let columns = parse_columns(&conn, table_name, create_sql);
        let fks = parse_foreign_keys(&conn, table_name);

        // Mark FK columns
        let fk_cols: Vec<String> = fks.iter().map(|fk| fk.from_col.clone()).collect();
        let columns: Vec<Column> = columns
            .into_iter()
            .map(|mut c| {
                if fk_cols.contains(&c.name) {
                    c.is_fk = true;
                }
                c
            })
            .collect();

        all_fks.extend(fks);
        all_columns.insert(table_name.clone(), columns);
    }

    let docs = descriptions();

    // Output Mermaid ERD
    println!("erDiagram");

    for (table_name, columns) in &all_columns {
        if let Some(table_desc) = docs.get(table_name.as_str()) {
            println!("    %% {}: {}", table_name, table_desc);
        }
        println!("    {} {{", table_name);
        for col in columns {
            let mermaid_type = sql_type_to_mermaid(&col.col_type);
            let mut markers = Vec::new();
            if col.is_pk {
                markers.push("PK");
            }
            if col.is_fk {
                markers.push("FK");
            }

            let doc_key = format!("{}.{}", table_name, col.name);
            let desc = docs.get(doc_key.as_str()).copied();

            let comment = match (markers.is_empty(), col.nullable, desc) {
                // Has markers and description
                (false, _, Some(d)) => format!(" \"{} - {}\"", markers.join(","), d),
                // Has markers, no description
                (false, _, None) => format!(" \"{}\"", markers.join(",")),
                // No markers, nullable with description
                (true, true, Some(d)) => format!(" \"nullable - {}\"", d),
                // No markers, nullable without description
                (true, true, None) => String::from(" \"nullable\""),
                // No markers, not nullable, has description
                (true, false, Some(d)) => format!(" \"{}\"", d),
                // No markers, not nullable, no description
                (true, false, None) => String::new(),
            };
            println!("        {} {}{}", mermaid_type, col.name, comment);
        }
        println!("    }}");
    }

    // Output relationships
    for fk in &all_fks {
        println!(
            "    {} }}o--|| {} : \"{}\"",
            fk.from_table, fk.to_table, fk.from_col
        );
    }
}

fn parse_columns(conn: &Connection, table_name: &str, _create_sql: &str) -> Vec<Column> {
    let mut stmt = conn
        .prepare(&format!("PRAGMA table_info('{}')", table_name))
        .unwrap();

    stmt.query_map([], |row| {
        let name: String = row.get(1)?;
        let col_type: String = row.get(2)?;
        let notnull: bool = row.get::<_, i32>(3)? != 0;
        let pk: bool = row.get::<_, i32>(5)? != 0;
        Ok(Column {
            name,
            col_type,
            is_pk: pk,
            is_fk: false,
            nullable: !notnull && !pk,
        })
    })
    .unwrap()
    .filter_map(|r| r.ok())
    .collect()
}

fn parse_foreign_keys(conn: &Connection, table_name: &str) -> Vec<ForeignKey> {
    let mut stmt = conn
        .prepare(&format!("PRAGMA foreign_key_list('{}')", table_name))
        .unwrap();

    stmt.query_map([], |row| {
        let to_table: String = row.get(2)?;
        let from_col: String = row.get(3)?;
        Ok(ForeignKey {
            from_table: table_name.to_string(),
            from_col,
            to_table,
        })
    })
    .unwrap()
    .filter_map(|r| r.ok())
    .collect()
}

fn sql_type_to_mermaid(sql_type: &str) -> &str {
    match sql_type.to_uppercase().as_str() {
        "TEXT" => "string",
        "INTEGER" | "INT" => "int",
        "REAL" | "FLOAT" | "DOUBLE" => "float",
        "BLOB" => "blob",
        "" => "any",
        _ => "string",
    }
}
