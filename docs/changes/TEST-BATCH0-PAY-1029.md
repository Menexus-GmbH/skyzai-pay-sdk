# Change report: TEST-BATCH0-PAY-1029

Repo `/Users/darkness/Work/Aureus/aureus-pay-sdk`, branch `test/batch0-pin-1029`, range `e47b9f2..working tree`.
0 commits, 0 merges, 7 files, +150 / -82 lines.

Part 1 is written by the authoring agent. Part 2 is generated from git by `agentmail/bin/change-report` and is the ground truth: if they disagree, Part 2 wins and the disagreement is a review finding.

# Part 1: Narrative (authoring agent)

## What and why

P1 is complete locally: `npm run test:all` now runs all three SDK suites, every npm test command records SDK HEAD, working-tree dirty state and server SHA before success or failure, and deliberate missing/wrong pin and E2E/server-gate failures propagate to the combined command.
The server source remains pinned to `06ced3371528a871849156a70a114e457215b1be` (PAYSDK-PRECISION-V3-1027, reviewed PASS r4).
The pin/archive foundation was committed by the iteration orchestrator as `e47b9f2b092d5f9390279912ff781301aa2d05b5` after iteration 1; Part 2 describes only this iteration's working diff on top of that commit.
The failing-first table below retains evidence from both iterations.
No agent commit, push or merge was made.
P4 was not started because the requested P1 stop condition is met.

## Flow (step by step)

1. `npm run test:all` invokes `npm test`, `npm run test:e2e`, then `npm run test:server-requirements`, stopping at the first nonzero exit.
2. Each npm suite uses Node's `--import ./test/helpers/run-identity.js` before running tests.
3. That preloader prints `[skyzai test run] sdk_sha=<HEAD> sdk_dirty=<true|false> server_sha=<configured SHA>` from the SDK repository, independently of the invoking directory.
4. A missing or malformed pin prints `server_sha=unavailable` and then throws the existing clear pin diagnostic; an unavailable commit records the requested SHA before source admission fails.
5. Either handler suite calls `startSkyzaiServer`, which verifies the full pin and archives its `functions/` tree into a unique ignored `test/.cache/server-<sha>-*/` directory.
6. The adapter transpiles archived source and loads TypeScript/jsonwebtoken dependencies read-only from the donor checkout.
7. Tests exercise real SDK HTTP requests against those handlers with fake storage and chain evidence; test teardown closes loopback servers and process exit removes each source archive.

## How it is implemented

The combined runner is one npm script composing the existing three scripts with `&&`, so their native exit codes determine the result.
The identity preloader reuses `readServerPin` from `test/helpers/server-source.js` and standard Node/Git APIs.
It prints the identity before throwing a pin-read error, so failed preflight runs retain a receipt.
`test/run-identity.test.js` launches successful and deliberately failing Node subprocesses from outside the repository and asserts exact HEAD/dirty/server identity and exit behavior.
`npm test` includes that regression and still needs no server dependencies.
The Node 22 test commands are documented in `test/README.md`; direct Node invocations need the same `--import` argument to produce an identity receipt.
`README.md` and the current `RELEASE.md` gate now use the combined command.
No SDK API, package dependency, payment behavior or CI workflow was added.

The inherited source-admission helper validates a full lowercase SHA, requires that commit in the local donor Git object store, and uses `git archive` rather than donor working files.
The donor is never fetched, checked out, modified or given a new worktree.
The pinned baseline is deliberately distinct from the donor's newer HEAD and does not qualify that HEAD or deployment.
TypeScript 5.9.3 and jsonwebtoken 9.0.3 match the pinned lockfile entries; complete transitive dependency-lock matching is still unenforced.

## How it was verified

All iteration-2 commands ran locally on Node 22.23.3 through fnm, SDK HEAD `e47b9f2b092d5f9390279912ff781301aa2d05b5` with `sdk_dirty=true`, and configured server `06ced3371528a871849156a70a114e457215b1be` except the deliberate missing/wrong pin runs.
Iteration-1 receipts used SDK HEAD `b4b0112342cf816adb437779eef1201c1da3ce7b` plus its working diff.
The donor `/Users/darkness/Work/Aureus/skyzai_app` remained at `122f16418e862eac2f460e0fd15bdd7658f29f23`, with its pre-existing untracked `.iac-security-fix-0919/` unchanged.

Final combined command:

```sh
eval "$(fnm env --shell zsh)"
fnm use 22.23.3
SKYZAI_APP_ROOT=/Users/darkness/Work/Aureus/skyzai_app npm run test:all
```

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

All iteration-2 receipt names above are under ignored `test/.cache/p1-iteration2/` unless qualified otherwise.
`failure-receipts.json` retains exact exits, diagnostics and identity lines, and `restored-files.json` retains SHA-256 hashes of the restored pin/E2E/server-gate files.
`prove_failures.py` is a local ignored reproduction script for all four mutations, restores all three files in `finally`, and checks zero leftover source archives after each run.
The final combined gate passes **90 tests: 23 unit, 63 E2E, 4 server requirements**.
`git diff --check` and syntax checks of the two new JavaScript files pass.
The root package has no build, lint or formatter script.
No test process or source archive remained after validation, and all loopback servers were closed by test teardown.

The tests qualify source-pinned SDK/HTTP/handler integration with FakeDb and fake external verification, not real Firestore isolation, actual callable transport, native buyer execution or funded rails.
The existing import allowlist and substituted hardened fetch still reject unexpected outbound server calls.
No CI, dashboard, browser, emulator, cloud, chain/provider, live payment or native-device qualification was run.
Independent normal review and a separate read-only break/triage/re-break remain prerequisites before any merge under rule 43; this local author iteration does not claim that review clearance.
Raw logs remain local ignored evidence; this report preserves the commands, mutations, identities and observed outcomes.
The integrator must regenerate Part 2 for the final committed range before merge.

## Deploy / release impact

None: test orchestration, identity receipts and documentation only.
No server writes, package install, version bump, commit, push, merge, publication, deployment or real payment occurred in this iteration.
There is no push-triggered CI workflow or other CI budget use.
The historical release results retain their original server boundaries.

# Part 2: Facts (generated from git)

## Sensitive areas touched

- **Dependencies** (1): `package.json`

## Dependency changes

`package.json`:
```diff
-    "test": "node --test test/sdk.test.js test/server-source.test.js",
-    "test:e2e": "node --test test/payment.e2e.test.js",
-    "test:server-requirements": "node --test test/server-requirements.test.js"
+    "test": "node --import ./test/helpers/run-identity.js --test test/sdk.test.js test/server-source.test.js test/run-identity.test.js",
+    "test:e2e": "node --import ./test/helpers/run-identity.js --test test/payment.e2e.test.js",
+    "test:server-requirements": "node --import ./test/helpers/run-identity.js --test test/server-requirements.test.js",
+    "test:all": "npm test && npm run test:e2e && npm run test:server-requirements"
```

## Commits


## Source files (1)

### `package.json` (modified, +4/-3)

## Test files (3)

### `test/README.md` (modified, +10/-6)

### `test/helpers/run-identity.js` (added, +19/-0)
- Added: `git()`

### `test/run-identity.test.js` (added, +23/-0)
- Added: `git()`

## Docs and context files (3)

### `README.md` (modified, +5/-4)
- Changed: `skyzai`

### `RELEASE.md` (modified, +4/-4)

### `docs/changes/TEST-BATCH0-PAY-1029.md` (modified, +85/-65)
