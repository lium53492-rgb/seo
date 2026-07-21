import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import "./globals.css";
import { cn } from "@/lib/utils";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://seo-pi-fawn.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Story-Led AI Voice Roleplay | NovelAI Story Guide",
    template: "%s | NovelAI Story Guide",
  },
  description:
    "Explore a story-led AI voice roleplay format that begins with an existing plot and lets you choose an available story character.",
  openGraph: {
    title: "Story-Led AI Voice Roleplay",
    description:
      "Begin with an existing story plot, choose an available character, and perform inside the scene.",
    type: "website",
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "Story-Led AI Voice Roleplay",
    description:
      "Enter an existing story, choose an available role, and perform inside the scene.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={cn(GeistSans.variable, GeistMono.variable)}>
      <body className={GeistSans.className}>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
