import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import RegisterServiceWorker from "../components/RegisterServiceWorker";
import MobileSplashScreen from "../components/MobileSplashScreen";
import AppBottomNav from "../components/AppBottomNav";
import { fontVariables, inter } from "../lib/fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hyper to Be Free",
  description:
    "A faith-centered space for testimonies, praise reports, prayer encouragement, and stories of freedom.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={fontVariables}>
      <body className={`${inter.className} font-sans font-normal antialiased`}>
        <MobileSplashScreen />
        <RegisterServiceWorker />
        {children}
        <AppBottomNav />
      </body>
    </html>
  );
}
