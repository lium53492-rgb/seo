import { TrackedNovelAiHomeLink } from "@/app/components/TrackedNovelAiHomeLink";

type StageStarterSelectorProps = {
  sourceSlug: string;
};

export function StageStarterSelector({ sourceSlug }: StageStarterSelectorProps) {
  return (
    <section className="stageStarter" id="starter-selector" aria-labelledby="starter-selector-heading">
      <div className="stageStarter__intro">
        <p>ACT 0 / PICK A CUE</p>
        <h2 id="starter-selector-heading">Choose the kind of first move you want.</h2>
        <p>
          This is not a test of creativity. Pick the responsibility you want for this session, then take the smallest useful next step.
        </p>
      </div>

      <form className="stageStarter__form" aria-label="Starting path selector">
        <fieldset>
          <legend>What sounds better right now?</legend>
          <input className="stageStarter__input" id="starter-prompt" name="starting-path" type="radio" value="prompt" />
          <label className="stageStarter__option" htmlFor="starter-prompt">
            <span className="stageStarter__optionNumber">01</span>
            <strong>I want to decide what the scene is.</strong>
            <small>I have a setting, relationship, mood, or conflict that I want to shape myself.</small>
          </label>

          <input className="stageStarter__input" id="starter-story" name="starting-path" type="radio" value="story" />
          <label className="stageStarter__option" htmlFor="starter-story">
            <span className="stageStarter__optionNumber">02</span>
            <strong>I want a scene that already gives me something to answer.</strong>
            <small>I would rather choose a perspective and react than build the opening conditions.</small>
          </label>

          <div className="stageStarter__result" aria-live="polite">
            <p className="stageStarter__empty">Choose a cue above. The stage will show your first move.</p>

            <article className="stageStarter__promptResult">
              <p>YOUR FIRST MOVE / PROMPT-FIRST</p>
              <h3>Write four things, then stop.</h3>
              <ol>
                <li>Name an original place.</li>
                <li>Choose the role you want to play.</li>
                <li>Add one pressure to the moment.</li>
                <li>End with one unanswered question.</li>
              </ol>
              <a href="#route-stop-2">Read the prompt-first route <span aria-hidden="true">→</span></a>
            </article>

            <article className="stageStarter__storyResult">
              <p>YOUR FIRST MOVE / STORY-FIRST</p>
              <h3>Let the opening give you a line to play.</h3>
              <ol>
                <li>Read the situation already in motion.</li>
                <li>Choose an available character role.</li>
                <li>Answer one immediate detail as that role.</li>
              </ol>
              <div className="stageStarter__resultActions">
                <a href="#route-stop-3">Read the story-first route <span aria-hidden="true">→</span></a>
                <TrackedNovelAiHomeLink sourceSlug={sourceSlug} location="inline">
                  Open a story <span aria-hidden="true">↗</span>
                </TrackedNovelAiHomeLink>
              </div>
            </article>
          </div>
        </fieldset>
      </form>
    </section>
  );
}
