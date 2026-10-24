# 003: Convert a song from a YouTube/TikTok link through a GitHub issue

Written: 2026-10-24. Status: Approved 2026-10-24
Related: plan 001 (the pipeline), plan 002 (the player)

## Goal

Anyone can turn a YouTube or TikTok link into sheets from the live site, with no login of ours:

1. On https://phucbm.github.io/piano-sheet/ they paste a link and press Submit.
2. The browser opens GitHub's "New issue" page with the **New song** template, the link filled in.
   They press Create (needs a GitHub account; that is the only gate for now).
3. A GitHub Action downloads the audio, makes two versions (original + easy in C), checks them,
   and opens a PR that saves everything to the repo.
4. The owner reviews and merges. Pages redeploys from `main` and the song is live about a minute later.

Every step posts to the owner's Discord channel.

Not in scope: anonymous submit without a GitHub account (a Cloudflare Worker holding the token,
later), auth, accounts, queue/limits beyond what GitHub gives.

## Rules

- **Names come from the file.** The song name is the issue's "Song name" field if filled (turned
  into a slug), else the video id (`hgvtsDhx22I`). Never a name guessed from the video title.
- **The Discord webhook URL is a secret.** The repo is public: it lives only in the repo secret
  `DISCORD_WEBHOOK`, never in a file, log, commit or plan. Ask the user for the value when
  setting it (`gh secret set DISCORD_WEBHOOK -R phucbm/piano-sheet`, value from stdin).
- **The link is untrusted input.** Read it from the issue body in a step that puts it in an env
  var (never `${{ }}` inside `run:`), allow only `youtube.com`, `youtu.be`, `tiktok.com`,
  `vm.tiktok.com` over https, strip query tracking (`?si=`), pass it to scripts as an argument.
- **Save everything** (owner's call): the PR commits the sheets, the MIDI and the audio. Audio as
  `.m4a` (AAC ~96 kbps), not `.wav`, to keep the repo small.
- The site stays static on GitHub Pages from `main`, no build step. `pnpm dev` still works.
- Every new sheet passes `scripts/check_highlight.py` before the PR is opened.

## Discord messages

| When | Workflow | Message |
| --- | --- | --- |
| Issue with `new-song` label opened | `convert.yml` | 🎵 New song request #N: <link> (by @user) |
| PR opened | `convert.yml` | 🎼 Sheets ready for #N → PR #M (key, BPM, note counts) |
| Any step failed | `convert.yml` | ❌ #N failed at <step> → run link |
| `song/*` PR merged | `song-merged.yml` | ✅ Added <name> → live link `?song=<name>` |

Post with `curl -H 'Content-Type: application/json' -d @payload.json "$DISCORD_WEBHOOK"`
(payload built with `jq` so the link and names are escaped).

## Steps

### 1. Test: can a GitHub runner download from YouTube and TikTok?

YouTube often answers datacenter IPs with "Sign in to confirm you're not a bot". Check before
building anything.

- Branch `test/yt-dlp`, workflow `.github/workflows/ytdlp-test.yml` (`workflow_dispatch` with a
  `url` input) on `ubuntu-latest`: install `yt-dlp` (latest, pip) + ffmpeg, run
  `yt-dlp -x --audio-format m4a -o 'test.%(ext)s' "$URL"`, upload the file as an artifact.
- First link: **https://youtu.be/hgvtsDhx22I** (the user's test song). Then any one TikTok piano link.
- If YouTube is blocked: stop and report to the user. Options to put to them: TikTok only for
  now; a cookies file as a secret (risk: that Google account gets flagged); a proxy (paid);
  `yt-dlp` with `--extractor-args "youtube:player_client=..."` variants.
- Delete the test branch and workflow once done.

### 2. Pipeline: `scripts/add.sh <url> [name]`

- Download: `yt-dlp -x --audio-format m4a -o "input/<name>.%(ext)s" <url>`.
- `scripts/run.sh` takes the `.m4a` as it is (ffmpeg already reads any input).
- New `--to-c` option in `scripts/to_sheet.py`: use the key it already finds (line ~73) to pick the
  transpose that lands in C major / A minor (the smallest move, −6..+5), so the easy version
  needs no hand-picked number. Check: `vien-da-nho` with `--easy --to-c` matches the current
  `vien-da-nho-easy-in-C.musicxml` (it was made with `--transpose -6`).
- Runs: original, then `--easy --to-c` as `<name>-easy-in-C`.
- `check_highlight.py` on both; exit non-zero if either fails.
- Save `output/<name>.m4a` (player audio), the `.musicxml` and `.mid` files; keep `.raw.mid`
  as today; don't commit the `.wav` (add `output/*.wav` for new songs to `.gitignore`, keep the
  existing `vien-da-nho.wav` until the player reads `.m4a`).
- Append both versions to `songs.json`.
- Print a summary (key, BPM, note counts) the workflow puts in the PR body.

### 3. Song list in `songs.json`

- Move `SONGS` from `index.html` to `songs.json`:
  `[{ "name": "vien-da-nho", "audio": "vien-da-nho.wav", "source": "" }, …]`, with `audio`
  the full file name and `source` the original link (shown in the player as "Original").
- `index.html` fetches it on load. `?song=` keeps working.
- Two song PRs both add lines at the end of the array → `add.sh` keeps the array sorted by name
  so conflicts are rare; if one happens, the second PR is rebased by re-running the workflow.

### 4. Issue template `.github/ISSUE_TEMPLATE/new-song.yml`

- Issue form, title `New song: `, label `new-song` (create the label with `gh label create`).
- Fields: **Link** (input, required, "YouTube or TikTok link to a piano recording"),
  **Song name** (input, optional, "lowercase-with-dashes, leave empty to use the video id"),
  **Notes** (textarea, optional).
- `.github/ISSUE_TEMPLATE/config.yml` keeps blank issues allowed for normal bug reports.

### 5. Workflow `.github/workflows/convert.yml`

- `on: issues: types: [opened, reopened]`, `if: contains(github.event.issue.labels.*.name, 'new-song')`.
  Also `workflow_dispatch` with an issue number, to re-run by hand.
- `permissions: contents: write, pull-requests: write, issues: write`.
- `concurrency: song-${{ github.event.issue.number }}`.
- Steps: Discord "new request" → parse + validate link and name (env vars, see Rules) → set up
  uv + Python 3.11, ffmpeg, latest yt-dlp → cache `models/piano_crnn.pth` (`actions/cache`, key
  on the file URL; download from zenodo on miss) and the uv cache → `scripts/add.sh` → commit to
  branch `song/<name>` → `gh pr create` with the summary, the link and `Closes #N` → comment the
  PR link on the issue → Discord "sheets ready".
- If the branch or the song name already exists: comment on the issue and stop (no overwrite).
- On failure (`if: failure()`): comment the failed step and run link on the issue, Discord "failed".
- Expect a few minutes per song on CPU; set `timeout-minutes: 30`.

### 6. Workflow `.github/workflows/song-merged.yml`

- `on: pull_request: types: [closed]`, `if: merged && startsWith(head.ref, 'song/')`.
- Discord "added" with `https://phucbm.github.io/piano-sheet/?song=<name>`. The issue closes
  through `Closes #N`.

### 7. Submit box on the site

- `index.html`: a glass input + "Make sheets" button (plan 002's glass style). Checks the link is
  YouTube/TikTok, then opens
  `https://github.com/phucbm/piano-sheet/issues/new?template=new-song.yml&title=New+song:+<host>&link=<url>`
  (issue-form fields prefill from query params by their `id`).
- A short line under it: "Opens a GitHub issue; the sheets appear here after review."

### 8. Repo setup (with the user's go)

- Settings → Actions → General → "Allow GitHub Actions to create and approve pull requests"
  (the user turns it on, or `gh api -X PUT repos/phucbm/piano-sheet/actions/permissions/workflow
  -f default_workflow_permissions=read -F can_approve_pull_request_reviews=true`).
- `gh secret set DISCORD_WEBHOOK` with the value the user gives in the session.
- `gh label create new-song`.

### 9. End-to-end check

- Open a real issue from the site with **https://youtu.be/hgvtsDhx22I** → Discord gets
  "new request", then a PR appears with two versions, the PR passes review on a local
  `pnpm dev` (both sheets render and highlight), merge → Discord "added", live link plays.
- Update README: a "Add a song" section (the site form, or `scripts/add.sh <url>` locally).

## Open

- If YouTube blocks the runner (step 1), the user picks the way around before steps 2–9.
- Anonymous submit without a GitHub account (Cloudflare Worker + rate limit) is a later plan.
