# ETHOS Core — Deploy Checklist

Follow this in order every time you promote a build to staging or production.
The two recurring failure modes are baked into the steps below:

1. **Cache busting is missed** — a user keeps seeing the old build because one
   of the version touchpoints was not bumped.
2. **The in-app "What Changed Recently" and README changelog fall behind** —
   users can't see what changed, and the About popup shows the wrong version.

---

## 0. Decide the version number (do this first)

The canonical version is the one in `package.json` (`"version"`).

- Look at the current value, e.g. `3.1.63`.
- Bump it for this release (patch for canary/refresh, minor for features).
- **Write the new version down** — you will paste it into 4 other places.

> Rule of thumb: every deploy that changes user-facing files must bump the
> version, because the cache keys are derived from it.

---

## 1. Cache busting — bump ALL of these (must all match `package.json`)

| # | File | What to change | Current (as of last check) |
|---|------|----------------|----------------------------|
| 1 | `package.json` | `"version": "X.Y.Z"` | canonical source |
| 2 | `src/App.tsx` | `const APP_VERSION = 'X.Y.Z';` (line ~78) | **often stale** — verify |
| 3 | `public/sw.js` | `const CACHE_NAME = 'ethos-vX.Y.Z';` (line 1) | **often stale** — verify |
| 4 | `index.html` | `<link rel="manifest" href="manifest.webmanifest?v=X.Y.Z">` (line 20) | **often stale** — verify |

- Vite already gives content-hashed asset filenames (`assets/*.hash.js`), so JS/CSS
  cache busting is automatic — no manual step there.
- The 4 items above are the ones humans forget. **Grep the repo for the old
  version string before deploying** to prove none are left behind.

```bash
# From repo root — replace OLD and NEW with the actual versions
grep -rn "3\.1\.62" src/App.tsx public/sw.js index.html package.json
```

---

## 2. Update the canary file (weekly — part of every regular deploy)

File: `public/trust/canary.txt`

- `Statement date:` → today's date (YYYY-MM-DD)
- `Expected next update:` → today + 7 days (weekly cadence)
- Do **not** weaken the wording — only the two dates change.
- The SHA-256 of this file is recorded in the release receipt, so it must be
  updated *before* `npm run build:release` runs.

> Cadence reminder: if `Expected next update` has passed, the canary is "late"
> and users are told to pause. Treat the weekly bump as mandatory.

---

## 3. Update the in-app "What Changed Recently" (the About popup)

File: `src/App.tsx` → the `ABOUT_CHANGELOG` array (starts ~line 80).

- Add a new entry at the **top** of the array for this version:
  ```js
  {
    version: 'X.Y.Z',
    title: 'Short human title',
    date: 'YYYY-MM-DD',
    changes: [
      'One user-visible sentence about what changed.',
    ],
  },
  ```
- Keep entries focused on reliability / security / storage / usability.
- The newest entry in the array is what users see first in About.

> This is the section Göran calls "what we have done". It must list every
> shipped version, newest first. If a version is missing here, the About popup
> is wrong.

---

## 4. Update the README Changelog

File: `README.md` → `## Changelog` (near the bottom).

- Add a new `### vX.Y.Z – Title (YYYY-MM-DD)` block at the top of the changelog.
- Mirror the user-visible points from the in-app changelog, but you can also
  include a "Release verification" / "Trust model" subsection for trust changes.
- If this deploy bumps the cache version, say so (e.g. "Bumped the app and
  service-worker cache version so browsers fetch the refreshed canary.").

---

## 5. Build & verify locally

```bash
npm install
npm run lint      # TypeScript type check must pass
npm test          # vitest must pass
npm run build     # staging-style build (no receipts)
# or for a production release:
npm run build:release   # builds + writes trust/release-manifest.json + SHA256SUMS
```

- Confirm `dist/trust/SHA256SUMS` and `dist/trust/release-manifest.json` exist
  after a release build.
- Confirm the canary hash in `SHA256SUMS` matches the file you edited:
  ```bash
  shasum -a 256 public/trust/canary.txt
  ```

---

## 6. Deploy

**Staging**
- Merge/push candidate work to the `staging` branch (or run the staging workflow manually).
- Workflow: `.github/workflows/deploy-staging.yml` → deploys to `aitherapp/ethos-staging`.
- Staging uses `npm run build` (no release receipts / attestations).

**Production**
- Tag the reviewed build: `git tag vX.Y.Z && git push origin vX.Y.Z`
  (or run the production workflow manually).
- Workflow: `.github/workflows/deploy.yml` → builds with `build:release`,
  attests the artifact, verifies the attestation, deploys to `aitherapp/ethos`.
- `main` pushes do **not** deploy production.

---

## 7. Post-deploy smoke test

- [ ] Staging (or production) loads at the Pages URL with no console errors.
- [ ] About popup shows the **new** version number and the new changelog entry.
- [ ] `manifest.webmanifest` is fetched fresh (not the old `?v=` cached copy).
- [ ] Canary at `/trust/canary.txt` shows today's statement date.
- [ ] A returning user actually gets the new build (hard refresh / new cache installed).

---

## Quick "did I forget anything?" recap

- [ ] `package.json` version bumped
- [ ] `src/App.tsx` `APP_VERSION` bumped (and shows in About)
- [ ] `public/sw.js` `CACHE_NAME` bumped
- [ ] `index.html` manifest `?v=` bumped
- [ ] `public/trust/canary.txt` dates bumped (weekly)
- [ ] `ABOUT_CHANGELOG` has a new top entry
- [ ] `README.md` Changelog has a new top entry
- [ ] `lint` + `test` + `build` green
- [ ] Release receipt + attestation present (production)
- [ ] Smoke test passed
