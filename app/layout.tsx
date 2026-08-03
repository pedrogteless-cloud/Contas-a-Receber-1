import type { Metadata } from "next";

import "./globals.css";
import { Nav } from "@/components/nav";

export const metadata: Metadata = {
  title: "Contas a Receber 1 · Grupo Ley",
  description: "Controle interno de prazos de recebimento — Grupo Ley.",
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
        <Nav />
        <main className="container py-6 sm:py-8">{children}</main>
        <footer className="container pb-8 pt-4 text-center text-xs text-muted-foreground">
          Grupo Ley · Controle interno de contas a receber
        </footer>
      </body>
    </html>
  );
}
