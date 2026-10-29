import type { CapacitorConfig } from '@capacitor/cli';

// Bump this token on every APK release to force the WebView to bypass
// any cached HTML/JS from a prior install.
const RELEASE_TOKEN = '20260821-1';

// Where the APK gets its web content.
//
//   default          -> bundles the local `dist` build into the APK.
//                       Always the code in this repo. Needs a new APK per change.
//   CAP_REMOTE=1     -> loads a hosted site instead, so web fixes ship
//                       without a new APK. Defaults to the production custom
//                       domain (https://locate.quickapp.ai); override with
//                       CAP_REMOTE_URL for a staging/preview build, e.g.
//                       CAP_REMOTE_URL=https://sbeestaging.lovable.app
//
// Remote is OFF by default. Before enabling it, confirm the target URL has
// actually been republished from the codebase you expect (a stale remote
// build can white-screen inside the Android WebView, and the production
// domain vs. a staging preview are NOT the same app/data):
//
//   CAP_REMOTE=1 npm run sync:android
//   CAP_REMOTE=1 CAP_REMOTE_URL=https://sbeestaging.lovable.app npm run sync:android
//
const USE_REMOTE = process.env.CAP_REMOTE === '1';
const REMOTE_BASE_URL = process.env.CAP_REMOTE_URL || 'https://locate.quickapp.ai';
const REMOTE_HOST = new URL(REMOTE_BASE_URL).hostname;
const REMOTE_PARENT_DOMAIN = REMOTE_HOST.split('.').slice(-2).join('.');

const config: CapacitorConfig = {
  appId: 'ai.quickapp.fieldforce',
  appName: 'QuickLocate',
  webDir: 'dist',
  ...(USE_REMOTE
    ? {
        server: {
          url: `${REMOTE_BASE_URL}?v=${RELEASE_TOKEN}&forceHideBadge=true`,
          androidScheme: 'https',
          allowNavigation: [REMOTE_HOST, `*.${REMOTE_PARENT_DOMAIN}`],
        },
      }
    : {}),
  android: {
    // Allow WebView to handle camera/location permission prompts
    allowMixedContent: true,
    captureInput: true,
    webContentsDebuggingEnabled: true,
  },
  plugins: {
    Camera: {
      permissions: ['camera'],
    },
    Geolocation: {
      permissions: ['location', 'coarseLocation'],
    },
    Microphone: {
      permissions: ['microphone'],
    },
    Filesystem: {
      permissions: ['publicStorage'],
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
