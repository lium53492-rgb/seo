import type { Metadata } from "next";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import "./globals.css";
import { cn } from "@/lib/utils";
import { absoluteSiteUrl, getSiteUrl } from "@/lib/seo/site";
import { getReleaseRevision } from "@/lib/seo/release";

const releaseRevision = getReleaseRevision();

export const metadata: Metadata = {
  metadataBase: getSiteUrl(),
  title: {
    default: "D&D Field Guides for Players and Game Masters",
    template: "%s | Tabletop Field Notes",
  },
  description:
    "Original, adult-oriented field guides for D&D campaign prep, character craft, at-table improvisation, and campaign continuity.",
  openGraph: {
    title: "D&D Field Guides for Players and Game Masters",
    description:
      "Table-ready answers for campaign pressure, player agency, character decisions, and Game Master preparation.",
    type: "website",
    url: absoluteSiteUrl("/"),
  },
  twitter: {
    card: "summary_large_image",
    title: "D&D Field Guides for Players and Game Masters",
    description:
      "Original, unofficial field notes for adult D&D players and Game Masters.",
  },
  ...(releaseRevision
    ? { other: { "git-revision": releaseRevision } }
    : {}),
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const isVercel =
    process.env.VERCEL === "1" && Boolean(process.env.VERCEL_URL);
  const googleAnalyticsId =
    isVercel
      ? process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || "G-S1CJS32N3F"
      : "";

  return (
    <html
      lang="en"
      className={cn(GeistSans.variable, GeistMono.variable)}
      data-release-revision={releaseRevision ?? undefined}
    >
      <body className={GeistSans.className}>
        {children}
        {isVercel ? <Analytics /> : null}
      </body>
      {googleAnalyticsId ? (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${googleAnalyticsId}`}
            strategy="afterInteractive"
          />
          <Script id="google-analytics" strategy="afterInteractive">
            {`window.dataLayer = window.dataLayer || [];
function gtag(){window.dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${googleAnalyticsId}');`}
          </Script>
        </>
      ) : null}
    </html>
  );
}
