"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function RunPipelineButton({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "refreshing" | "error">("idle");
  const [message, setMessage] = useState("");

  function refreshReport() {
    setStatus("refreshing");
    setMessage("");
    try {
      router.refresh();
      setStatus("idle");
      setMessage("已重新读取当前日报数据。");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "日报刷新失败");
    }
  }

  return (
    <div className="wb-run-control">
      <button
        className="wb-primary-button"
        type="button"
        disabled={!enabled || status === "refreshing"}
        onClick={refreshReport}
      >
        {!enabled
          ? "工作台为只读"
          : status === "refreshing"
            ? "正在读取日报…"
            : "重新读取日报数据"}
      </button>
      {!enabled ? <p className="wb-readonly-note">配置工作台密码后可刷新受保护数据。</p> : null}
      {message ? <p className={`wb-run-message ${status === "error" ? "wb-run-error" : ""}`}>{message}</p> : null}
    </div>
  );
}
