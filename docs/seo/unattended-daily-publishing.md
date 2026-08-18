# Unattended daily publishing contract

## Outcome

The primary automation owns one decision for each Asia/Shanghai calendar day:
publish at most one new, reviewed English SEO page when every release gate is
ready, recognize that the page for that day is already complete, or record a
no-publication outcome with its reason. It must not require a user to identify
the next step after a timeout, network interruption, or partial run.

This contract does not relax product truth, originality, IP, review, build, or
one-page-per-day safeguards. From the configured enforcement date, a
`create_page` release requires a same-day schema-v2 collection from the official
US Google Trends BigQuery public dataset with a verified service-account
attestation. A successful collection without an exact normalized candidate row
in `top_rising_terms` is `not_observed`; that state is valid evidence, does not
mean zero searches, and does not itself block publication. A failed, missing,
or tampered provider result is `unavailable` or invalid and still blocks the
page. The release also requires a complete
all-page measurement portfolio with observed Search Console and landing UV
states plus a ready attribution join. Missing evidence blocks publication
without being converted to zero. A confirmed orphan
callback, unsupported claim, third-party IP, duplicate intent, failed review,
failed verification, unrelated user work, or irreconcilable Git conflict also
stops publication rather than shipping unsafe content.

The BigQuery result persisted with research is compact collection schema 2:
per-table row counts and canonical result digests, exact candidate matches,
and a bounded deterministic D&D discovery list, not the full DMA result. The
collector signs its canonical snapshot digest with RSA-SHA256 using the
server-only BigQuery service-account private key. The report builder, daily
coordination entrypoint, and the publisher before and inside its guarded reread
load the same environment and verify the configured client email plus derived
public-key fingerprint. An unavailable `--research` attempt exits 2 without
writing Trends fields, so a transient outage can be retried that day.

The Playworlds callback receiver contract exists, but production currently
lacks its configured secret and a recent signed product-side handshake. The
direct Steam CTA also cannot yield a purchase joined to an individual
`seo_click_id`; exact click-level revenue attribution requires a first-party
Playworlds handoff/backend. Until those conditions are met, attribution remains
explicitly unavailable and cannot be inferred from Steam aggregate reporting.

## Idempotent state machine

First run `npm.cmd run daily:coord -- settle YYYY-MM-DD`. It scans every stored
Shanghai date, not only yesterday, and resolves the sole outstanding
complete `local_publication_complete` checkpoint, `release_preparing`,
`release_in_flight`, or an orphaned recovery pin before the current day can own
a page slot. An unresolved complete checkpoint, pin, preparation, or marker
never expires or falls out of the scan. More than one unresolved release
is a hard conflict. A prior page first verified on the current date occupies
the current production day, so the current run exits instead of creating a
second live addition. Then run `npm.cmd run daily:coord -- acquire YYYY-MM-DD`. The lease lives in
Git's common directory, which is shared by the isolated automation worktrees.
The coordinator binds ownership to the worktree and the Codex task's
`CODEX_THREAD_ID`; non-Codex manual runs must provide a stable
`SEO_DAILY_RUN_ID` for the whole run.
An active lease prevents concurrent production. The same owner can retry a
failed settlement immediately; a different recovery worktree may take over
only after the configured heartbeat timeout. The old worktree must then fail
`daily:coord -- assert` before it can push. After acquiring, run
`npm.cmd run daily:coord -- restore YYYY-MM-DD`, then run
`npm.cmd run daily:state -- YYYY-MM-DD` before work and after each durable
stage. The state command classifies consistent same-day artifacts and returns
the next stage:

1. `growth_check` / `research` for a fresh day;
2. `build` when research already exists;
3. `review` when the builder report exists;
4. `publish` when an approved review exists;
5. `pdf` after the page is locally published;
6. `release_verification` after the complete local delivery exists.

A valid same-day `no_publish` receipt is also terminal. `settle` returns
`outcome=no_publish`, and `daily:state` returns `no_publish_complete` with
`resumeAt=null` and `mayCreatePage=false`. Evening recovery exits on that
outcome instead of restarting research or substituting a weaker candidate.
Unattended jobs must never reopen that receipt. An explicit same-day
user-guided resume may reopen it once through the coordinator; the new lease is
locked to the requesting owner, preserves the prior terminal state in history,
and does not bypass the one-page limit, cutoff, review, measurement, quality,
or release gates.

```text
npm.cmd run daily:coord -- guided-resume YYYY-MM-DD FEEDBACK_ID CONFIRM_USER_GUIDED_RESUME
```

This action is reserved for an explicit same-day user instruction bound to an
adopted feedback record. Scheduled prompts and recovery tasks must not invoke
it.

Consistent artifacts from the same daily chain are resumable. An inconsistent
chain or more than one page for the Shanghai day is a conflict and must not be
overwritten. Once a page is published for the day, all resumed runs switch to
verification and delivery; they never create another page.

After growth, Trends enrichment, research, report, review, publication, and PDF stages, run
`npm.cmd run daily:coord -- save YYYY-MM-DD`. Checkpoints are immutable,
digest-bound snapshots of only the daily artifact allowlist. Restore refuses
to overwrite a different file. This makes the recovery worktree able to continue
the 09:15 worktree's last completed stage instead of silently starting a second
chain. A complete checkpoint is release-eligible only when its immutable
`savedAt` is before the same Shanghai day's 23:45 cutoff; a checkpoint written
after cutoff is rejected and cannot bypass the release-start window.

The lease carries a unique fencing token and generation. Run
`npm.cmd run daily:coord -- heartbeat YYYY-MM-DD` at least every configured
heartbeat interval and before and after any long research batch. Save, restore,
assert, and completion use a short coordination mutex and recheck the fencing
generation, so an old worktree cannot overwrite a recovery owner's lease.
Lease transitions are immutable files under `lease-states/`; heartbeat,
checkpoint, reservation, takeover, and completion append a complete new state
instead of replacing `lease.json`. This avoids Windows/OneDrive overwrite races
and makes a crash before the final hard link harmless.

When a hard gate means that zero pages is the correct result, complete the
owned lease before the cutoff with:

```text
npm.cmd run daily:coord -- no-publish YYYY-MM-DD REASON_CODE "Specific observed reason"
```

`REASON_CODE` must be one of the configured active no-publish codes. The
coordinator, not the caller, derives the evidence summary and SHA-256 bindings
from the same-day growth snapshot, completed 8–12-candidate research artifact,
and report, plus a review artifact when one exists. Growth, research, and
report are all mandatory before a new terminal no-publication receipt can be
written. The immutable receipt contains no slug, release
revision, or live-verification claim. While it is the active terminal state it
cannot coexist with a page published that Shanghai day, and it cannot replace a
reservation, complete release checkpoint, pin, preparation, or in-flight
release. A valid user-guided resume retains the receipt only in immutable
history while creating a new owner-locked active state. Otherwise it closes
only that calendar day's content decision; unlike a deployed page, it never
occupies a later production day.

## Candidate continuity

Research 8-12 semantically distinct searcher jobs. Keyword spelling and a
model-supplied `new_intent` label do not establish distinctness: the builder
derives intent fingerprints, compares the batch with the current page corpus,
and rejects near-duplicate jobs. After scoring and all hard gates, the working
set must still contain the daily target plus at least seven eligible
`create_page` intents; persist that ordered fallback list in the report. If the
leading candidate fails a later gate, record the reason and evaluate the next
eligible candidate. If the batch cannot provide that continuity, research a
new independent batch instead of waiting for user direction. Re-evaluate all
reused seeds against current pages, approved facts, feedback, and fresh directly
supporting evidence before publication.

The 8–12-candidate batch and its report are a daily scheduled deliverable, not
a side effect of successful publication. Measurement, Trends-provider,
callback, or other release blockers change the publication outcome but do not
authorize an early stop before those two artifacts are complete.

Do not use unavailable Search Console, URL Inspection, UV, or attribution data
as zero. For unattended `create_page` production, any unavailable exact-page
Search Console or landing UV state, incomplete portfolio coverage, or unready
attribution join is a publication block. Retry within the configured network
budget, then record no publication instead of switching candidates to fill the
daily slot.

## Retry and recovery

Retry transient network reads, feedback synchronization, Git fetch, and status
queries up to the configured attempt count. Never retry a semantic hard-gate
failure unchanged: move to the next candidate or correct the invalid artifact.
After a process timeout, restart with `daily:state` and resume from the first
incomplete durable stage.

If `origin/main` advances before local artifacts exist, fast-forward and
restart preflight. If it advances after local artifacts exist, rebase only when
Git can do so without conflict, then rerun every gate. Never force-push or
resolve unrelated changes automatically.

Once a release marker exists, settlement follows four Git cases. If the remote
tip equals the marker, verification continues. If the remote tip is an ancestor
of the marker because the process crashed before push, the coordinator checks
the pinned commit, repository identity, every daily blob, and the complete
base-to-release changed-path list. A new marker requires `origin/main` to be a
strict parent of the release revision, and that revision must be exactly one
non-merge commit containing only its six dated
growth/research/report/review/page/PDF artifacts. A revision already on
`origin/main` cannot be signed after the fact. Approved source or
architecture work must reach `origin/main` as a separate verified commit before
the six-artifact daily release is marked. The coordinator then pushes the explicit
`MARKER_SHA:refs/heads/main` refspec as an ordinary fast-forward. If the remote
tip is a descendant, the append-only marker may be superseded only when every
growth, research, report, review, page, and PDF blob is identical, the entire
`data/pages` tree is identical, and the release still contains exactly one
canonical page for its Shanghai date. Every individual non-merge descendant
commit is inspected with rename detection disabled; endpoint-only net diffs are
not sufficient. Descendant changes are limited to
`docs/**`, `tests/**`, and root `README*` or `AGENTS*` files; runtime, content,
configuration, workflow, and route changes are a hard stop. A divergent tip or
any changed daily/page blob is also a hard stop. Settlement rechecks the
authoritative advertised remote tip after live verification; it never uses a
force refspec.

One pre-push sibling case is recoverable rather than divergent: another process
may advance `origin/main` after the daily candidate was pinned but before its
ordinary fast-forward. The coordinator may rebuild the unpushed candidate on
that new base only when the new tip descends from the recorded base, every
intervening non-merge commit passes the same docs/tests-only per-commit check,
the base and resulting page-tree IDs are unchanged, and all six daily blob IDs
remain identical. It constructs the replacement with a temporary Git index,
CAS-moves the recovery pin, appends an explicit sibling-rebase marker, and runs
the full exact-SHA detached verification before attempting the replacement
push. A concurrent pin update loses the CAS and retries from durable state.

## Review and publication

The independent `codex_editor` review must contain all eight required checks:
search intent, product truth, conversion path, source accuracy, content
distinctness, presentation distinctness, signature module, and rendered
preview. Workbench readiness, publisher acceptance, page-store acceptance, and
rendered HTML must use the same contract.

The primary run generates the daily PDF after the page is published. The
secondary automation runs at 18:30 and makes a final recovery pass at 21:30: it
verifies an existing page and PDF, exits on a durable no-publish receipt, or
resumes the incomplete daily chain and creates the day's sole page only when
all publication gates remain ready. The shared lease and daily state gate
prevent a second page. Immediately before fetching/pushing and again before
production verification, the active worktree must run
`npm.cmd run daily:coord -- assert YYYY-MM-DD`.
The publisher itself holds the shared publication guard while it re-reads all
pages and the reviewed report, recomputes the Shanghai-day count, and writes the
page/report pair. Two publishers therefore cannot both act on an earlier zero-
page snapshot. New publication and release start are rejected at or after
23:45 Asia/Shanghai, leaving a buffer before midnight. After the local commit
and before push, run
`daily:coord -- release-start YYYY-MM-DD FULL_GIT_SHA SLUG`. This immutable
release preparation records the authoritative remote base, the exact Git blob IDs for all
six daily artifacts, the base-to-release allowlist, the complete page-tree ID,
and the single-page proof. The coordinator first renews the lease and verifies
the pre-cutoff publishing window, saves the complete six-file checkpoint, then pins the revision under
`refs/codex/daily-releases/YYYY-MM-DD`, appends a durable `releasePreparing`
state, and finally promotes the preparation to the immutable `releaseInFlight`
marker. The historical scan also recognizes a complete checkpoint left before
the pin; recovery restores it, requires an otherwise exact six-path worktree,
creates or reuses the single strict daily commit, and pins it. Feedback inbox
files named by the checkpoint's validated `feedbackConsumptions` records may
remain dirty after restoration, but are never included in that commit; no other
dirty path is allowed. Before any push, the coordinator checks out the exact
target SHA in a temporary detached worktree and runs the full
`npm.cmd run verify` contract there. This remains true when `origin/main`
advanced and checkpoint materialization created a new commit without moving the
recovery worktree's HEAD. Normal `release-start` performs the same exact-SHA
verification before it can pin a revision; a checkpoint alone is never treated
as a test receipt.
An orphaned pin is likewise part of the scan, so every boundary can be recovered
on a later day; the pin also prevents Git garbage collection from discarding the commit. The pin,
preparation, or marker allows that
deployment to settle on any later date while preventing the next day from
starting a second page. Coordination and publisher child
processes run under a ten-minute supervisor; a hung child is terminated so its
dead operation lock can be fenced by recovery.

## Release proof

Every Vercel production build exposes its official `VERCEL_GIT_COMMIT_SHA` as
`git-revision` metadata and
`data-release-revision` on the root HTML element. After pushing, wait for the
exact commit to reach Vercel READY when the LoreLens project is visible to the
current Vercel account, then run:

```text
npm.cmd run release:verify -- https://lorelens.playworlds.ai FULL_GIT_SHA SLUG
```

The release is complete only when LoreLens serves that exact revision and the
live page contains its H1, self-canonical, attributed CTA, Article and FAQ JSON-
LD, robots declaration, and sitemap entry. A local `published` status, Git push,
or a different Vercel project's READY state is not sufficient. If the LoreLens
project is hidden from the current Vercel account, the exact full SHA served by
LoreLens is the authoritative deployment proof; never substitute READY from a
different project. After the live contract passes, run
`npm.cmd run daily:coord -- complete YYYY-MM-DD FULL_GIT_SHA SLUG`. Completion
renews the lease, fetches `origin/main` into an explicit tracking destination,
cross-checks the advertised remote ref, confirms both fetch and push URLs name
the approved `lium53492-rgb/seo` repository, and proves the selected full revision is
the exact remote-main tip, and proves every daily artifact and the page corpus
match the persisted marker. It then runs two complete LoreLens verification
passes and validates their structured receipt. It repeats the remote-main,
artifact, and corpus checks after the live verifier, including two consecutive
authoritative fetch-and-advertisement checks that must both equal the selected
revision, before writing the permanent completion receipt. The confirmation
path never pushes or restores a rolled-back revision. A feature-branch
deployment can never close the day as complete.

## Runtime requirement

Codex automations are local scheduled jobs. The computer and Codex application
must be running and able to reach GitHub, Vercel, and public research sources
around the scheduled window. Published pages remain online when the computer is
offline, but a new page cannot be generated while the local automation host is
offline.
