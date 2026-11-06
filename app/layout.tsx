import type { Metadata } from "next";
import "./globals.css";
import "@/index.css";

export const metadata: Metadata = {
  title: "CodoGraph — Understand the Code. See the Connections.",
  description: "Developer intelligence for the places people build.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="scroll-smooth">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600;700&family=Silkscreen:wght@400;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-[#000000] text-white font-jetbrains antialiased overflow-x-hidden selection:bg-[#F64302] selection:text-white">
        {children}
      </body>
    </html>
  );
}
