import "./globals.css";
import { Fraunces } from "next/font/google";
import type { ReactNode } from "react";

const display = Fraunces({ subsets: ["latin"], variable: "--font-display", display: "swap" });

export const metadata = {
  title: "AI Trip Planner",
  description: "Plan trips with an AI travel planning workspace.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={display.variable}>
      <body>{children}</body>
    </html>
  );
}
