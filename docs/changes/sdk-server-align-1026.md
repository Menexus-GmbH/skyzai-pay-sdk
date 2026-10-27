# Change report: sdk-server-align-1026

Repo `/Users/darkness/Work/Aureus/aureus-pay-sdk`, branch `fix/sdk-server-align-1026`, range `ce5ddb8..fcd1669`.
6 commits, 0 merges, 8 files, +585 / -26 lines.

Part 1 is written by the authoring agent. Part 2 is generated from git by `agentmail/bin/change-report` and is the ground truth: if they disagree, Part 2 wins and the disagreement is a review finding.

# Part 1: Narrative (authoring agent)

## What and why

The six existing alignment commits add typed merchant HTTP refusals and document the hardened server's request, ownership, lifecycle and asset-routing contracts.
This report supplies the author narrative and generated Git facts missing from review finding 2.
It records the already committed range; the separate `paysdk-fix-align-1027.md` report covers the precision follow-up and uncommitted preservation work.
The reviewed range is exactly `ce5ddb83dc2e1d663beda396f40fd7e01a0294f8..fcd1669842250c82fef34a50fb4b01599c40f64f` on `fix/sdk-server-align-1026`.

## Flow (step by step)

1. A merchant calls create, get or cancel with the owner's current business API key.
2. The shared `_request` method sends the existing Bearer-authenticated HTTP request and parses the response.
3. Known refusal status/message pairs become exported `SkyzaiPayError` values carrying `status` and `code`; whole-key redaction remains in place and transport causes are discarded.
4. `Payment.refresh` and polling receive the same errors; existing terminal-state, expiry-grace and request-ordering behavior remains in the unchanged Payment class.
5. Local regressions load actual server handlers with an in-memory Firestore and fake transfer evidence; no cloud SDK is initialized and no live transfer is submitted.

## How it is implemented

`src/SkyzaiPay.js` owns the refusal map and Error subclass, and `src/index.js` exports it without changing the existing class aliases.
Unknown or changed HTTP messages fall back to `HTTP_ERROR` because the server wire contract has no machine-readable reason codes.
The helper's owner/KYB fixture and Mirror identity now match the hardened handlers.
The expanded E2E suite covers request/response shapes, status projections, cancellation, merchant gating, testnet admission and delayed timely settlement.
README, dashboard README and RELEASE explain owner-only key issuance, partial creation data, stored-pending cancellation, explicit refresh after expiry and separate buyer/Connect admission.
The configured-token precision claim was incomplete in this range: the server accepted nonrepresentable quotes, as confirmed during FIX1.
Its fix and server integration dependency are recorded in the follow-up report.
The inherited raw Payment status strings are unchanged in this range; the review identified them as a structural limitation, not a numbered behavioral finding.

## How it was verified

FIX1 reran `npm test` at the exact pre-fix SDK HEAD and observed 17 passed, 0 failed.
Raw output is `attachments/paysdk-fix-align-1027/npm-test-before.log` under the mail root.
The reviewer's original token fixture at that HEAD and server `51b242174267db9fa9acf75ccbc5f5a073fa3a4f` reproduced two invalid quotes being accepted, with both valid settlement controls passing.
Raw output is `precision-before.log` in the same attachment directory.
The historical RELEASE counts of 38 E2E and 3 server gates were prior-author results; this report does not claim a new run of those historical SDK test contents.
Current expanded-suite runs and exact counts are recorded in the follow-up report.
Independent review runtime isolation remains an external review gate; this implementation task explicitly authorizes normal local tests without that sandbox.
No app build, emulator, device, browser handoff, cloud endpoint, live Mirror request, funded settlement, power-loss or full analyzer/typecheck run was performed during FIX1.

## Deploy / release impact

The proposed package version remains 3.1.0 and package metadata remains at 3.0.0.
No version bump, push, publication, merge or deployment occurred.
The precision-dependent follow-up must not ship before the matching server `createPayment` fix has been integrated, reviewed and deployed by Ramesh.
The integrator must regenerate final-range report facts, generate the project map on merge and update any configured private test ledger; no private ledger path was supplied to this seat.

The cumulative follow-up report now records the round-2 whitespace repair and round-3 configured-decimal ceiling, final pinned-development validation and full replacement `server-precision-v3.patch`.
The original six-commit facts below remain unchanged; round-1 through round-3 working-tree changes are outside this exact historical range.

# Part 2: Facts (generated from git)

## Sensitive areas touched

- **Payments / money** (2): `src/SkyzaiPay.js`, `src/index.js`

## Commits

- `04c169b` 2026-10-26 21:42 Ramesh Giri: gnhf 1: Restored regression testing against the hardened server; all 27 tests pass.
- `4823bea` 2026-10-26 21:47 Ramesh Giri: gnhf 2: Added typed merchant refusal errors; all 36 tests, dashboard lint/build, and packaging checks pass.
- `daa7bcc` 2026-10-26 21:52 Ramesh Giri: gnhf 3: Verified and documented expiry, delayed settlement, and cancellation semantics; all 39 tests pass.
- `de9b805` 2026-10-26 21:55 Ramesh Giri: gnhf 4: Added typed network and token refusals; all 46 tests and dashboard lint/build pass.
- `ef4471e` 2026-10-26 22:03 Ramesh Giri: gnhf 5: Verified merchant request shapes and status handling; all 58 local tests pass.
- `fcd1669` 2026-10-26 22:16 Ramesh Giri: gnhf 6: Completed the server alignment release report; all 58 local tests pass and the stop condition is met.

## Source files (2)

### `src/SkyzaiPay.js` (modified, +28/-3)
- Added: `class SkyzaiPayError`
- Changed: `BASE_URL`, `REFUSAL_CODES`, `_request()`

### `src/index.js` (modified, +3/-2)

## Test files (3)

### `test/helpers/skyzai-server.js` (modified, +9/-8)
- Changed: `localRequire()`, `startSkyzaiServer()`, `transfer()`

### `test/payment.e2e.test.js` (modified, +280/-4)
- Added: `assertRefusal()`
- Changed: `setup()`, `test '${cancel ? 'cancelling an elapsed invoice' : 'consensus exactly at expiry'} retains private review evidence without SDK success'`, `test '${projectId === null ? 'unknown' : 'production'} project refuses testnet without creating an invoice'`, `test 'an expired SDK snapshot can refresh to completed when timely proof arrives later'`, `test 'delayed ${older} cannot overwrite real buyer completion observed by ${newer}'`, `test 'local ${network} ${currency} invoice settles with its server-selected token'`, `test 'merchant create/get/cancel shapes retain checkout data and normalize response fields'`, `test 'merchant re-gating and key invalidation produce typed refusals on every SDK path'`, `test 'merchant status projection and cancellation fail closed for every stored lifecycle value'`, `test 'real auth, missing payment, ownership and configured-token errors reach the SDK'`, `test 'real completion rejects underpayment, wrong token, wrong memo, failed and missing transfers'`, `test 'real key generation -> SDK create/get/monitor -> buyer completion -> SDK completed'`, `test 'server expired state stops monitoring without emitting success'`, `test 'unconfigured USDT on either network yields a typed refusal without an invoice'`
- Test cases added/edited (8): merchant create/get/cancel shapes retain checkout data and normalize response fields; merchant status projection and cancellation fail closed for every stored lifecycle value; ${projectId === null ? 'unknown' : 'production'} project refuses testnet without creating an invoice; unconfigured USDT on either network yields a typed refusal without an invoice; local ${network} ${currency} invoice settles with its server-selected token; merchant re-gating and key invalidation produce typed refusals on every SDK path; an expired SDK snapshot can refresh to completed when timely proof arrives later; ${cancel ? 'cancelling an elapsed invoice' : 'consensus exactly at expiry'} retains private review evidence without SDK success

### `test/sdk.test.js` (modified, +55/-2)
- Changed: `test 'HTTP errors redact an echoed Authorization value while retaining status'`, `test 'JSON HTTP refusals expose stable codes and preserve unknown errors without guessing'`
- Test cases added/edited (1): JSON HTTP refusals expose stable codes and preserve unknown errors without guessing

## Docs and context files (3)

### `README.md` (modified, +122/-7)
- Changed: `cancelled`, `payment`, `skyzai`

### `RELEASE.md` (modified, +48/-0)

### `examples/skyzai-pay-dash/README.md` (modified, +40/-0)
