"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function RunPipelineButton({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "refreshing" | "error">("idle");
  const [message, setMessage] = useState("");

  async function refreshReport() {
    setStatus("refreshing");
    setMessage("");
    try {
      const response = await fetch("/api/workbench/run", {
        method: "POST",
        cache: "no-store",
        headers: { accept: "application/json" },
      });
      const body = await response.json() as {
        error?: string;
        pipeline?: { stage?: string; blockers?: string[] };
      };
      if (!response.ok || !body.pipeline?.stage) {
        throw new Error(body.error || `流程状态读取失败（HTTP ${response.status}）`);
      }
      router.refresh();
      setStatus("idle");
      const blockerCount = body.pipeline.blockers?.length ?? 0;
      setMessage(`今日阶段：${body.pipeline.stage}；${blockerCount ? `${blockerCount} 个阻塞` : "没有已记录阻塞"}。`);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "流程状态读取失败");
    }
  }

  return (
    <div className="wb-run-control">
      <button
        className="wb-primary-button"
        type="button"
        disabled={!enabled || status === "refreshing"}
        onClick={() => void refreshReport()}
      >
        {!enabled
          ? "工作台为只读"
          : status === "refreshing"
            ? "正在检查流程…"
            : "检查今日流程状态"}
      </button>
      {!enabled ? <p className="wb-readonly-note">当前无法读取受保护的流程状态。</p> : null}
      {message ? <p className={`wb-run-message ${status === "error" ? "wb-run-error" : ""}`}>{message}</p> : null}
    </div>
  );
}
