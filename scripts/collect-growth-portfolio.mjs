import "./load-env.mjs";

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import {
  collectGrowthPortfolio,
  shanghaiDate,
} from "./lib/growth-portfolio.mjs";

const outputArgument = process.argv[2];
const daysArgument = process.argv[3];
const policy = JSON.parse(readFileSync(resolve("data/config/seo-policy.json"), "utf8"));
const days = daysArgument === undefined
  ? Number(policy.feedbackLoop?.reportingWindowDays ?? 28)
  : Number(daysArgument);
const reportingLagDays = Number(policy.feedbackLoop?.reportingLagDays ?? 3);
const pagesDirectory = resolve("data/pages");
const pages = existsSync(pagesDirectory)
  ? readdirSync(pagesDirectory)
    .filter((name) => name.endsWith(".json"))
    .map((name) => JSON.parse(readFileSync(resolve(pagesDirectory, name), "utf8")))
    .filter((page) => page.status === "published")
    .map((page) => ({ slug: page.slug, path: page.path, keyword: page.keyword }))
    .sort((left, right) => left.slug.localeCompare(right.slug))
  : [];

const snapshot = await collectGrowthPortfolio({
  pages,
  password: process.env.WORKBENCH_PASSWORD,
  siteUrl: process.env.SEO_REPORT_SITE_URL,
  days,
  reportingLagDays,
});

if (outputArgument === "-") {
  process.stdout.write(`${JSON.stringify(snapshot, null, 2)}\n`);
} else {
  const outputPath = resolve(outputArgument || `data/growth/${shanghaiDate()}.json`);
  if (existsSync(outputPath)) {
    throw new Error(`Refusing to overwrite existing growth portfolio: ${outputPath}`);
  }
  mkdirSync(dirname(outputPath), { recursive: true });
  const temporaryPath = `${outputPath}.${process.pid}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  renameSync(temporaryPath, outputPath);
  process.stdout.write(`${outputPath}\n`);
}
