"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  WorkbenchFeedbackQueueEntry,
  WorkbenchFeedbackQueueSummary,
} from "@/lib/seo/types";
import styles from "./FeedbackQueue.module.css";

type QueueResponse = {
  ok?: boolean;
  error?: string;
  queue?: WorkbenchFeedbackQueueSummary;
};

type QueueState = "loading" | "ready" | "unavailable" | "error";

function formatShanghaiTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function isQueueSummary(value: unknown): value is WorkbenchFeedbackQueueSummary {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const queue = value as Partial<WorkbenchFeedbackQueueSummary>;
  return (
    typeof queue.pendingCount === "number" &&
    Array.isArray(queue.entries) &&
    (queue.destination === "local" || queue.destination === "github")
  );
}

export function FeedbackQueue({ enabled }: { enabled: boolean }) {
  const [state, setState] = useState<QueueState>(
    enabled ? "loading" : "unavailable",
  );
  const [queue, setQueue] = useState<WorkbenchFeedbackQueueSummary | null>(null);
  const [detail, setDetail] = useState(
    enabled
      ? ""
      : "UNAVAILABLE：反馈队列未启用受保护的生产读取配置。",
  );

  const loadQueue = useCallback(async (signal?: AbortSignal) => {
    if (!enabled) {
      setState("unavailable");
      setDetail("UNAVAILABLE：反馈队列未启用受保护的生产读取配置。");
      return;
    }
    setState("loading");
    setDetail("");
    try {
      const response = await fetch("/api/workbench/feedback", {
        cache: "no-store",
        headers: { accept: "application/json" },
        signal,
      });
      const rawBody = await response.text();
      let body: QueueResponse = {};
      if (rawBody) {
        try {
          body = JSON.parse(rawBody) as QueueResponse;
        } catch {
          throw new Error("反馈队列返回了无法识别的结果。");
        }
      }
      if (!response.ok || !body.ok) {
        setQueue(null);
        setState("unavailable");
        setDetail(
          `UNAVAILABLE：${body.error || `反馈队列读取失败（HTTP ${response.status}）。`}`,
        );
        return;
      }
      if (!isQueueSummary(body.queue)) {
        throw new Error("反馈队列响应缺少有效的 pendingCount 或 entries。");
      }
      setQueue(body.queue);
      setState("ready");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setQueue(null);
      setState("error");
      setDetail(
        `ERROR：${error instanceof Error ? error.message : "反馈队列读取失败。"}`,
      );
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    void loadQueue(controller.signal);
    return () => controller.abort();
  }, [enabled, loadQueue]);

  if (!enabled) {
    return (
      <div className={styles.statePanel} role="status">
        <strong>UNAVAILABLE</strong>
        <span>反馈队列未启用受保护的生产读取配置。</span>
      </div>
    );
  }

  return (
    <section className={styles.queue} aria-label="未消费的内容指导队列">
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>PENDING INPUTS</span>
          <strong className={styles.count}>
            {state === "ready" ? queue?.pendingCount ?? 0 : "—"}
          </strong>
          <span className={styles.countLabel}>条待处理反馈</span>
        </div>
        <button
          className={styles.refresh}
          type="button"
          onClick={() => void loadQueue()}
          disabled={state === "loading"}
        >
          {state === "loading" ? "正在读取…" : "刷新队列"}
        </button>
      </header>

      {state === "loading" ? (
        <div className={styles.statePanel} role="status">
          <strong>LOADING</strong>
          <span>正在读取受保护的反馈队列。</span>
        </div>
      ) : null}

      {state === "unavailable" || state === "error" ? (
        <div
          className={`${styles.statePanel} ${state === "error" ? styles.error : ""}`}
          role={state === "error" ? "alert" : "status"}
        >
          <strong>{state.toUpperCase()}</strong>
          <span>{detail.replace(/^(?:UNAVAILABLE|ERROR)：/, "")}</span>
        </div>
      ) : null}

      {state === "ready" && queue?.entries.length === 0 ? (
        <div className={styles.statePanel} role="status">
          <strong>QUEUE CLEAR</strong>
          <span>当前没有未消费的内容指导。</span>
        </div>
      ) : null}

      {state === "ready" && queue?.entries.length ? (
        <ol className={styles.entries}>
          {queue.entries.map((entry: WorkbenchFeedbackQueueEntry) => (
            <li key={entry.id}>
              <article className={styles.entry}>
                <div className={styles.entryMeta}>
                  <time dateTime={entry.createdAt}>
                    {entry.date} · {formatShanghaiTime(entry.createdAt)}
                  </time>
                  <span>待处理</span>
                </div>
                <p className={styles.message}>{entry.message}</p>
                <code>{entry.id}</code>
              </article>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
