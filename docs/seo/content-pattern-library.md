# Content Pattern Library

Updated: 2026-08-06

This library records reusable answer mechanics, not reusable pages. It may
help research and briefing, but it never selects a layout, palette, mascot, or
set of headings. New production work is governed by
`data/config/content-architecture.json`,
`data/config/presentation-recipes.json`, and
`docs/seo/content-architecture.md`.

## Four decisions that must stay separate

1. `pagePattern` names the broad search experience: task guide, experience
   explainer, decision page, original inventory, or narrative essay.
2. `painPointId` names the obstacle being removed. A cooldown prevents the
   same obstacle from becoming the default topic on consecutive pages.
3. The content architecture chooses an archetype, opening move, section jobs,
   section formats, FAQ jobs, and a signature module. These choices determine
   how the answer works.
4. A registered presentation recipe chooses the visual world and renderer.
   It must be compatible with the answer, pass its own cooldown, and contain
   page-specific interface copy.

No item determines another automatically. In particular, `decision_page`
does not mean dark UI, `task_guide` does not mean numbered cards, and
`original_inventory` does not authorize invented product inventory.

## Pain point and answer matrix

| Pain point ID | Reader obstacle | Useful answer shapes | Shapes to avoid by default |
| --- | --- | --- | --- |
| `blank_start` | The reader cannot make the first move | procedure, worked example | generic inspiration list |
| `choice_uncertainty` | Two or more routes appear interchangeable | comparison, diagnostic | universal ranking |
| `context_gap` | The reader lacks the information needed to act | reference, diagnostic | broad beginner recap |
| `stalled_exchange` | A scene or response has stopped creating a next beat | worked example, diagnostic | another setup guide |
| `format_confusion` | The reader does not understand what the format does | reference, argument | feature-card summary |
| `discovery_need` | The reader wants a useful set to browse | reference, original inventory | fabricated catalog |
| `quality_repair` | The reader has an attempt but cannot improve it | diagnostic, worked example | start-from-zero tutorial |
| `product_fit_uncertainty` | The reader cannot tell whether the experience fits | comparison, argument | unsupported product claims |

The ID is a stable production control, not a substitute for the specific
`primaryPainPoint`, `readerStateBefore`, `readerOutcome`, or `searcherJob`.

## Content layer rules

Every section maps one-to-one to an architecture entry with:

- one reader question;
- one unique takeaway;
- a section role that is not merely its visual label; and
- a semantic format.

`steps`, `checklist`, `examples`, and `comparison` sections require at least
two Markdown blocks. The renderer turns steps into an ordered list and
checklists/examples into unordered semantic lists; a single prose paragraph
cannot masquerade as a structured module. Each page also needs at least three
distinct section roles and two distinct FAQ jobs.

The signature module is part of the answer. Its ID is single-page, its type
has a cooldown, and its placement is bound to a real section ID. Runtime
semantics vary by type: comparison/diagnostic/myth-fact modules use definition
groups, inventory/checklist modules use lists, and timeline/worked-example/
scenario modules use ordered sequences.

## Reusable answer mechanics

### Task completion

- Give the direct answer before background.
- Show the smallest successful action.
- Include a failure diagnosis and a targeted repair.
- End with a next step that follows from the completed task.

Good for a specific first move or repair job. It is not permission to repeat
the same four headings, three steps, or FAQ wording.

### Decision support

- Define the decision and the evidence that changes it.
- Compare tradeoffs without declaring an unsupported universal winner.
- Include boundary cases.
- Produce a decision rule the reader can apply.

Good for route or fit uncertainty. A different keyword spelling is not a new
decision.

### Worked example

- Use original, non-infringing material.
- Annotate why each move works.
- Contrast it with a failure mode.
- Transfer the lesson to a second situation without repeating the example.

Good when the contribution is application rather than summary.

### Reference or inventory

- Define the inclusion rule before listing items.
- Give each item a distinct reader use.
- Make the set browseable and crawlable.
- Do not imply product availability or an owned catalog without evidence.

Good only when there is a genuine set to expose.

### Sustained argument

- State a falsifiable thesis.
- Build evidence-led chapters rather than steps.
- Include a real counterpoint and evidence boundary.
- Close by explaining what the argument enables the reader to decide.

Use `narrative_essay` only when the question needs a reading-led hierarchy.

## Product and evidence boundary

- Use only approved product fact IDs.
- Keep public-web demand proxies separate from observed Search Console data.
- Never copy third-party examples, wording, interface identity, characters,
  fictional worlds, prices, or unsupported capabilities.
- A source can support search demand or an answer pattern without proving a
  product claim.
- Related links must be explicit, contextual, and crawlable. The renderer
  does not manufacture a generic related-page block.

## Rotation and novelty gates

The builder and publisher compare the draft with the complete published
corpus. They independently gate title, meta description, H1, hero, section
headings, section bodies, FAQ questions, FAQ answers, surface copy, long
sentences, five-word shingles, structure fingerprints, pain point, opening
move, archetype, signature ID/type, recipe, visual system, layout, and
palette. The draft also has to explain concrete intent, answer, structure,
FAQ, and visual differences from the nearest published pages.

A palette change cannot clear a content gate. A wording change cannot clear a
structure or presentation cooldown. Missing policy thresholds fail closed.

## Optional decoration

Decoration is never inherited from a page family. Every schema-3 recipe
declares `companion` and `gallery` explicitly. The current gallery contract is
`none` until a content-driven gallery schema exists. The story companion is
allowed only by an explicit recipe; one legacy route retains it through an
explicit slug policy so legacy pages do not all receive the same pet.

## Candidate jobs are hypotheses

Possible research directions include first-response repair, choosing a role
from motive/knowledge/conflict position, comparing prompt creation with
supplied story context, or explaining the story-role-performance loop. The
daily process must reject any direction that lacks current evidence, repeats
an owned intent, violates the cold-start release gate, or cannot produce a
concrete original contribution.
