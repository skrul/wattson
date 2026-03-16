# Privacy

Wattson is a fully local application. It has no server, no analytics, and no telemetry.

- **Workout data** is stored in a SQLite database on your machine.
- **Peloton credentials** are stored in your system keychain (macOS Keychain, Windows Credential Manager, or Linux Secret Service). They are never written to disk in plaintext.
- **Network requests** are made only to Peloton's API (`api.onepeloton.com`, `auth.onepeloton.com`) to sync your workouts, and to GitHub (`github.com`) to check for app updates.
- **No data is sent anywhere else.** There is no tracking, no crash reporting, and no usage analytics.
