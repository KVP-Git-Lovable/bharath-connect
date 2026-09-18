// Removes @capacitor/push-notifications from the ANDROID build only.
//
// Why: the plugin's register() throws a native, uncatchable
//   java.lang.IllegalStateException: Default FirebaseApp is not initialized
// when android/app/google-services.json is absent. That kills the Capacitor
// plugin thread, the WebView process dies, and the app shows a white screen.
// A JS try/catch cannot stop it — the throw is on the Java side.
//
// The npm package stays installed so the web build (which dynamically imports
// it in src/hooks/usePushNotifications.ts) keeps working.
//
// `npx cap sync` regenerates these files from node_modules, so this runs
// after every sync via the `sync:android` script in package.json.
//
// To re-enable push: drop google-services.json into android/app/ and delete
// this script plus the `&& node scripts/strip-push-android.mjs` in package.json.

import { readFileSync, writeFileSync, existsSync } from "node:fs";

const targets = [
  "android/capacitor.settings.gradle",
  "android/app/capacitor.build.gradle",
];

// Capacitor registers plugins at runtime from this manifest. If a class is
// listed here but excluded from the Gradle build, the loader throws
// PluginLoadException and stops registering the REST of the plugins too —
// Camera, Geolocation and everything after it silently become
// "not implemented". So it must be stripped in lockstep with the Gradle files.
const PLUGINS_JSON = "android/app/src/main/assets/capacitor.plugins.json";

if (existsSync("android/app/google-services.json")) {
  console.log("[strip-push] google-services.json present — leaving push enabled.");
  process.exit(0);
}

let touched = 0;
for (const file of targets) {
  if (!existsSync(file)) continue;
  const before = readFileSync(file, "utf8");
  const after = before
    .split("\n")
    .filter((line) => !line.includes("capacitor-push-notifications"))
    .join("\n");
  if (after !== before) {
    writeFileSync(file, after);
    console.log(`[strip-push] removed push-notifications from ${file}`);
    touched++;
  }
}
if (existsSync(PLUGINS_JSON)) {
  const list = JSON.parse(readFileSync(PLUGINS_JSON, "utf8"));
  const kept = list.filter((p) => p.pkg !== "@capacitor/push-notifications");
  if (kept.length !== list.length) {
    writeFileSync(PLUGINS_JSON, JSON.stringify(kept, null, "\t") + "\n");
    console.log(`[strip-push] removed push-notifications from ${PLUGINS_JSON}`);
    touched++;
  }
}

console.log(
  touched
    ? "[strip-push] done — Android build excludes push notifications."
    : "[strip-push] nothing to strip."
);
