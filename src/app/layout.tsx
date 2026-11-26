import type { Metadata, Viewport } from "next";
import { Oswald, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const oswald = Oswald({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-oswald",
  display: "swap",
});

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plus-jakarta-sans",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://onesticx.diclaude.tech"),
  title: {
    default: "1St!cx Billiard (Onesticx) — Booking Meja Real-time",
    template: "%s | Onesticx Billiard",
  },
  description:
    "Cek ketersediaan meja billiard secara real-time dan booking online di 1St!cx Billiard (Onesticx), Jl. Darussalam, Kampung Jawa Baru, Kota Lhokseumawe. Buka setiap hari 10.00 - 02.00 WIB.",
  manifest: "/manifest.json",
  openGraph: {
    title: "1St!cx Billiard (Onesticx) — Booking Meja Online",
    description:
      "Cek meja kosong real-time & reservasi cepat di 1St!cx Billiard Lhokseumawe. Buka setiap hari 10.00 - 02.00 WIB.",
    url: "https://onesticx.diclaude.tech",
    siteName: "1St!cx Billiard (Onesticx)",
    locale: "id_ID",
    type: "website",
    images: [
      {
        url: "/images/onesticx-logo.png",
        width: 512,
        height: 512,
        alt: "Logo 1St!cx Billiard (Onesticx)",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: "1St!cx Billiard (Onesticx) — Booking Meja Online",
    description:
      "Cek meja kosong real-time & booking meja di 1St!cx Billiard Lhokseumawe (10.00 - 02.00 WIB).",
    images: ["/images/onesticx-logo.png"],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Onesticx Billiard",
  },
};

export const viewport: Viewport = {
  themeColor: "#121212",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="id"
      className={`dark ${oswald.variable} ${plusJakartaSans.variable}`}
    >
      <body className="min-h-screen bg-background font-sans text-foreground antialiased selection:bg-primary/30 selection:text-foreground">
        {children}
      </body>
    </html>
  );
}
