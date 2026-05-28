import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Hyper to Be Free",
    short_name: "HTBF",
    description:
      "A faith-centered space for testimonies, praise reports, prayer encouragement, and stories of freedom.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f8fbff",
    theme_color: "#082f63",
    orientation: "portrait",
    icons: [
      {
        src: "/images/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/images/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
