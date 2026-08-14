import type { Metadata, Viewport } from "next";

import "./globals.css";
import { Nav } from "@/components/nav";
import { InstalarApp } from "@/components/instalar-app";
import { TooltipProvider } from "@/components/ui/tooltip";

export const metadata: Metadata = {
  title: "Contas a Receber 1 · Grupo Ley",
  description: "Controle interno de prazos de recebimento — Grupo Ley.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/favicon-32.png", sizes: "32x32", type: "image/png" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Contas a Receber",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8fafc" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1120" },
  ],
};

const initTheme = `try{var t=localStorage.getItem('theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark');}}catch(e){}`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: initTheme }} />
      </head>
      <body className="font-sans antialiased">
        <TooltipProvider delayDuration={200}>
          <Nav />
          <main className="container py-6 sm:py-8">{children}</main>
          <footer className="container pb-8 pt-4 text-center text-xs text-muted-foreground">
            Grupo Ley · Controle interno de contas a receber
          </footer>
          <InstalarApp />
        </TooltipProvider>
      </body>
    </html>
  );
}
