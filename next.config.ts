import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  turbopack: {
    root: path.join(__dirname),
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "firebasestorage.googleapis.com" },
      { protocol: "https", hostname: "**" },
    ],
  },
  // Trackable short URLs for the offline yard-sign QR campaign. These paths are
  // printed on physical signs, so they must stay stable. Each sends the visitor
  // to the landing page with campaign UTM params so analytics can attribute the
  // visit to a specific sign design. Temporary (307) redirects — not permanent —
  // so the destination can change later without browsers caching the old target.
  async redirects() {
    return [
      {
        source: "/q/fridge",
        destination: "/?utm_source=yard_sign&utm_medium=qr&utm_campaign=fridge",
        permanent: false,
      },
      {
        source: "/q/highway",
        destination: "/?utm_source=yard_sign&utm_medium=qr&utm_campaign=highway",
        permanent: false,
      },
      {
        source: "/q/emergency",
        destination: "/?utm_source=yard_sign&utm_medium=qr&utm_campaign=emergency",
        permanent: false,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
