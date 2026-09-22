import { useEffect } from "react";
import type { ReactNode } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { QueryClientProvider } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
  Scripts,
  useRouter,
} from "@tanstack/react-router";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";
import PWAUpdatePrompt from "@/components/PWAUpdatePrompt";
import NotFound from "@/pages/NotFound";
import { useNativeStartup } from "@/hooks/useNativeStartup";
import { reportLovableError } from "@/lib/lovable-error-reporting";
import { checkAndBustCache, startVersionSync } from "@/utils/cacheVersion";
import { requestNativePermissions } from "@/utils/nativePermissions";
import appCss from "../styles.css?url";

// ported from main.tsx — stale-chunk recovery, cache-version busting, native
// permission bootstrap, and web-push service worker registration (client only).
const CHUNK_RELOAD_KEY = "chunk_reload_attempt";
function isChunkLoadError(msg: unknown): boolean {
  const s = typeof msg === "string" ? msg : (msg as Error)?.message || "";
  return /Failed to fetch dynamically imported module|Importing a module script failed|ChunkLoadError/i.test(s);
}
function handleChunkError(err: unknown) {
  if (!isChunkLoadError(err)) return;
  const last = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) || "0");
  if (Date.now() - last < 10_000) return; // avoid reload loop
  sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
  console.warn("[App] Stale chunk detected, reloading…");
  window.location.reload();
}

if (typeof window !== "undefined") {
  window.addEventListener("error", (e) => handleChunkError(e.error || e.message));
  window.addEventListener("unhandledrejection", (e) => handleChunkError(e.reason));

  // Check for new build and bust cache if needed (triggers reload once)
  const reloading = checkAndBustCache();

  if (!reloading) {
    requestNativePermissions();

    // Register service worker for Web Push (iPhone PWA + desktop).
    // Skipped inside Lovable editor iframes / preview hosts to avoid stale-shell issues.
    if ("serviceWorker" in navigator) {
      const isInIframe = (() => {
        try { return window.self !== window.top; } catch { return true; }
      })();
      const host = window.location.hostname;
      const isPreviewHost =
        host.includes("lovableproject.com") || host.includes("id-preview--");
      if (!isInIframe && !isPreviewHost) {
        const registerSw = () => {
          navigator.serviceWorker
            .register("/sw.js", { scope: "/" })
            .then((registration) => {
              const notifyWaiting = (worker: ServiceWorker | null) => {
                if (!worker) return;
                window.dispatchEvent(new CustomEvent("sw-waiting", { detail: worker }));
              };
              if (registration.waiting && navigator.serviceWorker.controller) {
                notifyWaiting(registration.waiting);
              }
              registration.addEventListener("updatefound", () => {
                const installing = registration.installing;
                if (!installing) return;
                installing.addEventListener("statechange", () => {
                  if (installing.state === "installed" && navigator.serviceWorker.controller) {
                    notifyWaiting(registration.waiting || installing);
                  }
                });
              });
              // Periodic update check (every 30 min)
              setInterval(() => registration.update().catch(() => {}), 30 * 60 * 1000);
            })
            .catch((e) => console.warn("[SW] register failed:", e));
        };
        if (document.readyState === "complete") {
          registerSw();
        } else {
          window.addEventListener("load", registerSw);
        }
      } else {
        navigator.serviceWorker.getRegistrations().then((regs) =>
          regs.forEach((r) => r.unregister().catch(() => {}))
        );
      }
    }

    // Start periodic server-version sync (production only, non-blocking)
    startVersionSync();
  }
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "UTF-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1.0, viewport-fit=cover" },
      { title: "QuickLocate — Field Operations Platform" },
      { name: "description", content: "QuickLocate field force management platform with GPS tracking, activity logging, attendance, and operations management." },
      { name: "author", content: "QuickLocate AI" },
      { name: "keywords", content: "field force, GPS tracking, operations, attendance, CRM" },
      { name: "theme-color", content: "#6366f1" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "QuickLocate" },
      { property: "og:type", content: "website" },
      { property: "og:title", content: "QuickLocate — Field Operations Platform" },
      { property: "og:description", content: "QuickLocate field force management platform with GPS tracking, activity logging, attendance, and operations management." },
      { property: "og:image", content: "/pwa-icon-512.png?v=qa1" },
      { property: "og:site_name", content: "QuickLocate Field Operations" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "QuickLocate — Field Operations Platform" },
      { name: "twitter:description", content: "QuickLocate field force management platform with GPS tracking, activity logging, attendance, and operations management." },
      { name: "twitter:image", content: "/pwa-icon-512.png?v=qa1" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png?v=qa1" },
      { rel: "icon", type: "image/png", href: "/favicon.png?v=qa1" },
      { rel: "shortcut icon", type: "image/png", href: "/favicon.png?v=qa1" },
    ],
    scripts: [
      {
        children:
          "window.addEventListener('beforeinstallprompt', function(e) { e.preventDefault(); window.__deferredPWAPrompt = e; });",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFound,
  errorComponent: RootErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  // Request native hardware permissions at launch, before any tracking hook
  // mounts (ported from the Classic App.tsx root).
  useNativeStartup();

  return (
    <QueryClientProvider client={queryClient}>
      <AppErrorBoundary>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <PWAUpdatePrompt />
          <Outlet />
        </TooltipProvider>
      </AppErrorBoundary>
    </QueryClientProvider>
  );
}

function RootErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();

  console.error(error);
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center text-foreground">
      <h1 className="text-2xl font-semibold">This page didn't load</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        Something went wrong while loading this page. You can try again or head back home.
      </p>
      <div className="flex gap-3">
        <button
          type="button"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-button"
          onClick={() => {
            router.invalidate();
            reset();
          }}
        >
          Try again
        </button>
        <a
          href="/"
          className="rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-card-foreground"
        >
          Go home
        </a>
      </div>
    </div>
  );
}
