import type { Metadata } from "next";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://seo-pi-fawn.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "2000s Marriage Life Simulator | Interactive AI Story",
    template: "%s | NovelAI Story Guide",
  },
  description:
    "Play a nostalgic 2000s marriage life simulator story. Explore daily choices, newlywed scenes, and slice-of-life roleplay in an interactive AI story.",
  openGraph: {
    title: "2000s Marriage Life Simulator",
    description:
      "A nostalgic interactive AI story about newlywed life, daily choices, and warm 2000s slice-of-life roleplay.",
    type: "website",
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "2000s Marriage Life Simulator",
    description:
      "Start a nostalgic newlywed life simulator story with interactive choices and AI roleplay.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
