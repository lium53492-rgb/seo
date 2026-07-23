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
    let currentLookX = 0;
    let currentLookY = 0;
    let targetLookX = 0;
    let targetLookY = 0;
    let moodInterval = 0;
    let messageInterval = 0;

    const renderPointer = () => {
      animationFrame = 0;
      const companion = companionRef.current;
      const companionEase = reducedMotion.matches ? 1 : 0.18;

      currentLookX += (targetLookX - currentLookX) * companionEase;
      currentLookY += (targetLookY - currentLookY) * companionEase;

      if (companion && !reducedMotion.matches) {
        companion.style.setProperty("--pet-look-x", `${currentLookX.toFixed(2)}px`);
        companion.style.setProperty("--pet-look-y", `${currentLookY.toFixed(2)}px`);
        companion.style.setProperty("--pet-tilt", `${(currentLookX * 0.24).toFixed(2)}deg`);
      }

      const companionSettled = Math.abs(targetLookX - currentLookX) < 0.08 && Math.abs(targetLookY - currentLookY) < 0.08;
      if (!companionSettled) {
        animationFrame = requestAnimationFrame(renderPointer);
      }
    };

    const requestPointerRender = () => {
      if (!animationFrame) animationFrame = requestAnimationFrame(renderPointer);
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerType && event.pointerType !== "mouse") return;
      targetLookX = Math.max(-9, Math.min(9, (event.clientX / window.innerWidth - 0.5) * 18));
      targetLookY = Math.max(-6, Math.min(6, (event.clientY / window.innerHeight - 0.5) * 12));
      requestPointerRender();
    };

    const updateCueMood = (eventTarget: EventTarget | null) => {
      const target = eventTarget instanceof Element ? eventTarget : null;
      const interactive = target?.closest("a, button, summary");
      const label = interactive?.textContent?.toLowerCase() ?? "";
      const isCue = /play|explore|open novelai|enter the scene/.test(label);
      if (isCue !== cueHoverRef.current) {
        cueHoverRef.current = isCue;
        if (!celebratingRef.current) setMood(isCue ? "wink" : "calm");
      }
    };

    const handlePointerOver = (event: PointerEvent) => updateCueMood(event.target);
    const handleFocusIn = (event: FocusEvent) => updateCueMood(event.target);

    const handlePointerLeave = () => {
      targetLookX = 0;
      targetLookY = 0;
      cueHoverRef.current = false;
      if (!celebratingRef.current) setMood("calm");
      requestPointerRender();
    };

    if (!reducedMotion.matches) {
      window.addEventListener("pointermove", handlePointerMove, { passive: true });
      document.addEventListener("pointerover", handlePointerOver, { passive: true });
      document.addEventListener("focusin", handleFocusIn);
      document.documentElement.addEventListener("mouseleave", handlePointerLeave);

      const moodSequence: FoxMood[] = ["calm", "wink", "calm", "celebrate", "calm"];
      let moodStep = 0;
      moodInterval = window.setInterval(() => {
        if (cueHoverRef.current) return;
        moodStep = (moodStep + 1) % moodSequence.length;
        setMood(moodSequence[moodStep]);
      }, 4200);

      messageInterval = window.setInterval(() => {
        setMessageIndex((current) => (current + 1) % guideMessages.length);
        showGuideBubble();
      }, 7800);
    }

    return () => {
      cancelAnimationFrame(animationFrame);
      if (moodInterval) window.clearInterval(moodInterval);
      if (messageInterval) window.clearInterval(messageInterval);
      if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current);
      if (celebrationTimerRef.current) clearTimeout(celebrationTimerRef.current);
      window.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerover", handlePointerOver);
      document.removeEventListener("focusin", handleFocusIn);
      document.documentElement.removeEventListener("mouseleave", handlePointerLeave);
      body.classList.remove("story-cursor-active");
    };
  }, [showGuideBubble]);

  return (
    <>
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
              location="companion"
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
