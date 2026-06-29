import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "BusinessGoal IA",
  description: "Copiloto de decisiones empresariales para negocios con inventario.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
