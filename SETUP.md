# Toxic Gaming 2.1 — Firebase + Android setup

## What this project provides
- Android app (WebView wrapper) with the shop manager UI bundled inside the APK.
- Firebase Authentication email/password sign-in.
- Firestore live sync for sessions, VIP bookings, events and an audit trail across all shop devices.
- Roles: one or more `master` accounts (owner/managers) and `staff` accounts.
- Shop rates: PS5 $2/hr, PS4 $1.50/hr (PS4 promo $1/hr for sessions started 08:00–11:59 Bulawayo time), Xbox rate entered per session.
- EcoCash details and shop location (QR + Maps link) on the **Payments & location** tab. Payments are confirmed manually; no payment gateway is connected.

## How billing is protected
- Session start and finish times are stamped by the **Firebase server clock**, not the phone. A wrong phone clock or timezone cannot change the bill.
- The hourly rate is checked by the security rules when a session starts (including the PS4 promo window) and cannot be changed afterwards by staff.
- Amounts are not stored; they are calculated from the server times and the locked rate (charged per started minute, minimum 1 minute).
- Any staff member can **finish** any active session (shift handover). Only the staff member who started a session can **rename** or **cancel** it, and a reason is required. Masters can correct any record.
- Staff cannot change finished or cancelled sessions. Nobody can delete sessions or audit entries from the app.

## Required setup (owner/admin)
1. Create a Firebase project at https://console.firebase.google.com/.
2. Enable **Authentication → Sign-in method → Email/Password**.
3. Create a **Cloud Firestore** database.
4. In **Project settings → General → Your apps**, add a Web app and copy its Firebase config.
5. Edit `app/src/main/assets/app.js` and replace each `REPLACE_...` value in `firebaseConfig`.
6. Publish the security rules: paste `firestore.rules` into **Firestore Database → Rules** and publish,
   or run `firebase deploy --only firestore:rules` from this folder.
7. In **Authentication**, create an account for each master and each staff member.
8. In Firestore, create a `users/{AUTH_UID}` document for each account, using the exact Auth UID as the document ID:
   - Master: `{ "role": "master", "displayName": "Shop Owner" }`
   - Staff:  `{ "role": "staff", "displayName": "Staff Name" }`
   Roles can only be assigned from the Firebase Console / Admin SDK. The app cannot assign roles.
9. Build and install the APK on each shop phone (below) and sign in.

## Get the APK
**Option A — GitHub (no tools needed).** Every push runs the *Build & test* workflow. Open the repository's
**Actions** tab → latest run → download the `toxic-gaming-debug-apk` artifact, unzip it and install the `.apk`
on the phone (allow "Install unknown apps" when prompted).

**Option B — Android Studio.** Open this folder, let Gradle sync, then **Build → Build APK(s)**.
From a terminal: `./gradlew assembleDebug`. The APK is written to `app/build/outputs/apk/debug/`.

For Google Play distribution, create a signing key and build a signed release bundle (**Build → Generate Signed Bundle / APK**).

## Tests
`tests/` contains two automated suites that CI runs on every push:
- `rules/` — 35 checks against the Firestore emulator (pricing lock, backdating blocked, role separation, audit integrity).
- `ui/` — 31 end-to-end checks of the app in Chromium with an in-memory Firebase stand-in.

Run locally with Node 22 and Java 17: `cd tests && npm install && npx playwright install chromium && npm test`.

## Important notes / limitations
- The app needs internet: it loads the Firebase SDK from Google's CDN and syncs with Firestore.
- The PS4 promo window is hard-coded to Bulawayo time (UTC+2) in both `app.js` and `firestore.rules`. Change both if prices or hours change.
- The promo rate is set by the session's start time; a session that runs past 12:00 keeps the promo rate for its full duration.
- The dashboard shows today's revenue; the Reports tab summarises the most recent 500 sessions by day. For long-term accounting, export data from Firestore regularly.
- Have a qualified developer review the rules and test all workflows with real accounts before handling real customer or financial records.
