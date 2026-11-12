import type { Metadata } from "next";
import Script from "next/script";
import "@/lib/env";
import { ClerkProvider } from "@clerk/nextjs";
import { shadcn } from "@clerk/themes";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "CodoGraph — Understand the Code. See the Connections.",
  description: "Developer intelligence for the places people build.",
};

const THEME_INIT_SCRIPT = `(function() {
  try {
    var match = document.cookie.match(/(?:^|; )codograph_theme=([^;]*)/);
    var stored = match ? decodeURIComponent(match[1]) : (localStorage.getItem('codograph_theme') || 'system');
    var isDark = stored === 'dark' || (stored === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    document.documentElement.setAttribute('data-theme', stored);
  } catch (e) {}
})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider
      appearance={{
        theme: shadcn,
        variables: {
          borderRadius: "0.75rem",
          fontFamily: "JetBrains Mono, monospace",
        },
      }}
    >
      <html lang="en" className="scroll-smooth" data-scroll-behavior="smooth" suppressHydrationWarning>
        <head>
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
          <link
            href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600;700&family=Silkscreen:wght@400;700&display=swap"
            rel="stylesheet"
          />
        </head>
        <body className="bg-background text-foreground font-jetbrains antialiased overflow-x-hidden selection:bg-primary selection:text-primary-foreground transition-colors duration-200">
          <Script id="codograph-theme-init" strategy="beforeInteractive">
            {THEME_INIT_SCRIPT}
          </Script>
          <ThemeProvider>{children}</ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
