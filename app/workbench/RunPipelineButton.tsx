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
      const response = await fetch("/api/workbench/run", { method: "POST" });
      const body = (await response.json()) as { error?: string; generatedAt?: string };
      if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
      setStatus("idle");
      setMessage(`已读取最新验证日报（${body.generatedAt || "当前版本"}）。`);
      router.refresh();
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "日报刷新失败");
    }
  }

  return (
    <div className="wb-run-control">
      <button className="wb-primary-button" type="button" disabled={!enabled || status === "refreshing"} onClick={refreshReport}>
        {!enabled ? "工作台为只读" : status === "refreshing" ? "正在读取日报…" : "刷新已验证数据"}
      </button>
      {!enabled ? <p className="wb-readonly-note">配置工作台密码后可刷新受保护数据。</p> : null}
      {message ? <p className={`wb-run-message ${status === "error" ? "wb-run-error" : ""}`}>{message}</p> : null}
    </div>
  );
}
