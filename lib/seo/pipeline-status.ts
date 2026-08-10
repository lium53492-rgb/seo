import "server-only";

import { access, readFile } from "node:fs/promises";
import * as path from "node:path";
import seoPolicy from "@/data/config/seo-policy.json";
import architecturePolicy from "@/data/config/content-architecture.json";
import {
  repositoryPublicationStage,
  validatePipelineReviewContract,
} from "./pipeline-contract.mjs";
import { parseReport } from "./report-store";

type ArtifactKey = "growth" | "research" | "report" | "review" | "pdf";

export type DailyPipelineStatus = {
  date: string;
  checkedAt: string;
  stage:
    | "not_started"
    | "growth_collected"
    | "research_invalid"
    | "research_ready"
    | "report_ready"
    | "review_ready"
    | "repository_published"
    /** @deprecated A report's local `published` state is not deployment evidence. */
    | "published"
    | "blocked";
  artifacts: Record<Exclude<ArtifactKey, "pdf">, boolean> & {
    /** Local delivery check. Production cannot infer ignored workstation PDFs. */
    pdf: boolean | null;
  };
  research: {
    policyVersion: number | null;
    candidateCount: number | null;
    decision: string | null;
    contractValid: boolean | null;
  };
  publicationStatus: string | null;
  blockers: string[];
};

function shanghaiDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function isMissingFile(error: unknown) {
  return Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "ENOENT",
  );
}

async function readOptionalFile(loader: () => Promise<string>) {
  try {
    return await loader();
  } catch (error) {
    if (isMissingFile(error)) return null;
    throw error;
  }
}

function readJson(source: string) {
  return JSON.parse(source) as Record<string, unknown>;
}

async function localPdfExists(date: string) {
  try {
    await access(path.join(process.cwd(), "output", "pdf", `seo-daily-${date}.pdf`));
    return true;
  } catch (error) {
    if (isMissingFile(error)) return false;
    throw error;
  }
}

async function hasPublishedPageForReport(reportId: string, slug: string | null) {
  if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return false;
  try {
    const page = readJson(await readFile(
      path.join(process.cwd(), "data", "pages", `${slug}.json`),
      "utf8",
    ));
    return page.status === "published" &&
      page.slug === slug &&
      page.generatedFromReport === reportId;
  } catch (error) {
    if (!isMissingFile(error)) throw error;
    return false;
  }
}

function validateResearchContract(research: Record<string, unknown>) {
  const blockers: string[] = [];
  const policyVersion = typeof research.policyVersion === "number" ? research.policyVersion : null;
  if (policyVersion !== 4) {
    blockers.push(`今日研究使用 policy v${policyVersion ?? "unknown"}，当前构建器要求 policy v4。`);
  }

  const candidates = Array.isArray(research.candidates) ? research.candidates : [];
  if (candidates.length < 5 || candidates.length > 12) {
    blockers.push(`今日研究包含 ${candidates.length} 个候选，policy v4 要求 5–12 个。`);
  }
  const invalidEvidence = candidates.filter((candidate) => {
    if (!candidate || typeof candidate !== "object" || !("decisionEvidence" in candidate)) return true;
    const evidence = candidate.decisionEvidence;
    if (!evidence || typeof evidence !== "object" || !("schemaVersion" in evidence)) return true;
    return evidence.schemaVersion !== 1;
  });
  if (invalidEvidence.length) {
    blockers.push(`${invalidEvidence.length} 个候选缺少 decisionEvidence.schemaVersion=1。`);
  }

  const portfolioDecision = research.portfolioDecision;
  const decision = portfolioDecision && typeof portfolioDecision === "object" && "action" in portfolioDecision
    ? String(portfolioDecision.action)
    : null;
  if (!decision) blockers.push("今日研究缺少 portfolioDecision。");

  return {
    blockers,
    policyVersion,
    candidateCount: candidates.length,
    decision,
    contractValid: blockers.length === 0,
  };
}

export async function readDailyPipelineStatus(now = new Date()): Promise<DailyPipelineStatus> {
  const date = shanghaiDate(now);
  const [growthSource, researchSource, reportSource, reviewSource] = await Promise.all([
    readOptionalFile(() =>
      readFile(path.join(process.cwd(), "data", "growth", `${date}.json`), "utf8")
    ),
    readOptionalFile(() =>
      readFile(path.join(process.cwd(), "data", "research", `${date}.json`), "utf8")
    ),
    readOptionalFile(() =>
      readFile(path.join(process.cwd(), "data", "reports", `${date}.json`), "utf8")
    ),
    readOptionalFile(() =>
      readFile(path.join(process.cwd(), "data", "reviews", `${date}.json`), "utf8")
    ),
  ]);
  const fileArtifacts = {
    growth: growthSource !== null,
    research: researchSource !== null,
    report: reportSource !== null,
    review: reviewSource !== null,
  };
  const hostedOnVercel =
    process.env.VERCEL === "1" && Boolean(process.env.VERCEL_URL);
  const artifacts = {
    ...fileArtifacts,
    pdf: hostedOnVercel ? null : await localPdfExists(date),
  };

  const blockers: string[] = [];
  let research = {
    policyVersion: null as number | null,
    candidateCount: null as number | null,
    decision: null as string | null,
    contractValid: null as boolean | null,
  };
  if (researchSource) {
    try {
      const validation = validateResearchContract(readJson(researchSource));
      research = {
        policyVersion: validation.policyVersion,
        candidateCount: validation.candidateCount,
        decision: validation.decision,
        contractValid: validation.contractValid,
      };
      blockers.push(...validation.blockers);
    } catch (error) {
      research.contractValid = false;
      blockers.push(`今日研究文件无法解析：${error instanceof Error ? error.message : "unknown error"}`);
    }
  }

  let currentPublicationStatus: string | null = null;
  let currentReportId: string | null = null;
  let currentDraftDigest: string | null = null;
  let currentReportGeneratedAt: string | null = null;
  let currentPublicationSlug: string | null = null;
  let currentDraftSchemaVersion: number | null = null;
  if (reportSource) {
    try {
      const dailyReport = parseReport(
        reportSource,
        `data/reports/${date}.json`,
      );
      currentReportId = dailyReport.id;
      currentReportGeneratedAt = dailyReport.generatedAt;
      currentDraftDigest = dailyReport.publication?.draftDigest ?? null;
      currentPublicationSlug = dailyReport.publication?.slug ?? null;
      currentDraftSchemaVersion = dailyReport.draft &&
          "schemaVersion" in dailyReport.draft &&
          typeof dailyReport.draft.schemaVersion === "number"
        ? dailyReport.draft.schemaVersion
        : null;
      if (dailyReport.date !== date || dailyReport.policyVersion !== 4) {
        blockers.push("今日日报存在，但日期或 policy v4 绑定无效。");
      }
      currentPublicationStatus =
        dailyReport.publication?.status ??
        dailyReport.publications?.[0]?.status ??
        null;
    } catch (error) {
      blockers.push(`今日日报未通过完整结构校验：${error instanceof Error ? error.message : "unknown error"}`);
    }
  }

  if (reviewSource) {
    try {
      if (!validatePipelineReviewContract({
        review: readJson(reviewSource),
        reportId: currentReportId,
        expectedSlug: currentPublicationSlug,
        expectedDigest: currentDraftDigest,
        reportGeneratedAt: currentReportGeneratedAt,
        draftSchemaVersion: currentDraftSchemaVersion,
        requiredDraftSchemaVersion: architecturePolicy.requiredDraftSchemaVersion,
        baseRequiredChecks: seoPolicy.requiredReviewChecks,
        architectureRequiredChecks: architecturePolicy.requiredReviewChecks,
        reportDate: date,
        visualAuditPolicy: seoPolicy.visualAudit,
      })) {
        blockers.push("今日审稿文件存在，但批准记录结构或 reportId 绑定无效。");
      }
    } catch (error) {
      blockers.push(`今日审稿文件无法解析：${error instanceof Error ? error.message : "unknown error"}`);
    }
  }

  if (artifacts.report && !artifacts.growth) {
    blockers.push("今日日报存在，但缺少同日全页面增长快照。");
  }
  if (artifacts.report && !artifacts.research) {
    blockers.push("今日日报存在，但缺少同日研究输入。");
  }
  if (artifacts.review && !artifacts.report) {
    blockers.push("今日审稿文件存在，但缺少其绑定的 builder-backed 日报。");
  }
  if (currentPublicationStatus === "published") {
    if (!artifacts.review) {
      blockers.push("日报声称 published，但缺少独立审稿记录。");
    }
    if (!currentReportId ||
      !await hasPublishedPageForReport(currentReportId, currentPublicationSlug)) {
      blockers.push("日报声称 published，但 data/pages 中没有与 reportId 绑定的已发布页面。");
    }
  }

  if (artifacts.pdf === true && !artifacts.report) {
    blockers.push("同日 PDF 已存在，但 builder-backed 日报缺失；不得把该 PDF 当作发布报告。");
  }
  if (research.decision === "observe" && !artifacts.report) {
    blockers.push("今日 portfolioDecision 为 observe，不应生成或发布新页面。");
  }

  let stage: DailyPipelineStatus["stage"] = "not_started";
  if (artifacts.growth) stage = "growth_collected";
  if (artifacts.research) stage = research.contractValid ? "research_ready" : "research_invalid";
  if (artifacts.report) stage = "report_ready";
  if (artifacts.review) stage = "review_ready";
  stage = repositoryPublicationStage(currentPublicationStatus) ?? stage;
  if (blockers.length) stage = "blocked";

  return {
    date,
    checkedAt: new Date().toISOString(),
    stage,
    artifacts,
    research,
    publicationStatus: currentPublicationStatus,
    blockers,
  };
}
