use std::collections::HashMap;

/// Returns human-readable descriptions for tables and columns.
/// Keys are `"table"` for table descriptions, `"table.column"` for column descriptions.
pub fn descriptions() -> HashMap<&'static str, &'static str> {
    let mut m = HashMap::new();

    // -- workouts --
    m.insert("workouts", "Peloton workout sessions and computed metrics");
    m.insert("workouts.id", "Unique workout identifier");
    m.insert("workouts.peloton_id", "Peloton API workout ID");
    m.insert("workouts.date", "Workout start time (Unix epoch seconds)");
    m.insert("workouts.duration_seconds", "Total workout duration");
    m.insert("workouts.discipline", "e.g. cycling, running, strength");
    m.insert("workouts.title", "Class title from Peloton");
    m.insert("workouts.instructor", "Instructor name");
    m.insert("workouts.avg_output", "Average output in watts");
    m.insert("workouts.calories", "Calories burned");
    m.insert("workouts.distance", "Distance covered (miles)");
    m.insert("workouts.avg_heart_rate", "Average heart rate (bpm)");
    m.insert("workouts.avg_cadence", "Average cadence (rpm)");
    m.insert("workouts.avg_resistance", "Average resistance (%)");
    m.insert("workouts.avg_speed", "Average speed (mph)");
    m.insert("workouts.strive_score", "Peloton Strive Score");
    m.insert("workouts.source", "Data source identifier");
    m.insert("workouts.is_live", "1 if live class, 0 if on-demand");
    m.insert("workouts.workout_type", "Workout category");
    m.insert("workouts.total_work", "Total work in kilojoules");
    m.insert("workouts.avg_incline", "Average incline (%)");
    m.insert("workouts.avg_pace", "Average pace (min/mile)");
    m.insert("workouts.raw_json", "Raw workout list API response");
    m.insert("workouts.raw_detail_json", "Raw workout detail API response");
    m.insert(
        "workouts.raw_performance_graph_json",
        "Raw performance graph API response",
    );
    m.insert(
        "workouts.raw_ride_details_json",
        "Raw ride details API response",
    );
    m.insert("workouts.class_type", "Enriched class type");
    m.insert(
        "workouts.class_type_version",
        "Schema version of class_type enrichment",
    );
    m.insert("workouts.class_subtype", "Enriched class subtype");
    m.insert("workouts.ride_id", "Peloton ride/class ID");
    m.insert("workouts.max_heart_rate", "Maximum heart rate (bpm)");
    m.insert("workouts.hr_zone1_pct", "% time in HR zone 1");
    m.insert("workouts.hr_zone2_pct", "% time in HR zone 2");
    m.insert("workouts.hr_zone3_pct", "% time in HR zone 3");
    m.insert("workouts.hr_zone4_pct", "% time in HR zone 4");
    m.insert("workouts.hr_zone5_pct", "% time in HR zone 5");
    m.insert(
        "workouts.detail_fetched_at",
        "When detail was last fetched (epoch)",
    );
    m.insert(
        "workouts.perf_graph_fetched_at",
        "When perf graph was last fetched (epoch)",
    );
    m.insert(
        "workouts.ride_details_fetched_at",
        "When ride details were last fetched (epoch)",
    );

    // -- user_profile --
    m.insert("user_profile", "Cached Peloton user profile");
    m.insert("user_profile.id", "Peloton user ID");
    m.insert("user_profile.first_name", "User first name");
    m.insert("user_profile.total_workouts", "Total workouts from Peloton");
    m.insert("user_profile.raw_json", "Raw profile API response");

    // -- chart_definitions --
    m.insert("chart_definitions", "User-created chart configurations");
    m.insert("chart_definitions.id", "Unique chart ID");
    m.insert("chart_definitions.name", "User-facing chart name");
    m.insert("chart_definitions.mark_type", "Vega-Lite mark type (line, bar, etc.)");
    m.insert("chart_definitions.y_fields_json", "JSON array of Y-axis field configs");
    m.insert("chart_definitions.group_by", "Column to group/color by");
    m.insert("chart_definitions.filters_json", "JSON array of filter rules");
    m.insert("chart_definitions.x_axis_mode", "date or field");
    m.insert("chart_definitions.x_axis_field", "Column for X-axis when mode=field");
    m.insert("chart_definitions.x_axis_sequential", "1 if sequential X ordering");
    m.insert("chart_definitions.agg_function", "Aggregation function (sum, mean, etc.)");
    m.insert("chart_definitions.transposed", "1 if axes are swapped");
    m.insert("chart_definitions.stacked", "1 if series are stacked");
    m.insert("chart_definitions.min_value", "Custom Y-axis minimum");
    m.insert("chart_definitions.created_at", "Creation timestamp (epoch)");
    m.insert("chart_definitions.updated_at", "Last modified timestamp (epoch)");

    // -- settings --
    m.insert("settings", "App key-value settings");
    m.insert("settings.key", "Setting name");
    m.insert("settings.value", "Setting value (JSON string)");

    // -- dashboards --
    m.insert("dashboards", "User-created dashboards");
    m.insert("dashboards.id", "Unique dashboard ID");
    m.insert("dashboards.name", "Dashboard display name");
    m.insert("dashboards.default_key", "Default filter key");
    m.insert("dashboards.created_at", "Creation timestamp (epoch)");
    m.insert("dashboards.updated_at", "Last modified timestamp (epoch)");

    // -- dashboard_widgets --
    m.insert("dashboard_widgets", "Widgets placed on a dashboard");
    m.insert("dashboard_widgets.id", "Unique widget ID");
    m.insert("dashboard_widgets.dashboard_id", "Parent dashboard");
    m.insert("dashboard_widgets.widget_type", "Widget kind (chart, stat, etc.)");
    m.insert("dashboard_widgets.config_json", "Widget configuration JSON");
    m.insert("dashboard_widgets.layout_json", "Grid position and size JSON");
    m.insert("dashboard_widgets.sort_order", "Display order within dashboard");

    m
}
