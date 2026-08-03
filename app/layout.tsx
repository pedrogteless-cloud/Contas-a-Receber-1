import type { Metadata } from "next";

import "./globals.css";
import { Nav } from "@/components/nav";

export const metadata: Metadata = {
  title: "Contas a Receber 1 · Grupo Ley",
  description: "Controle interno de prazos de recebimento — Grupo Ley.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <Nav />
        <main className="container py-6">{children}</main>
      </body>
    </html>
  );
}
