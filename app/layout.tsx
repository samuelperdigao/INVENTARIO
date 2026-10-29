import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";

import { ServiceWorkerRegistration } from "@/components/service-worker-registration";

import "./tokens.css";
import "./globals.css";
import "./app-redesign.css";

// Fontes servidas pelo próprio app (sem requisição ao Google em tempo de uso), então funcionam offline.
const inter = Inter({ subsets: ["latin"], display: "swap", variable: "--font-inter" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["500", "600"], display: "swap", variable: "--font-mono" });

export const metadata: Metadata = {
  title: "INVENTARIO | Beam Blanks e Blocos",
  description: "Coleta, conferência e relatórios de inventário de Beam Blanks e Blocos.",
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className={`${inter.variable} ${mono.variable}`}>
      <body>
        <ServiceWorkerRegistration />
        {children}
      </body>
    </html>
  );
}
