const fallbackSiteUrl = "https://seo-pi-fawn.vercel.app";

export function getSiteUrl() {
  const value = process.env.NEXT_PUBLIC_SITE_URL || fallbackSiteUrl;
  const url = new URL(value);
  if (url.protocol !== "https:" && url.hostname !== "localhost") {
    throw new Error("NEXT_PUBLIC_SITE_URL must use HTTPS outside local development");
  }
  return url;
}

export function absoluteSiteUrl(path: string) {
  return new URL(path, getSiteUrl()).toString();
}
