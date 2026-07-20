"use client";

import { useState } from "react";
import { MessageResponse } from "@/components/ai-elements/message";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { DailySeoReport } from "@/lib/seo/types";

type StorageResult = {
  persisted: boolean;
  path?: string;
  repository?: string;
  reason?: string;
};

type RunState =
  | { state: "idle" }
  | { state: "running" }
  | { state: "done"; report: DailySeoReport; storage?: StorageResult }
  | { state: "error"; message: string; issues: string[] };

export function RunPipelineButton({
  enabled,
  automationMode = false,
}: {
  enabled: boolean;
  automationMode?: boolean;
}) {
  const [run, setRun] = useState<RunState>({ state: "idle" });

  if (automationMode) {
    return (
      <div className="wb-automation-status" role="status">
        <strong>免费全自动发布已启用</strong>
        <span>每日 09:15 研究 → 质检 → GitHub → Vercel</span>
      </div>
    );
  }

  async function startRun() {
    setRun({ state: "running" });
    try {
      const response = await fetch("/api/workbench/run", { method: "POST" });
      const payload = await response.text();
      const body = (payload ? JSON.parse(payload) : {}) as {
        report?: DailySeoReport;
        storage?: StorageResult;
        error?: string;
        issues?: string[];
      };
      if (!response.ok || !body.report) {
        throw Object.assign(new Error(body.error || `运行失败（HTTP ${response.status}）`), {
          issues: body.issues ?? [],
        });
      }
      setRun({ state: "done", report: body.report, storage: body.storage });
    } catch (error) {
      const failure = error as Error & { issues?: string[] };
      setRun({
        state: "error",
        message: failure.message || "运行失败",
        issues: failure.issues ?? [],
      });
    }
  }

  const draft = run.state === "done" ? run.report.draft : null;

  return (
    <div className="wb-run-control">
      <button
        className="wb-primary-button"
        type="button"
        disabled={!enabled || run.state === "running"}
        onClick={startRun}
      >
        {!enabled
          ? "接入工作台密码后可运行"
          : run.state === "running"
            ? "正在读取真实数据并生成内容…"
            : "运行今日生产工作流"}
      </button>
      {!enabled ? <p className="wb-readonly-note">当前为公开只读状态</p> : null}
      {run.state === "error" ? (
        <div className="wb-run-error-card">
          <strong>生产运行被阻止</strong>
          <span>{run.message}</span>
          {run.issues.map((issue) => <small key={issue}>{issue}</small>)}
        </div>
      ) : null}
      <Dialog
        open={run.state === "done"}
        onOpenChange={(open) => {
          if (!open) setRun({ state: "idle" });
        }}
      >
        {run.state === "done" ? (
          <DialogContent className="wb-run-dialog max-h-[90vh] overflow-y-auto p-0 sm:max-w-5xl">
            <DialogHeader>
              <p className="wb-kicker">PRODUCTION RUN COMPLETE</p>
              <DialogTitle>{run.report.mode === "live" ? "真实数据链路已完成" : "部分真实数据已完成"}</DialogTitle>
              <DialogDescription className="wb-run-result-meta">
                {run.report.summary.candidatesAnalyzed} 个关键词 · {run.report.summary.totalImpressions} 次曝光 ·
                {run.storage?.persisted ? ` 已保存到 ${run.storage.repository}/${run.storage.path}` : " 尚未持久化"}
              </DialogDescription>
            </DialogHeader>
            <div className="wb-run-result-inner">
              {draft ? (
                <div className="wb-run-draft">
                  <div>
                    <span className={`wb-mode-badge ${draft.status === "ready_for_review" ? "live" : "blocked"}`}>
                      {draft.status === "ready_for_review" ? "READY FOR REVIEW" : "BLOCKED"}
                    </span>
                    <MessageResponse className="wb-ai-title">{draft.title}</MessageResponse>
                    <MessageResponse>{draft.heroMarkdown}</MessageResponse>
                    <MessageResponse className="wb-run-cta-copy">{draft.primaryCta}</MessageResponse>
                  </div>
                  <aside className="wb-quality-panel">
                    <p>MODEL</p><strong>{draft.model}</strong>
                    <p>WORDS</p><strong>{draft.quality.wordCount}</strong>
                    {draft.quality.checks.map((check) => (
                      <span className={check.passed ? "passed" : "failed"} key={check.id}>
                        {check.passed ? "✓" : "×"} {check.label}
                      </span>
                    ))}
                  </aside>
                </div>
              ) : (
                <p>没有生成内容草稿；检查 AI Gateway 连接状态。</p>
              )}
            </div>
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}
