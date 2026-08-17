import Link from "next/link";
import { publicSitePath } from "@/lib/seo/site";

export default function NotFound() {
  return (
    <main className="site-not-found">
      <div className="site-not-found-orbit" aria-hidden="true"><i /><i /><i /></div>
      <p>CAMPAIGN ARCHIVE / 404</p>
      <h1>This field note is no longer in the archive.</h1>
      <span>The route may have been retired, or the next campaign guide is still at the table.</span>
      <Link href={publicSitePath("/")}>Return to Tabletop Field Notes</Link>
    </main>
  );
}
