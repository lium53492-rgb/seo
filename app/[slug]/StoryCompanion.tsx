"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { TrackedNovelAiHomeLink } from "@/app/components/TrackedNovelAiHomeLink";
import styles from "./story-companion.module.css";

type StoryCompanionProps = {
  sourceSlug: string;
};

type FoxMood = "calm" | "wink" | "celebrate";

const guideMessages = [
  "Psst—there is a story door below.",
  "Which world would you enter first?",
  "Pick a point of view. I will go first.",
  "That is your cue. Ready to play?",
];

export function StoryCompanion({ sourceSlug }: StoryCompanionProps) {
  const cursorRef = useRef<HTMLDivElement>(null);
  const companionRef = useRef<HTMLElement>(null);
  const bubbleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const celebrationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cueHoverRef = useRef(false);
  const celebratingRef = useRef(false);
  const [isOpen, setIsOpen] = useState(true);
  const [mood, setMood] = useState<FoxMood>("calm");
  const [messageIndex, setMessageIndex] = useState(0);
  const [bubbleVisible, setBubbleVisible] = useState(true);

  const showGuideBubble = useCallback((duration = 5200) => {
    setBubbleVisible(true);
    if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current);
    bubbleTimerRef.current = setTimeout(() => setBubbleVisible(false), duration);
  }, []);

  const celebrate = useCallback(() => {
    celebratingRef.current = true;
    setMood("celebrate");
    setMessageIndex(3);
    showGuideBubble(6200);
    if (celebrationTimerRef.current) clearTimeout(celebrationTimerRef.current);
    celebrationTimerRef.current = setTimeout(() => {
      celebratingRef.current = false;
      setMood("calm");
    }, 1800);
  }, [showGuideBubble]);

  useEffect(() => {
    const body = document.body;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    body.classList.add("story-cursor-active");
    let animationFrame = 0;

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerType && event.pointerType !== "mouse") return;
      cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(() => {
        const cursor = cursorRef.current;
        const companion = companionRef.current;
        if (!cursor) return;

        cursor.style.setProperty("--cursor-x", `${event.clientX}px`);
        cursor.style.setProperty("--cursor-y", `${event.clientY}px`);
        cursor.dataset.visible = "true";

        const target = event.target instanceof Element ? event.target : null;
        const interactive = target?.closest("a, button, summary");
        cursor.dataset.action = interactive ? "true" : "false";

        const label = interactive?.textContent?.toLowerCase() ?? "";
        cueHoverRef.current = /play|explore|open novelai|enter the scene/.test(label);
        if (cueHoverRef.current && !celebratingRef.current) setMood("wink");

        if (companion && !reducedMotion.matches) {
          const lookX = Math.max(-9, Math.min(9, (event.clientX / window.innerWidth - .5) * 18));
          const lookY = Math.max(-6, Math.min(6, (event.clientY / window.innerHeight - .5) * 12));
          companion.style.setProperty("--pet-look-x", `${lookX}px`);
          companion.style.setProperty("--pet-look-y", `${lookY}px`);
          companion.style.setProperty("--pet-tilt", `${lookX * .24}deg`);
        }
      });
    };

    const handlePointerLeave = () => {
      if (cursorRef.current) cursorRef.current.dataset.visible = "false";
      cueHoverRef.current = false;
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    document.documentElement.addEventListener("mouseleave", handlePointerLeave);

    if (reducedMotion.matches) {
      return () => {
        cancelAnimationFrame(animationFrame);
        if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current);
        if (celebrationTimerRef.current) clearTimeout(celebrationTimerRef.current);
        window.removeEventListener("pointermove", handlePointerMove);
        document.documentElement.removeEventListener("mouseleave", handlePointerLeave);
        body.classList.remove("story-cursor-active");
      };
    }

    const moodSequence: FoxMood[] = ["calm", "wink", "calm", "celebrate", "calm"];
    let moodStep = 0;
    const moodInterval = window.setInterval(() => {
      if (cueHoverRef.current) return;
      moodStep = (moodStep + 1) % moodSequence.length;
      setMood(moodSequence[moodStep]);
    }, 4200);

    const messageInterval = window.setInterval(() => {
      setMessageIndex((current) => (current + 1) % guideMessages.length);
      showGuideBubble();
    }, 7800);

    return () => {
      cancelAnimationFrame(animationFrame);
      window.clearInterval(moodInterval);
      window.clearInterval(messageInterval);
      if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current);
      if (celebrationTimerRef.current) clearTimeout(celebrationTimerRef.current);
      window.removeEventListener("pointermove", handlePointerMove);
      document.documentElement.removeEventListener("mouseleave", handlePointerLeave);
      body.classList.remove("story-cursor-active");
    };
  }, [showGuideBubble]);

  return (
    <>
      <div ref={cursorRef} className={styles.storyCursor} data-visible="false" aria-hidden="true">
        <svg viewBox="0 0 30 34" role="presentation">
          <path d="M12.8 28.8c-2.7-2.2-5.7-5.1-7.9-7.6-.9-1-.7-2.6.4-3.4 1-.7 2.3-.5 3.1.3l2.2 2.1V6.4c0-1.4 1-2.5 2.4-2.5s2.4 1.1 2.4 2.5v8.1-2.8c0-1.4 1-2.5 2.4-2.5s2.4 1.1 2.4 2.5v3-1.9c0-1.4 1-2.5 2.4-2.5s2.4 1.1 2.4 2.5v6.1c0 7-3.7 11.2-9.2 11.2-1.9 0-3.5-.4-5-1.3Z" />
        </svg>
      </div>
      <div className={styles.meteorField} aria-hidden="true"><i /><i /><i /><i /></div>

      {isOpen ? (
        <aside
          ref={companionRef}
          className={styles.petStage}
          data-mood={mood}
          data-bubble={bubbleVisible ? "visible" : "hidden"}
          aria-label="Animated white story fox guide"
        >
          <div className={styles.speechBubble} role="status" aria-live="polite">
            <span>Your story guide</span>
            <strong>{guideMessages[messageIndex]}</strong>
            <TrackedNovelAiHomeLink
              className={styles.playButton}
              sourceSlug={sourceSlug}
              onMouseEnter={celebrate}
              onFocus={celebrate}
              onClick={celebrate}
            >
              Play the story <span aria-hidden="true">→</span>
            </TrackedNovelAiHomeLink>
          </div>

          <button
            className={styles.closeButton}
            type="button"
            onClick={() => setIsOpen(false)}
            aria-label="Hide the story fox guide"
          >
            ×
          </button>

          <button
            className={styles.foxButton}
            type="button"
            onClick={() => {
              setMessageIndex((current) => (current + 1) % guideMessages.length);
              setMood((current) => current === "celebrate" ? "wink" : "celebrate");
              showGuideBubble();
            }}
            aria-label="Ask the story fox for another cue"
          >
            <span className={styles.groundShadow} aria-hidden="true" />
            <span className={styles.foxWindow} aria-hidden="true">
              <Image
                src="/characters/story-fox-expression-strip-v3.webp"
                alt=""
                width={1536}
                height={512}
                sizes="(max-width: 700px) 300px, 510px"
                priority
              />
            </span>
            <span className={styles.attentionMark} aria-hidden="true">!</span>
            <span className={styles.petSparkles} aria-hidden="true"><i /><i /><i /></span>
          </button>
        </aside>
      ) : (
        <button
          className={styles.reopenButton}
          type="button"
          onClick={() => {
            setIsOpen(true);
            showGuideBubble();
          }}
          aria-label="Bring back the animated story fox"
        >
          <span aria-hidden="true"><Image src="/characters/story-fox-expression-strip-v3.webp" alt="" width={1536} height={512} sizes="174px" /></span>
          <strong>Play?</strong>
        </button>
      )}
    </>
  );
}
