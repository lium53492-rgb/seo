import Image from "next/image";
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
  return (
    <section className={styles.gallery} aria-labelledby="story-door-heading">
      <div className={styles.copy}>
        <p className={styles.eyebrow}>The story door · original scene studies</p>
        <h2 id="story-door-heading">Three moods.<br />One invitation to play.</h2>
        <p className={styles.lede}>
          A role feels different when the world around it changes. Watch the scenes
          rotate, pick the one that pulls you closer, then imagine your first line.
        </p>
        <div className={styles.moodRail} aria-label="Scene moods in the loop">
          {storyScenes.map((scene) => <span key={scene.number}><i />{scene.mood}</span>)}
        </div>
        <small>Original concept art · the scene loop pauses when you hover</small>
      </div>

      <div className={styles.stage} aria-label="A looping stack of three original story scenes">
        <div className={styles.orbit} aria-hidden="true"><i /><i /><i /></div>
        {storyScenes.map((scene, index) => (
          <figure className={styles.scene} data-scene={index + 1} key={scene.number}>
            <Image
              src={scene.src}
              alt={scene.alt}
              fill
              sizes="(max-width: 760px) 74vw, (max-width: 1100px) 46vw, 420px"
            />
            <figcaption>
              <span>{scene.number} / 03</span>
              <div><strong>{scene.mood}</strong><small>{scene.cue}</small></div>
            </figcaption>
          </figure>
        ))}
        <div className={styles.playCue} aria-hidden="true"><span>PLAY</span><i /></div>
      </div>
    </section>
  );
}
