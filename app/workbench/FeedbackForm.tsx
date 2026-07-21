"use client";

import { useState } from "react";

export function FeedbackForm({ enabled }: { enabled: boolean }) {
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [detail, setDetail] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("saving");
    setDetail("");
    try {
      const response = await fetch("/api/workbench/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const body = (await response.json()) as { error?: string; path?: string };
      if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
      setMessage("");
      setStatus("saved");
      setDetail(`内容指导已写入 ${body.path}，下一次生产会读取并记录采用结果。`);
    } catch (error) {
      setStatus("error");
      setDetail(error instanceof Error ? error.message : "反馈保存失败");
    }
  }

  if (!enabled) {
    return (
      <div className="wb-readonly-note" role="status">
        内容指导需要受保护的生产配置（WORKBENCH_PASSWORD 和 GITHUB_REPORTS_TOKEN）才可写入下一次生产；当前不会假装保存成功。
      </div>
    );
  }

  return (
    <form className="wb-feedback-form" onSubmit={submit}>
      <label htmlFor="workbench-feedback">给下一次生产的内容指导</label>
      <textarea
        id="workbench-feedback"
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        minLength={4}
        maxLength={2000}
        placeholder="例如：下一篇优先覆盖角色选择的入门问题；侧重新手进入剧情的障碍，避免泛泛的 AI 介绍。"
        required
      />
      <div>
        <button className="wb-primary-button" type="submit" disabled={status === "saving"}>
          {status === "saving" ? "正在保存…" : "同步到下一次生产"}
        </button>
        {detail ? <p className={`wb-run-message ${status === "error" ? "wb-run-error" : ""}`}>{detail}</p> : null}
      </div>
    </form>
  );
}
