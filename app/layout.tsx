import type { Metadata } from "next";

import { ServiceWorkerRegistration } from "@/components/service-worker-registration";

import "./globals.css";

export const metadata: Metadata = {
  title: "Inventário offline",
  description: "Lançamento local de inventário e análise determinística.",
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

