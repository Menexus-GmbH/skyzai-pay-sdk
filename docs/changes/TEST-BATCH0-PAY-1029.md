# Change report: TEST-BATCH0-PAY-1029

Repo `/Users/darkness/Work/Aureus/aureus-pay-sdk`, branch `test/batch0-pin-1029`, range `b4b0112..working tree`.
0 commits, 0 merges, 10 files, +176 / -13 lines.

Part 1 is written by the authoring agent. Part 2 is generated from git by `agentmail/bin/change-report` and is the ground truth: if they disagree, Part 2 wins and the disagreement is a review finding.

# Part 1: Narrative (authoring agent)

## What and why

P1 is partially complete: both handler suites now load an explicit, reviewed Functions commit instead of arbitrary donor working files.
The source pin is `06ced3371528a871849156a70a114e457215b1be` (PAYSDK-PRECISION-V3-1027, reviewed PASS r4).
This iteration implements source admission, archive isolation and local regressions only.
P1 remains open for a single all-suite runner, identities on every run including failures, deliberate broken-E2E/server-gate propagation proofs, and final report receipts.
P4 has not started.

## Flow (step by step)

1. Either handler suite calls `startSkyzaiServer`, which prepares one source tree per test process.
2. `readServerPin` requires valid JSON with a full lowercase commit SHA in `test/server-pin.json`.
3. `prepareServerSource` verifies that commit exists in the local repository supplied by `SKYZAI_APP_ROOT`.
4. Git archives the commit's `functions/` into a unique ignored `test/.cache/server-<sha>-*/` directory.
5. The existing adapter transpiles archived source and loads only TypeScript/jsonwebtoken dependencies from the donor checkout.
6. Tests exercise real SDK HTTP requests against those handlers with fake storage and chain evidence; exit cleanup removes the archive.

## How it is implemented

`test/helpers/server-source.js` owns pin diagnostics, local Git object validation, archive creation, identity output and cleanup.
`test/helpers/skyzai-server.js` retains its existing fake-boundary allowlist and loopback transport, but its source root now comes from the archive.
The donor repository is read-only, can have a different HEAD, and is never fetched, checked out or given a new worktree.
`npm test` includes the four new source-admission unit tests without requiring the server repository.
A new server requirement compares the loaded createPayment file with its exact pinned Git blob and requires an isolated source root.
No SDK API, dependency, payment behavior or CI workflow is added.
The pin intentionally selects the reviewed precision baseline rather than newer development changes; it does not qualify server HEAD or deployment.
The local dependency inputs are TypeScript 5.9.3 and jsonwebtoken 9.0.3, matching the pinned lockfile entries, but full transitive dependency-lock enforcement is outside this iteration.

## How it was verified

All commands ran locally on Node 22.23.3 through fnm.
SDK HEAD was `b4b0112342cf816adb437779eef1201c1da3ce7b` plus this uncommitted working diff.
The donor checkout HEAD was `122f16418e862eac2f460e0fd15bdd7658f29f23`; it was not modified.
The two handler-suite logs record SDK HEAD and server pin explicitly.

| Requirement | First failing proof | Passing proof / receipt |
| --- | --- | --- |
| Missing/malformed/non-full pin and absent Git object fail clearly | `node --test test/server-source.test.js` against the initial unvalidated source-preparation implementation: 4 fail, exit 1 | Same command after guards: 4 pass; included in `npm test`, 22 pass. Logs: `test/.cache/p1-iteration1/pin-before.log`, `unit-after.log`. |
| Handler source is independent of moving donor files | Before the fix, `SKYZAI_APP_ROOT=/Users/darkness/Work/Aureus/skyzai_app node --test --test-name-pattern='merchant HTTP endpoints bind' test/server-requirements.test.js`: exit 1, `Unfaked external dependency: firebase-functions/params` from donor HEAD | Archived pinned handlers: `npm run test:e2e`, 63 pass; `npm run test:server-requirements`, 4 pass including source/blob comparison. Logs: `e2e-after.log`, `requirements-after.log` in the same cache receipt directory. |
| A missing pin stops the actual handler test process | Temporarily remove `test/server-pin.json`; run `node --test --test-name-pattern='handler source matches' test/server-requirements.test.js`: exit 1, `Missing server pin at .../server-pin.json` | Pin restored byte-for-byte; full handler suites pass with the committed pin. Deliberate-failure receipt: `missing-pin.log`. |
| A wrong pin stops the actual handler test process | Temporarily replace SHA with 40 zeroes; same handler command: exit 1, `Server pin 000... is not available` | Pin restored byte-for-byte; full handler suites pass with the committed pin. Deliberate-failure receipt: `wrong-pin.log`. |
| One runner discovers all three suites and propagates deliberate E2E/server-gate failures | Pending next iteration | Pending next iteration |

Before implementation the original SDK suite passed 18/18.
After implementation the three suites pass 22 units, 63 E2E and 4 server requirements, with no skips or todos.
`git diff --check` passes.
The root package has no build, lint or formatter script.
No source archive remained after the test processes exited, and all loopback servers were stopped by test teardown.
Raw receipts are local ignored evidence; the passing counts and exact requirements are retained here for subsequent iterations.
Independent review/break and any final committed-range regeneration remain prerequisites for merge; neither was performed in this local author iteration.
No CI, browser, dashboard build, emulator, cloud, provider, real payment or native-device qualification was run.

## Deploy / release impact

None: test source preparation and documentation only.
No server write, package install, commit, push, merge, publication, deployment or real payment occurred.
The existing historical release statements retain their original source boundaries; current local release instructions now explain the pin.

# Part 2: Facts (generated from git)

## Sensitive areas touched

- **Dependencies** (1): `package.json`

## Dependency changes

`package.json`:
```diff
-    "test": "node --test test/sdk.test.js",
+    "test": "node --test test/sdk.test.js test/server-source.test.js",
```

## Commits


## Source files (2)

### `.gitignore` (modified, +3/-1)

### `package.json` (modified, +1/-1)

## Test files (6)

### `test/README.md` (added, +38/-0)

### `test/helpers/server-source.js` (added, +50/-0)
- Added: `cleanup()`, `git()`, `prepareServerSource()`, `readServerPin()`

### `test/helpers/skyzai-server.js` (modified, +9/-5)
- Changed: `localRequire()`, `startSkyzaiServer()`

### `test/server-pin.json` (added, +5/-0)

### `test/server-requirements.test.js` (modified, +13/-0)
- Changed: `test 'handler source matches the committed pin and is isolated from donor working files'`
- Test cases added/edited (1): handler source matches the committed pin and is isolated from donor working files

### `test/server-source.test.js` (added, +43/-0)
- Added: `fixture()`

## Docs and context files (2)

### `README.md` (modified, +10/-4)
- Changed: `skyzai`

### `RELEASE.md` (modified, +4/-2)
