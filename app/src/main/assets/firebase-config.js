// Firebase web config shared by the Android app and the web app, so both use the same backend.
// Replace each REPLACE_ value with your project's config (Firebase console → Project settings →
// General → Your apps → Web app). These values are not secret; access is enforced by
// Firebase Authentication and firestore.rules.
export const firebaseConfig = {
  apiKey: "REPLACE_WITH_FIREBASE_API_KEY",
  authDomain: "REPLACE_WITH_PROJECT.firebaseapp.com",
  projectId: "REPLACE_WITH_PROJECT_ID",
  storageBucket: "REPLACE_WITH_PROJECT.appspot.com",
  messagingSenderId: "REPLACE_WITH_SENDER_ID",
  appId: "REPLACE_WITH_APP_ID"
};
