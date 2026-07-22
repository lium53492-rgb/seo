"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { TrackedNovelAiHomeLink } from "@/app/components/TrackedNovelAiHomeLink";
import styles from "./story-companion.module.css";

type StoryCompanionProps = {
  sourceSlug: string;
};

export function StoryCompanion({ sourceSlug }: StoryCompanionProps) {
  const cursorRef = useRef<HTMLDivElement>(null);
  const companionRef = useRef<HTMLElement>(null);
  const celebrateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isOpen, setIsOpen] = useState(true);

  useEffect(() => {
    const body = document.body;
    body.classList.add("story-cursor-active");
    let animationFrame = 0;

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerType && event.pointerType !== "mouse") return;
      cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(() => {
        const cursor = cursorRef.current;
        if (!cursor) return;
        cursor.style.setProperty("--cursor-x", `${event.clientX}px`);
        cursor.style.setProperty("--cursor-y", `${event.clientY}px`);
        cursor.dataset.visible = "true";

        const target = event.target instanceof Element ? event.target : null;
        const interactive = target?.closest("a, button, summary");
        cursor.dataset.action = interactive ? "true" : "false";

        const label = interactive?.textContent?.toLowerCase() ?? "";
        const nearStoryDoor = /play|explore|open novelai|enter the scene/.test(label);
        if (companionRef.current?.dataset.mood !== "celebrate") {
          companionRef.current?.setAttribute("data-mood", nearStoryDoor ? "wink" : "calm");
        }
      });
    };

    const handlePointerLeave = () => {
      if (cursorRef.current) cursorRef.current.dataset.visible = "false";
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    document.documentElement.addEventListener("mouseleave", handlePointerLeave);

    return () => {
      cancelAnimationFrame(animationFrame);
      if (celebrateTimerRef.current) clearTimeout(celebrateTimerRef.current);
      window.removeEventListener("pointermove", handlePointerMove);
      document.documentElement.removeEventListener("mouseleave", handlePointerLeave);
      body.classList.remove("story-cursor-active");
    };
  }, []);

  const celebrate = () => {
    if (!companionRef.current) return;
    companionRef.current.dataset.mood = "celebrate";
    if (celebrateTimerRef.current) clearTimeout(celebrateTimerRef.current);
    celebrateTimerRef.current = setTimeout(() => {
      companionRef.current?.setAttribute("data-mood", "calm");
    }, 1800);
  };

  return (
    <>
      <div ref={cursorRef} className={styles.storyCursor} data-visible="false" aria-hidden="true">
        <svg viewBox="0 0 30 34" role="presentation">
          <path d="M12.8 28.8c-2.7-2.2-5.7-5.1-7.9-7.6-.9-1-.7-2.6.4-3.4 1-.7 2.3-.5 3.1.3l2.2 2.1V6.4c0-1.4 1-2.5 2.4-2.5s2.4 1.1 2.4 2.5v8.1-2.8c0-1.4 1-2.5 2.4-2.5s2.4 1.1 2.4 2.5v3-1.9c0-1.4 1-2.5 2.4-2.5s2.4 1.1 2.4 2.5v6.1c0 7-3.7 11.2-9.2 11.2-1.9 0-3.5-.4-5-1.3Z" />
        </svg>
      </div>

      <div className={styles.meteorField} aria-hidden="true"><i /><i /><i /></div>

      {isOpen ? (
        <aside ref={companionRef} className={styles.companion} data-mood="calm" aria-label="Story fox guide">
          <button className={styles.closeButton} type="button" onClick={() => setIsOpen(false)} aria-label="Hide the story fox guide">×</button>
          <div className={styles.foxWindow}>
            <Image
              src="/characters/story-fox-expression-strip-v2.webp"
              alt="An expressive white story fox wearing a midnight-blue scarf"
              width={1536}
              height={512}
              sizes="(max-width: 700px) 234px, 378px"
              priority
            />
            <span className={styles.earSpark} aria-hidden="true">✦</span>
          </div>
          <div className={styles.companionCopy}>
            <span>YOUR STORY GUIDE</span>
            <strong>Ready for your part?</strong>
            <p>Start with the scene. Choose the role that feels like you.</p>
            <TrackedNovelAiHomeLink className={styles.playButton} sourceSlug={sourceSlug} onMouseEnter={celebrate} onClick={celebrate}>
              <span aria-hidden="true">▶</span> Play the story
            </TrackedNovelAiHomeLink>
          </div>
          <div className={styles.emotionSparkles} aria-hidden="true"><i /><i /><i /></div>
        </aside>
      ) : (
        <button className={styles.reopenButton} type="button" onClick={() => setIsOpen(true)} aria-label="Open the story fox guide">
          <span className={styles.reopenFox} aria-hidden="true"><Image src="/characters/story-fox-expression-strip-v2.webp" alt="" width={1536} height={512} sizes="144px" /></span>
          <strong>Play?</strong>
        </button>
      )}
    </>
  );
}
