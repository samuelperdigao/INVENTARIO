import type { Metadata } from "next";

import { ServiceWorkerRegistration } from "@/components/service-worker-registration";

import "./globals.css";

export const metadata: Metadata = {
  title: "INVENTARIO | Laminação de Perfis",
  description: "Controle, conferência e relatórios de inventário da Laminação de Perfis.",
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
