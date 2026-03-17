# Wattson

A free, open-source desktop app for analyzing your Peloton workout data. Sync your rides, filter and sort them, build custom charts, and compare repeated rides — all locally on your machine with no server or cloud account required.

## Features

- **Sync workouts** from your Peloton account
- **Filter and sort** by date, duration, output, instructor, class type, and more
- **Custom charts** — build time-series and grouped charts with the built-in chart builder
- **Compare rides** — overlay multiple attempts of the same class to see progress
- **Per-ride detail** — view output, cadence, resistance, and heart rate curves for any ride
- **Insights** — activity heatmap, cumulative totals, personal records, favorite instructors, and most repeated classes
- **Export** charts as PNG or SVG
- **Auto-update** — the app checks for new versions on launch

All data stays on your machine in a local SQLite database. Credentials are stored in your system keychain (macOS Keychain, Windows Credential Manager).

## Screenshots

![Workout list with filters and ride detail](screenshots/filter.png)

![Chart builder](screenshots/charts.png)

![Compare repeated rides](screenshots/compare.png)

![Insights tab](screenshots/insights.png)

## Install

Download the latest release for your platform from the [Releases](https://github.com/skrul/wattson/releases) page.

- **macOS**: `.dmg` (signed and notarized)
- **Windows**: `.msi` installer
- **Linux**: `.AppImage` or `.deb`

## Development

This is a [Tauri 2](https://v2.tauri.app/) app. See the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for platform-specific setup.

```bash
git clone https://github.com/skrul/wattson.git
cd wattson
pnpm install
pnpm tauri dev
```

## License

[MIT](LICENSE)
