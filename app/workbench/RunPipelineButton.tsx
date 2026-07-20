"use client";

import { useState } from "react";

type RunState =
  | { state: "idle" }
  | { state: "running" }
  | { state: "done"; message: string }
  | { state: "error"; message: string };

type RunPipelineButtonProps = {
  enabled: boolean;
};

export function RunPipelineButton({ enabled }: RunPipelineButtonProps) {
  const [run, setRun] = useState<RunState>({ state: "idle" });

  async function startRun() {
    setRun({ state: "running" });
    try {
      const response = await fetch("/api/workbench/run", { method: "POST" });
      const body = (await response.json()) as {
        report?: { mode: string; opportunities: Array<{ keyword: string }> };
        storage?: { persisted: boolean; path?: string };
        error?: string;
      };
      if (!response.ok || !body.report) throw new Error(body.error || "运行失败");
      const keyword = body.report.opportunities[0]?.keyword ?? "今日任务";
      setRun({
        state: "done",
        message: `已生成 ${body.report.mode} 报告：${keyword}${body.storage?.persisted ? "，并已保存" : "（尚未配置持久化）"}`,
      });
    } catch (error) {
      setRun({
        state: "error",
        message: error instanceof Error ? error.message : "运行失败",
      });
    }
  }

  return (
    <div className="wb-run-control">
      <button
        className="wb-primary-button"
        type="button"
        disabled={!enabled || run.state === "running"}
        onClick={startRun}
      >
        {!enabled
          ? "接入权限后可运行"
          : run.state === "running"
            ? "正在采集与评分…"
            : "运行今日工作流"}
      </button>
      {!enabled ? <p className="wb-readonly-note">当前为公开只读 Demo</p> : null}
      {run.state !== "idle" && run.state !== "running" ? (
        <p className={`wb-run-message wb-run-${run.state}`}>{run.message}</p>
      ) : null}
    </div>
  );
}
