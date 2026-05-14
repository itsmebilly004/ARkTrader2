import { Outlet, Link, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { Toaster } from "@/components/ui/sonner";
import { DerivBalanceProvider } from "@/context/deriv-balance-context";

import appCss from "../styles.css?url";
import faviconUrl from "../assets/favicon.png?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground font-mono">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "ArkTrader Hub — Trade Smarter with Automation" },
      {
        name: "description",
        content:
          "ArkTrader Hub is a third-party trading platform for Deriv. Trade synthetic indices, automate strategies, and stay in control of risk.",
      },
      { name: "author", content: "ArkTrader Hub" },
      { property: "og:title", content: "ArkTrader Hub — Trade Smarter with Automation" },
      {
        property: "og:description",
        content:
          "Connect your Deriv account to a high-performance terminal with bots, analytics, and built-in risk controls.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/png", href: faviconUrl },
      { rel: "apple-touch-icon", href: faviconUrl },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

const THEME_INIT_SCRIPT = `
(function(){try{
  var t = localStorage.getItem('arktrader-theme');
  if (t !== 'dark' && t !== 'light') t = 'light';
  var r = document.documentElement;
  r.classList.toggle('dark', t === 'dark');
  r.dataset.theme = t;
  r.style.colorScheme = t;
}catch(e){}})();
`;

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        {children}
        <Toaster />
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  return (
    <DerivBalanceProvider>
      <Outlet />
    </DerivBalanceProvider>
  );
}
