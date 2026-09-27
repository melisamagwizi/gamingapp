# Toxic Gaming — Shop Manager

Gaming-lounge management app for **Toxic Gaming**, Luxor House, Shop 13A, Bulawayo.

| Path | What it is |
|---|---|
| `app/` | Android app (v2.1): WebView wrapper + bundled UI with Firebase cloud sync and staff/master roles |
| `firestore.rules` | Firestore security rules (billing protection, roles) |
| `web/toxic_gaming_v1_offline.html` | Original v1: single-file, offline, single-device (browser storage only) |
| `tests/` | Security-rules and UI test suites |
| `demo/` | Builds a one-page browser test version (demo database, role switcher, shop clock): `node demo/build-demo.mjs` |

See **[SETUP.md](SETUP.md)** for Firebase setup, how to get the APK, and limitations.
