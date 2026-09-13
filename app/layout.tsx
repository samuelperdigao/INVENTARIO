import type { Metadata } from "next";

import { ServiceWorkerRegistration } from "@/components/service-worker-registration";

import "./globals.css";

export const metadata: Metadata = {
  title: "INVENTARIO | Beam Blanks e Blocos",
  description: "Coleta, conferência e relatórios de inventário de Beam Blanks e Blocos.",
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>
        <ServiceWorkerRegistration />
        {children}
      </body>
    </html>
  );
}
