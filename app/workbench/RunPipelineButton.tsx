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
      const rawBody = await response.text();
      let body: { ok?: boolean; error?: string; generatedAt?: string } = {};
      if (rawBody) {
        try {
          body = JSON.parse(rawBody) as typeof body;
        } catch {
          throw new Error("刷新服务返回了无法识别的结果，请稍后重试。");
        }
      }
      if (!response.ok || !body.ok) {
        throw new Error(
          body.error ||
            (rawBody
              ? `暂时无法读取已验证日报（HTTP ${response.status}）。`
              : "刷新服务暂时没有返回内容，请稍后重试。"),
        );
      }
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
        {!enabled ? "工作台为只读" : status === "refreshing" ? "正在读取日报…" : "重新读取日报数据"}
      </button>
      {!enabled ? <p className="wb-readonly-note">配置工作台密码后可刷新受保护数据。</p> : null}
      {message ? <p className={`wb-run-message ${status === "error" ? "wb-run-error" : ""}`}>{message}</p> : null}
    </div>
  );
}
