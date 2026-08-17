"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import styles from "./story-motion-gallery.module.css";

const storyScenes = [
  {
    src: "/story-scenes/moonlit-archive.webp",
    alt: "Original concept art of a moonlit archive with a glowing story door",
    number: "01",
    mood: "Mystery",
    cue: "Follow the clue",
  },
  {
    src: "/story-scenes/choice-deck.webp",
    alt: "Original concept art of a space observation deck with two empty role seats",
    number: "02",
    mood: "Discovery",
    cue: "Choose a route",
  },
  {
    src: "/story-scenes/rain-cafe.webp",
    alt: "Original concept art of a rainy cafe with two chairs and a sealed letter",
    number: "03",
    mood: "Reunion",
    cue: "Open the letter",
  },
];

export function StoryMotionGallery() {
  const [activeIndex, setActiveIndex] = useState(0);
  const activeScene = storyScenes[activeIndex];

  useEffect(() => {
    for (const scene of storyScenes.slice(1)) {
      const image = new window.Image();
      image.src = scene.src;
    }
  }, []);

  return (
    <section className={styles.gallery} aria-labelledby="story-door-heading">
      <div className={styles.copy}>
        <p className={styles.eyebrow}>The story door · original scene studies</p>
        <h2 id="story-door-heading">Three moods.<br />One invitation to play.</h2>
        <p className={styles.lede}>
          A role feels different when the world around it changes. Pick the scene
          that pulls you closer, then imagine your first line.
        </p>
        <div className={styles.moodRail} aria-label="Choose an original story scene">
          {storyScenes.map((scene, index) => (
            <button
              aria-pressed={activeIndex === index}
              key={scene.number}
              onClick={() => setActiveIndex(index)}
              type="button"
            >
              <i />{scene.mood}
            </button>
          ))}
        </div>
        <small>Original concept art · choose a mood to turn the scene card</small>
      </div>

      <div className={styles.stage} aria-label="A stack showing the selected original story scene">
        <div className={styles.orbit} aria-hidden="true"><i /><i /><i /></div>
        <figure className={styles.scene} key={activeScene.number}>
          <Image
            src={activeScene.src}
            alt={activeScene.alt}
            fill
            sizes="(max-width: 760px) 74vw, (max-width: 1100px) 46vw, 420px"
          />
          <figcaption aria-live="polite">
            <span>{activeScene.number} / 03</span>
            <div><strong>{activeScene.mood}</strong><small>{activeScene.cue}</small></div>
          </figcaption>
        </figure>
        <div className={styles.playCue} aria-hidden="true"><span>PLAY</span><i /></div>
      </div>
    </section>
  );
}
