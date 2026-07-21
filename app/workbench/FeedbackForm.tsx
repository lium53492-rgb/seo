"use client";

import { useState } from "react";

export function FeedbackForm() {
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
      setDetail(`已写入 ${body.path}，下一次生产会读取。`);
    } catch (error) {
      setStatus("error");
      setDetail(error instanceof Error ? error.message : "反馈保存失败");
    }
  }

  return (
    <form className="wb-feedback-form" onSubmit={submit}>
      <label htmlFor="workbench-feedback">把今天的建议同步到下一轮生产</label>
      <textarea
        id="workbench-feedback"
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        minLength={4}
        maxLength={2000}
        placeholder="例如：下一篇优先覆盖角色选择的入门问题，并避免泛泛的 AI 介绍。"
        required
      />
      <div>
        <button className="wb-primary-button" type="submit" disabled={status === "saving"}>
          {status === "saving" ? "正在保存…" : "保存反馈"}
        </button>
        {detail ? <p className={`wb-run-message ${status === "error" ? "wb-run-error" : ""}`}>{detail}</p> : null}
      </div>
    </form>
  );
}
