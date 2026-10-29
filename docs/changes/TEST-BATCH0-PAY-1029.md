# Change report: TEST-BATCH0-PAY-1029

Repo `/Users/darkness/Work/Aureus/aureus-pay-sdk`, branch `test/batch0-pin-1029`, range `cec6782..working tree`.
0 commits, 0 merges, 5 files, +153 / -12 lines.

Part 1 is written by the authoring agent. Part 2 is generated from git by `agentmail/bin/change-report` and is the ground truth: if they disagree, Part 2 wins and the disagreement is a review finding.

# Part 1: Narrative (authoring agent)

## What and why

Fix-round iteration 1 completes review findings #1 and #2: the handler harness now admits the donor's TypeScript and jsonwebtoken only when their installed versions match the archived server lockfile, and missing dependencies produce an actionable install diagnostic.
The source receipt records both verified versions beside the SDK and server SHAs.
The server remains pinned to `06ced3371528a871849156a70a114e457215b1be` (PAYSDK-PRECISION-V3-1027, reviewed PASS r4).
This report's generated facts cover only this iteration's uncommitted changes on SDK HEAD `cec678283c2562f8dcb398a3a4f3acda4e29e15e`.
The earlier P1 foundation is already in orchestrator commits `e47b9f2` and `cec6782`; its failing-first receipts are retained below as historical evidence.
No agent commit was made.
The fix-round stop condition is not met: FIX #5, #7, #8, #9 and #10 remain open.
P4 remains outside this iteration.

## Flow (step by step)

1. `npm run test:all` runs the unit, E2E and server-requirement suites sequentially, stopping at any nonzero exit.
2. Each suite's preloader prints SDK HEAD, working-tree dirty state and the configured server SHA before test execution.
3. Handler startup archives the pinned Functions source into an ignored disposable directory, independently of donor HEAD or working source.
4. `verifyServerDependencies` reads exact TypeScript/jsonwebtoken versions from that archived `package-lock.json` and resolves installed package metadata using the same donor Functions root as the handler loader.
5. Missing package metadata or a version mismatch stops startup with an `install Functions dependencies matching the pinned lockfile` diagnostic, and removes the archive.
6. Successful admission prints `[skyzai test source] sdk_sha=<HEAD> server_sha=<pin> typescript=5.9.3 jsonwebtoken=9.0.3 source=git-archive` and returns the verified versions with the source descriptor.
7. The existing adapter then loads those modules and serves real handlers over loopback HTTP with FakeDb and fake external verification.
Test teardown closes servers; process exit removes successful archives.

## How it is implemented

`test/helpers/server-source.js` owns dependency admission because both handler suites already prepare their source there before loading modules.
The expected versions come only from the archived lockfile, never the donor's mutable lockfile.
The check reads package metadata before evaluating either module and rejects missing lockfile version entries.
The existing failure wrapper now includes the underlying preparation error, preserving the dependency diagnostic while still cleaning failed archives.
`test/server-source.test.js` covers matching versions, both independent mismatches, a misleading donor lockfile, absent dependencies and absent or invalid lockfile version entries using disposable filesystem fixtures without server installs.
`test/server-requirements.test.js` checks returned versions against the actual archive and exercises real handler startup in isolated subprocesses.
Those subprocesses borrow the donor's Git object directory read-only and use disposable package manifests pointing at the real installed runtime modules.
Changing either disposable manifest to version `0.0.0` reproduces drift without modifying or reinstalling anything in the donor.
A matching control starts and closes the actual server and checks the version receipt; the absent-install control has no Functions dependencies.
No SDK API, runtime behavior, package dependency or CI workflow changes.
Only the two borrowed direct package versions are checked; transitive versions and package-byte integrity remain outside this check.

## How it was verified

Commands used Node 22.23.3 via `fnm exec --using 22.23.3`.
The tested SDK identity is HEAD `cec678283c2562f8dcb398a3a4f3acda4e29e15e` plus this working diff (`sdk_dirty=true`).
The pinned server identity is `06ced3371528a871849156a70a114e457215b1be`, with TypeScript 5.9.3 and jsonwebtoken 9.0.3.
The donor `/Users/darkness/Work/Aureus/skyzai_app` stayed at `122f16418e862eac2f460e0fd15bdd7658f29f23`, with only its pre-existing untracked `.iac-security-fix-0919/`.

```sh
fnm exec --using 22.23.3 node --test test/server-source.test.js
SKYZAI_APP_ROOT=/Users/darkness/Work/Aureus/skyzai_app fnm exec --using 22.23.3 node --import ./test/helpers/run-identity.js --test test/server-requirements.test.js
SKYZAI_APP_ROOT=/Users/darkness/Work/Aureus/skyzai_app fnm exec --using 22.23.3 npm run test:all
```

### Fix-round failing-first table

| FIX requirement | First failing proof before implementation | Passing proof |
| --- | --- | --- |
| #1: Both dependency versions must equal the archived lockfile | Unit command: 4 pass / 6 fail because the verifier was absent, including both mismatch cases. Real handler startup with each disposable package version set to `0.0.0` exited 0 and printed `HANDLER_STARTED`, failing the required rejection assertions. | Same unit regressions pass; each drift subprocess now exits 1 with package name, expected/installed version and install instructions before handler startup. |
| #1: Verified dependency versions must be recorded | Actual source descriptor had no `dependencyVersions`; the matching startup control printed no version receipt. | Source descriptor equals archived lockfile versions; matching actual-handler startup exits 0 and prints TypeScript/jsonwebtoken versions in the source identity line. |
| #2: Missing donor dependencies must fail clearly | Real startup subprocess exited 1 with raw `Cannot find module 'typescript'`; the diagnostic assertion failed. The unit absence assertion also failed before the verifier existed. | Same unit and startup assertions pass with `Cannot resolve Functions dependency typescript ... install Functions dependencies matching the pinned lockfile`. |

Before implementation, the server-requirement command reported 9 tests, 3 pass / 6 fail (the new parent test is also counted failed when subtests fail).
Final combined command exits 0 with **101 passing tests: 29 unit, 63 E2E and 9 server requirements**, zero failures, cancellations, skips or todos.
The first unit log records the absent helper; the startup regressions separately reproduce the actual pre-fix defects through the real archive/loader boundary.
Raw logs are local ignored evidence under `test/.cache/fix-dependencies-iteration1/`: `unit-before.log`, `requirements-before.log`, `all-after.log`.
The regression fixtures and exact commands are tracked in Git; the logs do not have to be preserved to rerun these dependency checks.
`git diff --check` and syntax checks of all three changed JavaScript files pass.
The root package has no build, lint or formatter script.
All validation commands exited; no source archive or disposable donor directory remained after validation.

### Remaining review triage

| Finding | Disposition after this iteration |
| --- | --- |
| FIX #1 dependency versions and receipts | Implemented and verified above. |
| FIX #2 missing dependency diagnostic | Implemented and verified above. |
| FIX #5 replacement refs and non-commit objects | Open: add failing-first tests and hardened Git admission. |
| FIX #7 signal cleanup and stale archive pruning | Open: add failing-first signal and restart tests. |
| FIX #8 absent Functions tree | Open: add failing-first clear source-layout diagnostic. |
| FIX #9 Node engine floor and absent Git | Open: align tooling metadata and add a clear missing-Git test. |
| FIX #10 cumulative report and reproducible original mutation proofs | Open: this iteration's facts are regenerated, but final cumulative facts and a tracked reproduction for the original ignored `prove_failures.py` are still required. |
| ACCEPT+DOC #3 dirty tree | `sdk_dirty` is recorded; dirty trees remain allowed, with HEAD identifying the base rather than the exact uncommitted bytes. |
| ACCEPT+DOC #4 persisted identity | Identity remains on stdout only; there is no `last-run.json` artifact. |
| ACCEPT+DOC #6 archive symlinks | The reviewed current pin has no Functions symlinks; future pin changes need renewed inspection because the loader's string path allowlist does not resolve symlink targets. |

### Historical P1 foundation failing-first table

The following table preserves the original two foundation iterations, not new outcomes from this fix round.
Their final combined receipt was 90/90 (23 unit, 63 E2E, 4 server requirements) on SDK HEAD `e47b9f2b092d5f9390279912ff781301aa2d05b5` with its working diff.
Iteration 1 used SDK HEAD `b4b0112342cf816adb437779eef1201c1da3ce7b` with its working diff.
Both used the same server pin as this fix round.
Historical log paths refer to ignored local evidence and remain subject to FIX #10.

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

Historical iteration-2 receipt paths are under `test/.cache/p1-iteration2/` unless qualified otherwise.
The original ignored `prove_failures.py` and logs are not claimed as tracked or reviewer-reproducible artifacts; FIX #10 must resolve that before the loop stops.

## Deploy / release impact

None: local test dependency admission and documentation only.
No install, server write, commit, push, merge, CI, publication, deployment, cloud command, provider call, chain transfer or real payment occurred.
These tests still use FakeDb and fake chain verification; they do not qualify real Firestore isolation, native buyer/callable transport or funded rails.
Normal independent review and the scoped read-only re-break remain prerequisites before merge; this author iteration does not claim independent clearance.

# Part 2: Facts (generated from git)

## Sensitive areas touched

- None.

## Commits


## Test files (4)

### `test/README.md` (modified, +4/-1)

### `test/helpers/server-source.js` (modified, +31/-4)
- Added: `verifyServerDependencies()`
- Changed: `cleanup()`

### `test/server-requirements.test.js` (modified, +60/-3)
- Changed: `test 'handler source matches the committed pin and is isolated from donor working files'`, `test 'handler startup admits locked dependencies and refuses drift or absent installs'`
- Test cases added/edited (1): handler startup admits locked dependencies and refuses drift or absent installs

### `test/server-source.test.js` (modified, +56/-4)
- Added: `dependencyFixture()`
- Changed: `test 'a pin absent from the local Git object store fails before loading handlers'`, `test 'each donor dependency must match the archived lockfile, not donor metadata'`, `test 'matching donor dependencies report the archived lockfile versions'`, `test 'missing donor dependencies give an install diagnostic'`, `test 'the archived lockfile must contain an exact version for every borrowed dependency'`, `versions`
- Test cases added/edited (4): matching donor dependencies report the archived lockfile versions; each donor dependency must match the archived lockfile, not donor metadata; missing donor dependencies give an install diagnostic; the archived lockfile must contain an exact version for every borrowed dependency

## Docs and context files (1)

### `README.md` (modified, +2/-0)
- Changed: `skyzai`
