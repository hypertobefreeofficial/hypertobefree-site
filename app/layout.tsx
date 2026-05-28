import type { ReactNode } from "react";
import RegisterServiceWorker from "../components/RegisterServiceWorker";
import "./globals.css";

export const metadata = {
  title: "Hyper to Be Free",
  description:
    "A faith-centered space for testimonies, praise reports, prayer encouragement, and stories of freedom.",
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <RegisterServiceWorker />
        {children}
      </body>
    </html>
  );
}
