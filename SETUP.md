# Toxic Gaming 2.0 — Firebase + Android setup

## What this project provides
- Android wrapper with a web app UI.
- Firebase Authentication email/password sign-in.
- Firestore live sync for sessions, VIP bookings, events, and audit entries.
- Two or more master accounts can share the `master` role; staff use `staff`.
- Staff can edit/cancel their own active sessions; masters can see all sessions. Session changes are logged.
- Shop rates: PS5 $2/hr, PS4 $1.50/hr (PS4 promo $1/hr for sessions started 08:00–11:59), Xbox custom rate.
- EcoCash details are informational/manual; no payment gateway is connected.

## Required setup (owner/admin)
1. Create a Firebase project at https://console.firebase.google.com/.
2. Enable **Authentication → Sign-in method → Email/Password**.
3. Create a **Cloud Firestore** database.
4. In Project settings → General → Your apps, add a Web app and copy its Firebase config.
5. Edit `app/src/main/assets/app.js` and replace each `REPLACE_...` value in `firebaseConfig`.
6. Publish `firestore.rules` in Firebase Console → Firestore Database → Rules.
7. In Authentication, create user accounts for both master devices and each staff member.
8. In Firestore, create a `users/{AUTH_UID}` document for each account. Use the exact Auth UID as document ID:
   - Master document example: `{ "role": "master", "displayName": "Shop Owner" }`
   - Staff document example: `{ "role": "staff", "displayName": "Staff Name" }`
   Use Firebase Console/admin access to assign roles. The app intentionally cannot assign roles.
9. Build and install the Android app on the master phones and staff devices. Sign in with each account.

## Build APK
Open this folder in Android Studio, sync Gradle, then select **Build → Build Bundle(s) / APK(s) → Build APK(s)**. The APK is usually under `app/build/outputs/apk/debug/`.

## Important notes / limitations
- This is a starter implementation, not a hosted/production-deployed service. Cloud sync will not work until Firebase is configured and rules are published.
- Role-based access is enforced in Firestore rules, but have a qualified developer review security rules and test all workflows before handling real customer/financial records.
- The sample security rules allow staff to update their own session document. Consider stricter field-level validation / server-side Cloud Functions before production.
- Current promotion logic applies the PS4 promo based on the session's start time (08:00–11:59 local device time); it does not split a session that crosses the promo boundary.
- Session records are stored in a single shared collection; audit entries capture key actions, but additional auditing and reconciliation should be added before live use.
- EcoCash payments require a separate approved payment-provider integration. No payments are collected by this app.
- QR code / location remains a Google Maps search for Luxor House, Shop 13A, Bulawayo.
