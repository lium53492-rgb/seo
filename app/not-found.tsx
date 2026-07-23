import Link from "next/link";

export default function NotFound() {
  return (
    <main className="site-not-found">
      <div className="site-not-found-orbit" aria-hidden="true"><i /><i /><i /></div>
      <p>STORY PATH 404</p>
      <h1>This scene is not in the story yet.</h1>
      <span>The link may be old, or the next chapter has not been published.</span>
      <Link href="/">Return to the story shelf</Link>
    </main>
  );
}
