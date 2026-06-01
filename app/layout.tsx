import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import RegisterServiceWorker from "../components/RegisterServiceWorker";
import LoggedInBottomNav from "../components/LoggedInBottomNav";
import MobileSplashScreen from "../components/MobileSplashScreen";
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

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <MobileSplashScreen />
        <RegisterServiceWorker />
        {children}
        <LoggedInBottomNav />
      </body>
    </html>
  );
}
