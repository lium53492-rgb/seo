const FULL_GIT_SHA = /^[a-f0-9]{40}$/i;

type ReleaseEnvironment = Readonly<Record<string, string | undefined>>;

export function getReleaseRevision(environment: ReleaseEnvironment = process.env) {
  const isVercel = environment.VERCEL === "1" || Boolean(environment.VERCEL_ENV);
  const keys = isVercel
    ? ["VERCEL_GIT_COMMIT_SHA"]
    : ["VERCEL_GIT_COMMIT_SHA", "GITHUB_SHA", "NEXT_PUBLIC_RELEASE_SHA"];
  for (const key of keys) {
    const value = environment[key]?.trim();
    if (value && FULL_GIT_SHA.test(value)) return value.toLowerCase();
  }
  return null;
}
