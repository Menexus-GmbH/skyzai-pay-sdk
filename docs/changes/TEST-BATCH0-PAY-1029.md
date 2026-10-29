# Change report: TEST-BATCH0-PAY-1029

Repo `/Users/darkness/Work/Aureus/aureus-pay-sdk`, branch `test/batch0-pin-1029`, range `b4b0112..4db91c4`.
8 commits, 0 merges, 16 files, +1103 / -23 lines.

Part 1 is written by the authoring agent. Part 2 is generated from git by `agentmail/bin/change-report` and is the ground truth: if they disagree, Part 2 wins and the disagreement is a review finding.

# Part 1: Narrative (authoring agent)

## What and why

All FIX rows in `pay-p1/TRIAGE.md` are implemented with failing-first evidence and passing regressions: #1, #2, #5, #7, #8, #9 and #10.
This final iteration closes #10 by making the original combined-runner mutation proofs reproducible from repository sources and regenerating cumulative branch facts.
The local stop condition is met; P4 is not started.
The scoped independent re-break remains a prerequisite before merge and is not claimed by this author run.

The tested SDK is HEAD `9ca5aa5d19733df1b1e89b745fda7ddaf5b3d251` plus the final working diff (`sdk_dirty=true`).
The server remains pinned to reviewed PAYSDK-PRECISION-V3-1027 commit `06ced3371528a871849156a70a114e457215b1be` with TypeScript 5.9.3 and jsonwebtoken 9.0.3.
The cumulative range starts at cached `origin/master`, `b4b0112342cf816adb437779eef1201c1da3ce7b`, and includes all seven existing orchestrator commits plus this working diff.
No agent branch commit, push or merge was made.

## Flow (step by step)

1. `npm run test:all` runs SDK/source/tooling units, real SDK/HTTP/handler E2E contracts and server requirements in order, stopping on any nonzero exit.
2. Every suite preloads the SDK HEAD, dirty flag and configured server SHA before execution or admission failure.
Missing Git prints explicit unavailable SDK fields before its installation diagnostic; missing/malformed pin records `server_sha=unavailable`.
3. The source helper disables Git replacements, requires a direct commit object and a `functions/src` tree, then archives only that commit's Functions into ignored `test/.cache/`.
It does not load the donor's working source or move its HEAD.
4. TypeScript/jsonwebtoken package versions must equal the archived lockfile before either module loads.
Missing packages or mismatches fail with installation instructions; successful source receipts include both versions.
5. The adapter runs actual handlers behind loopback HTTP with FakeDb and fake external verification; unexpected imports and outbound fetches are refused.
6. PID-owned archives are removed on normal exit, SIGINT and SIGTERM.
Startup prunes only confirmed dead owners, including SIGKILL leftovers, and preserves concurrent runs and unknown entries.
7. `npm run test:prove-failures` separately runs four mutated disposable SDK copies and one unchanged copy through the actual combined command.
It checks failures, suite stopping order, identities, cleanup and the final passing control, then removes the copies and retains local logs/receipts.

## How it is implemented

`test/server-pin.json` commits the full server revision; `test/helpers/server-source.js` owns admission, Git archiving, dependency checks and archive lifetime for both handler suites.
`git cat-file -t` must report `commit` for the pin and `tree` for `<pin>:functions/src`, using `GIT_NO_REPLACE_OBJECTS=1` throughout admission and archive generation.
Tag/tree/blob pins and missing source layouts fail before allocation.
Dependency metadata is resolved from the same read-only donor Functions root used by the loader, while expected versions come only from the archive.
Both preparation failures and successful process exits clean their unique source directories.
Managed directory names include SHA, PID and a random suffix; startup removes only directories whose PID probe reports `ESRCH`.
Live or inaccessible PIDs, reused PIDs, symlinks, malformed names and ownerless legacy archives are conservatively retained.
`test/helpers/archive-worker.js` gives source and actual SDK/handler lifecycle tests bounded IPC-ready workers and teardown that kills and reaps survivors.

`test/helpers/run-identity.js` supplies success/failure identities to the three original suite commands and the new proof command.
A missing Git executable gets the actionable `Git is required to run Skyzai SDK tests; install Git and ensure git is on PATH.` error after its partial receipt.
Other Git errors retain their original cause.
Package and lockfile engines consistently require Node `>=18.18.0`, matching the preloader's `--import` requirement.
The package no longer advertises Node 18.0-18.17 support; only Node 22 is runtime-qualified here.

`test/runner-failures.test.js` replaces reliance on the ignored, checkout-mutating `prove_failures.py` with an assert-based Node regression suite.
Each case copies the current SDK manifests, source and test entries, excluding `.cache`, into its own ignored disposable directory.
These copies inherit the enclosing checkout's Git identity; the dirty flag describes that checkout rather than claiming an independent fixture commit.
Only copied pins or copied assertions are changed.
The real server donor stays read-only, and any Functions archive remains under the disposable SDK cache.
The child environment clears `NODE_TEST_CONTEXT` so nested Node invocations execute tests instead of silently skipping them.
Each npm process group has a 60-second limit and is killed on timeout; child close events are awaited before cleanup.
The proof asserts the expected suite banners and exit status, SHA receipts, diagnostic and absence of remaining source archives.
The final case requires all three suites to pass, and teardown compares the checkout's pin and both assertion files byte-for-byte with their original contents.
Logs and `receipts.json` are generated under the printed unique `test/.cache/runner-proofs-<random>/` directory.
The proof command is separate from `test:all` to avoid recursion and adds no dependency or CI workflow.

Cumulative Part 2 is generated from `agentmail/bin/change-report`, with full working-tree diff facts and existing branch history.
The tool's working-tree mode suppresses commit history, so generation combines that output with the commit block and commit/merge counts from its normal `origin/master..HEAD` output.
No generated facts are hand-edited and no report-generator source is modified.
The report generator is rerun until the report's own line counts stabilize.

## How it was verified

All commands used Node 22.23.3 through fnm.
The donor `/Users/darkness/Work/Aureus/skyzai_app` remains at `122f16418e862eac2f460e0fd15bdd7658f29f23` with only its pre-existing untracked `.iac-security-fix-0919/`.

```sh
export SKYZAI_APP_ROOT=/Users/darkness/Work/Aureus/skyzai_app
fnm exec --using 22.23.3 npm run test:prove-failures
fnm exec --using 22.23.3 npm run test:all
fnm exec --using 22.23.3 node --check test/runner-failures.test.js
git diff --check
```

The new proof command first failed with a missing-script error, then passed **6/6** after implementation.
Its actual combined-runner receipts are:

| Disposable case | Executed suites | Exit and result |
| --- | --- | --- |
| Missing pin | Unit startup | 1; clear missing-pin diagnostic, unavailable server identity. |
| Wrong pin (40 zeroes) | Units, E2E | 1; 47 units pass, 46 E2E startup failures name the unavailable pin; requirements do not run. |
| Broken E2E assertion | Units, E2E | 1; units 47/47, E2E 62 pass / 1 fail with `P1_DELIBERATE_E2E_FAILURE`; requirements do not run. |
| Broken server JWT-secret assertion | All three | 1; units 47/47, E2E 63/63, requirements 16 pass / 1 fail with `must bind JWT_SECRET`. |
| Restored source | All three | 0; **127/127: 47 unit, 63 E2E, 17 server requirements**, zero failures, cancellations, skips or todos. |

The final combined command also passes **127/127** directly in the working checkout, independently of the copied-source control.
The proof suite's own source-controlled assertions can be rerun without any historical script or logs.
Local iteration-6 evidence is `test/.cache/fix-report-iteration6/{proofs-before,proofs-after,all-after}.log` and `test/.cache/runner-proofs-9rNCOP/{missing-pin,wrong-pin,broken-e2e,broken-server-gate,restored}.log` plus `receipts.json`.
The root package has no build, lint or formatter script; the new JS syntax and diff checks pass.
All validation commands have exited, workers are reaped, and no server archive or disposable SDK/donor directory remains.

### Fix-round failing-first table

| FIX requirement | First failing proof before implementation | Passing proof |
| --- | --- | --- |
| #7: Signal cleanup and dead-owner recovery at the source boundary | The focused source command above exited 1: 0 pass / 3 fail. SIGINT and SIGTERM left their directories; restart retained the SIGKILL archive. | Full source-unit command: 23/23 pass. Both signals remove archives, restart removes a dead owner across pins, live sources and unknown entries survive, and ordinary exits still clean. |
| #7: Signal and restart recovery through actual SDK/HTTP/handlers | The focused actual-handler command above exited 1: 0 pass / 4 fail, including its parent. All three failing subtests created a pending payment before demonstrating the same retained archives. | Same focused actual-handler command: 4/4 pass. The concurrent surviving handler remains usable over loopback HTTP after restart; the full combined run passes 127/127. |
| #9: Declared Node support must include the identity preloader | Focused command before implementation: metadata test fails with actual `>=18.0.0`, expected `>=18.18.0`. | Same test passes and checks both package and lockfile engine entries; docs agree with the new floor. No Node 18 binary was installed or executed. |
| #9: Missing Git must fail every suite clearly with a partial identity | The same focused command reports 6 tests, 1 pass / 5 fail: metadata plus all three suite-startup subtests and their parent. Each startup output contains raw `spawnSync git ENOENT` without a run receipt or installation diagnostic. | Same focused command: 6/6 pass. Each actual suite Node command exits 1 with the clear Git diagnostic and configured server SHA; the full restored combined command passes 120/120. |
| #8: Pinned source must have a Functions source directory | Unit run before implementation: 20 tests, 16 pass / 4 fail (three layout subtests and their parent). Missing Functions produced an archive pathspec error; missing `src` and a file at `src` incorrectly passed preparation. | Same unit command: 20/20 pass; all three malformed layouts receive the SHA-specific source-layout diagnostic before cache allocation. |
| #8: Actual handler startup must diagnose missing layout clearly | Focused startup run before implementation: 3 tests, 0 pass / 3 fail. Missing Functions produced a Git error; missing `src` surfaced a dependency-lockfile error. | Same focused command: 3/3 pass; both real startup subprocesses exit 1 with the required diagnostic and leave no source cache. The restored three-suite run passes 115/115. |
| #5: Pin must be a commit object directly | `node --test test/server-source.test.js`: plain/replaced annotated tags were accepted; tree/blob cases produced the wrong generic diagnostic. | The same four object-type cases pass and report the original tag/tree/blob type, including a tag replaced with a commit. |
| #5: Replacement refs must not alter pinned archive bytes | The unit marker assertion got `replacement source` instead of `pinned source`. The real-handler subprocess failed archive creation because its local replacement removed Functions. | The same unit assertion gets original pinned bytes; the real-handler subprocess starts, records the pinned SHA and creates a pending payment via SDK/HTTP with `PINNED_HANDLER_PAYMENT_OK`. Replacement refs remain unchanged. |
| #1: Both dependency versions must equal the archived lockfile | Unit command: 4 pass / 6 fail because the verifier was absent, including both mismatch cases. Real handler startup with each disposable package version set to `0.0.0` exited 0 and printed `HANDLER_STARTED`, failing the required rejection assertions. | Same unit regressions pass; each drift subprocess now exits 1 with package name, expected/installed version and install instructions before handler startup. |
| #1: Verified dependency versions must be recorded | Actual source descriptor had no `dependencyVersions`; the matching startup control printed no version receipt. | Source descriptor equals archived lockfile versions; matching actual-handler startup exits 0 and prints TypeScript/jsonwebtoken versions in the source identity line. |
| #2: Missing donor dependencies must fail clearly | Real startup subprocess exited 1 with raw `Cannot find module 'typescript'`; the diagnostic assertion failed. The unit absence assertion also failed before the verifier existed. | Same unit and startup assertions pass with `Cannot resolve Functions dependency typescript ... install Functions dependencies matching the pinned lockfile`. |
| #10: Original runner proofs must be reproducible from repository sources | `fnm exec --using 22.23.3 npm run test:prove-failures` exited 1 with `Missing script: "test:prove-failures"`; the only existing reproducer was ignored and mutated the real checkout. | The new command passes 6/6 (five cases plus parent): missing/wrong pin and broken E2E/server-gate copies exit 1 at the expected suite; restored source exits 0 with 127/127. Logs and JSON receipts are regenerated locally; no ignored historical file is required. |

Earlier failing-first logs are retained locally under `test/.cache/fix-dependencies-iteration1/`, `fix-git-iteration2/`, `fix-layout-iteration3/`, `fix-tooling-iteration4/` and `fix-lifecycle-iteration5/`.
Their corresponding regressions are source-controlled and included in the final passing gate.
The earlier combined milestones were 101, 108, 115, 120 and 127 passing tests respectively; these are historical, not extra tests added to the final count.

### Final review triage

| Finding | Disposition |
| --- | --- |
| FIX #1 dependency versions and receipts | Complete: both direct versions match the archived lockfile before loading and appear in the source receipt. |
| FIX #2 absent dependencies | Complete: source and actual-handler startup regressions require actionable installation instructions. |
| FIX #5 replacement refs and object types | Complete: object-type/byte-level units and actual SDK/handler regressions prove unaltered commit bytes and unchanged donor refs. |
| FIX #7 signals and stale archives | Complete: source and actual SDK/HTTP/handler interruption/restart regressions pass; only confirmed dead owners are pruned. |
| FIX #8 absent Functions layout | Complete: directory/type admission and actual-handler startup diagnostics pass. |
| FIX #9 Node floor and absent Git | Complete: manifests agree and all three actual suite startup commands fail clearly with partial identities when Git is absent. |
| FIX #10 report and original mutation proofs | Complete: cumulative facts regenerated and `npm run test:prove-failures` reproduces all four failures plus the restored passing control from repository sources. |
| ACCEPT+DOC #3 dirty tree | Dirty trees remain allowed; HEAD plus dirty flag does not identify every uncommitted byte. |
| ACCEPT+DOC #4 persisted identity | Standard suite identities remain stdout-only; the optional proof command additionally generates its own logs and JSON receipts. No general last-run artifact was added. |
| ACCEPT+DOC #6 archive symlinks | The current pin has no Functions symlinks; future pins require inspection because the loader's string path allowlist does not resolve symlink targets. |

### Historical P1 foundation failing-first table

This table preserves the original two foundation iterations and their historical results.
Iteration 1 used SDK HEAD `b4b0112342cf816adb437779eef1201c1da3ce7b` with its working diff; iteration 2 used `e47b9f2b092d5f9390279912ff781301aa2d05b5` with its working diff.
Both used the same server pin as this fix round, and their final combined result was 90/90.

| Requirement | First failing proof | Passing proof / receipt |
| --- | --- | --- |
| Missing/malformed/non-full pin and absent Git object fail clearly | Iteration 1: `node --test test/server-source.test.js` against the unvalidated implementation: 4 fail, exit 1. | Same guards: 4 pass; included in final 23 passing unit tests. Logs: `test/.cache/p1-iteration1/pin-before.log`, `unit-after.log`; final `test/.cache/p1-iteration2/all-after.log`. |
| Handler source is isolated from moving donor files | Iteration 1: `SKYZAI_APP_ROOT=/Users/darkness/Work/Aureus/skyzai_app node --test --test-name-pattern='merchant HTTP endpoints bind' test/server-requirements.test.js` fails on donor HEAD with `Unfaked external dependency: firebase-functions/params`. | Exact archived createPayment Git blob equals loaded source, root differs from donor, final E2E 63/63 and server requirements 4/4. Iteration-1 logs `e2e-after.log`, `requirements-after.log`; final `all-after.log`. |
| Run identity precedes both successful and failing processes | Before the preloader existed, `node --test test/run-identity.test.js`: 1 fail, exit 1 (`ERR_MODULE_NOT_FOUND`). | Same regression: 1 pass, exit 0; subprocess exit 0/1 and exact identity verified from outside the SDK directory. Logs: `identity-before.log`, `identity-after.log` in `test/.cache/p1-iteration2/`. |
| One command runs all three SDK suites | Before adding the script, `npm run test:all`: exit 1, missing script. | Restored final `npm run test:all`: exit 0, 23 units, 63 E2E and 4 server requirements; zero failed, skipped, cancelled or todo. Logs: `runner-before.log`, `all-after.log`. |
| Missing pin fails the combined runner clearly with identity | Temporarily remove `test/server-pin.json`; `npm run test:all`: exit 1 before test execution, `Missing server pin at .../server-pin.json`, SDK HEAD and dirty state retained, `server_sha=unavailable`. | Restore exact config bytes; final combined command passes. Log: `missing-pin.log`. |
| Wrong pin fails the combined runner clearly with identity | Temporarily set pin SHA to 40 zeroes; `npm run test:all`: units pass, then E2E source admission exits 1 with `Server pin 000... is not available`; the requested SHA is recorded. | Restore exact pin; final combined command passes using the reviewed commit. Log: `wrong-pin.log`. |
| Deliberate real E2E assertion failure reaches the combined exit | In the merchant contract test, temporarily expect `P1_DELIBERATE_E2E_FAILURE` instead of pending status; `npm run test:all`: units 23/23, E2E 62 pass / 1 fail, combined exit 1; server requirements do not run. | Restore exact E2E bytes; final E2E 63/63 through the same command. Log: `broken-e2e.log`. |
| Deliberate server release-gate failure reaches the combined exit | Temporarily require `P1_DELIBERATE_GATE_FAILURE` instead of JWT_SECRET in the actual-handler options assertion; `npm run test:all`: units 23/23, E2E 63/63, gates 3 pass / 1 fail (`/createPayment must bind JWT_SECRET`), combined exit 1. | Restore exact server-gate bytes; final gates 4/4 through the same command. Log: `broken-server-gate.log`. |

Historical iteration-2 paths above refer to ignored `test/.cache/p1-iteration2/` unless otherwise qualified.
The old ignored Python script is retained only as local historical evidence; the new source-controlled Node proof suite is the reproducible replacement.

## Deploy / release impact

No deployment or runtime SDK behavior change is required.
The test foundation adds local commands/config and declares the tooling-compatible Node engine floor.
No installation, donor write, branch commit, push, merge, CI, publication, cloud command, provider call, chain transfer or real payment occurred during this iteration.
Only the two direct borrowed dependency versions are verified; transitive dependency versions and package integrity remain unchecked.
Archive recovery deliberately retains legacy ownerless data or reused/live PIDs without proof of a dead owner.
FakeDb and fake chain verification do not qualify real Firestore isolation, native buyer/callable transport or funded rails.
Node 18 runtime, live services, dashboard/device acceptance and the independent scoped re-break were not checked.

# Part 2: Facts (generated from git)

## Sensitive areas touched

- **Dependencies** (1): `package.json`

## Dependency changes

`package.json`:
```diff
-    "test": "node --test test/sdk.test.js",
-    "test:e2e": "node --test test/payment.e2e.test.js",
-    "test:server-requirements": "node --test test/server-requirements.test.js"
+    "test": "node --import ./test/helpers/run-identity.js --test test/sdk.test.js test/server-source.test.js test/run-identity.test.js",
+    "test:e2e": "node --import ./test/helpers/run-identity.js --test test/payment.e2e.test.js",
+    "test:server-requirements": "node --import ./test/helpers/run-identity.js --test test/server-requirements.test.js",
+    "test:all": "npm test && npm run test:e2e && npm run test:server-requirements",
+    "test:prove-failures": "node --import ./test/helpers/run-identity.js --test test/runner-failures.test.js"
-    "node": ">=18.0.0"
+    "node": ">=18.18.0"
```

## Commits

- `e47b9f2` 2026-10-29 13:37 Ramesh Giri: gnhf 1: Pinned the handler harness to reviewed server source; P1 remains incomplete.
- `cec6782` 2026-10-29 13:42 Ramesh Giri: gnhf 2: P1 is complete locally: all 90 tests pass and the failing-first report is finalized.
- `5b08e84` 2026-10-29 16:03 Ramesh Giri: gnhf 1: Completed FIX #1 and #2 test-first; all 101 tests pass.
- `910f704` 2026-10-29 16:09 Ramesh Giri: gnhf 2: Completed FIX #5 test-first; all 108 local tests pass.
- `30bfd6f` 2026-10-29 16:14 Ramesh Giri: gnhf 3: Completed FIX #8 test-first; all 115 local tests pass.
- `46f3aa2` 2026-10-29 16:21 Ramesh Giri: gnhf 4: Completed FIX #9 test-first; all 120 local tests pass.
- `9ca5aa5` 2026-10-29 16:29 Ramesh Giri: gnhf 5: Completed FIX #7 test-first; all 127 tests pass and this iteration’s report is regenerated.
- `4db91c4` 2026-10-29 16:38 Ramesh Giri: gnhf 6: Completed FIX #10; every FIX row now passes and the cumulative report is regenerated.

## Source files (3)

### `.gitignore` (modified, +3/-1)

### `package-lock.json` (modified, +1/-1)

### `package.json` (modified, +6/-4)

## Test files (10)

### `test/README.md` (added, +64/-0)

### `test/helpers/archive-worker.js` (added, +28/-0)
- Added: `startArchiveWorker()`

### `test/helpers/run-identity.js` (added, +29/-0)
- Added: `git()`
- Changed: `dirty`, `root`, `sdkSha`, `serverSha`

### `test/helpers/server-source.js` (added, +117/-0)
- Added: `cleanSourceOnExit()`, `cleanup()`, `git()`, `prepareServerSource()`, `pruneDeadSources()`, `readServerPin()`, `verifyServerDependencies()`
- Changed: `defaultPinFile`, `sdkRoot`, `sourceDirectories`

### `test/helpers/skyzai-server.js` (modified, +9/-5)
- Changed: `localRequire()`, `startSkyzaiServer()`

### `test/run-identity.test.js` (added, +57/-0)
- Added: `git()`
- Changed: `packageJson`, `test 'every suite clearly diagnoses missing Git before executing tests'`, `test 'package and lockfile require Node 18.18 or newer for identity preloading'`, `test 'run identity precedes success and failure, independently of the invoking directory'`
- Test cases added/edited (3): package and lockfile require Node 18.18 or newer for identity preloading; every suite clearly diagnoses missing Git before executing tests; run identity precedes success and failure, independently of the invoking directory

### `test/runner-failures.test.js` (added, +86/-0)
- Added: `mutate()`, `stop()`
- Changed: `test 'combined runner rejects mutations and passes restored source without changing the checkout'`
- Test cases added/edited (1): combined runner rejects mutations and passes restored source without changing the checkout

### `test/server-pin.json` (added, +5/-0)

### `test/server-requirements.test.js` (modified, +209/-0)
- Added: `git()`
- Changed: `test 'actual SDK/handler runs clean interrupted archives and recover after SIGKILL without pruning live runs'`, `test 'actual handler startup clearly rejects pins without the Functions source layout'`, `test 'handler source matches the committed pin and is isolated from donor working files'`, `test 'handler startup admits locked dependencies and refuses drift or absent installs'`, `test 'real handler startup and SDK payment ignore donor replacement refs'`
- Test cases added/edited (5): handler source matches the committed pin and is isolated from donor working files; handler startup admits locked dependencies and refuses drift or absent installs; real handler startup and SDK payment ignore donor replacement refs; actual handler startup clearly rejects pins without the Functions source layout; actual SDK/handler runs clean interrupted archives and recover after SIGKILL without pruning live runs

### `test/server-source.test.js` (added, +214/-0)
- Added: `dependencyFixture()`, `fixture()`, `git()`, `gitFixture()`, `sourceWorker()`
- Changed: `test 'a missing server pin names the required config'`, `test 'a pin absent from the local Git object store fails before loading handlers'`, `test 'a pin must name a commit object directly, without peeling tags or accepting trees/blobs'`, `test 'a pinned commit must contain a Functions source directory before archive allocation'`, `test 'each donor dependency must match the archived lockfile, not donor metadata'`, `test 'invalid JSON has a clear server-pin diagnostic'`, `test 'matching donor dependencies report the archived lockfile versions'`, `test 'missing donor dependencies give an install diagnostic'`, `test 'replacement refs cannot change the bytes archived for a commit pin'`, `test 'restart prunes SIGKILL archives while preserving live concurrent sources and unrelated cache entries'`, `test 'server pin requires a full commit SHA, never a branch or abbreviated revision'`, `test 'source archives are removed on ${signal}'`, `test 'the archived lockfile must contain an exact version for every borrowed dependency'`, `versions`
- Test cases added/edited (13): a missing server pin names the required config; invalid JSON has a clear server-pin diagnostic; server pin requires a full commit SHA, never a branch or abbreviated revision; a pin absent from the local Git object store fails before loading handlers; source archives are removed on ${signal}; restart prunes SIGKILL archives while preserving live concurrent sources and unrelated cache entries; a pinned commit must contain a Functions source directory before archive allocation; a pin must name a commit object directly, without peeling tags or accepting trees/blobs; replacement refs cannot change the bytes archived for a commit pin; matching donor dependencies report the archived lockfile versions; each donor dependency must match the archived lockfile, not donor metadata; missing donor dependencies give an install diagnostic; the archived lockfile must contain an exact version for every borrowed dependency

## Docs and context files (3)

### `README.md` (modified, +15/-6)
- Changed: `skyzai`

### `RELEASE.md` (modified, +8/-6)

### `docs/changes/TEST-BATCH0-PAY-1029.md` (added, +252/-0)
