# Change report: paysdk-fix-align-1027

Repo `/Users/darkness/Work/Aureus/aureus-pay-sdk`, branch `fix/sdk-server-align-1026`, range `fcd1669..working tree`.
0 commits, 0 merges, 8 files, +267 / -16 lines.

Part 1 is written by the authoring agent. Part 2 is generated from git by `agentmail/bin/change-report` and is the ground truth: if they disagree, Part 2 wins and the disagreement is a review finding.

# Part 1: Narrative (authoring agent)

## What and why

The cumulative precision fix prevents merchants from creating invoices that the supported buyer cannot pay.
Round 1 fixed excess configured precision and removed the SDK's incorrect fixed six-decimal USDC/USD assumption.
Round 2 rejected outer whitespace before the unchanged shared parser could trim it.
Round 3 finding 1 reproduced exact one-unit quotes accepted at 19/20 configured decimals even though native buyer numeric verification rejects them.
The final server admission guard limits configured decimals to integers from 0 through 18, before invoice allocation or writes.
The original HTTP 400 refusal message still maps to exported `SkyzaiPayError`, `status: 400`, `code: AMOUNT_NOT_REPRESENTABLE`; no additional SDK runtime mapping is needed.
RELEASE.md now points to the final v3 patch and current evidence rather than the superseded original patch and historical counts.

The SDK remains on `fix/sdk-server-align-1026`, HEAD `fcd1669842250c82fef34a50fb4b01599c40f64f`.
This report covers the cumulative working tree against that HEAD; `sdk-server-align-1026.md` covers the original six-commit range.
Incoming TASK `e67e2fa8-e087-4ade-872f-169822c0e5d2` and `paysdk_FIX3_BRIEF.md` authorize this fix and require scratch-only server work, retained older patches and uncommitted handoff.
The final full replacement patch is `/Users/darkness/Work/Aureus/.agent-mail/attachments/paysdk-fix-align-1027/server-precision-v3.patch`.
Apply it to an unpatched pinned baseline, not over the original or v2 patch.
Both superseded patches remain unchanged as historical evidence.

## Flow (step by step)

1. A merchant calls bound `payments.create` or direct `createPayment`; both share SDK validation and `_request`.
2. The SDK preserves decimal text and leaves configured token admission to the server.
3. Raw HTTP and SDK requests reach the same server `createPayment`, re-exported through `allFunctions` and `index`.
4. Existing method, authentication, durable quota, currency, network and token configuration checks retain their order and behavior.
5. The amount guard rejects outer whitespace, overlong text and configured decimals outside 0-18 before parsing with `decimalToSmallestUnit`.
6. Positive exact units must equal safe integer numeric completion units; refusal returns the existing HTTP 400 message before `transactions.doc()` or invoice `set()`.
7. Both SDK create entry points surface the same typed refusal without an invoice; existing authenticated request quota writes still occur.
8. Valid quotes, including configured 18-decimal one-unit USDC, retain invoice creation and completion with local dummy transfer evidence.

## How it is implemented

The only round-3 server runtime change from v2 replaces `decimals <= 30` with `decimals <= 18` in `functions/src/payment/createPayment.ts` and explains the native integer-power limit in its existing guard comment.
The cumulative v3 patch still imports the existing shared exact parser and retains the whitespace/safe-unit checks added in earlier rounds.
The parser, Dart buyer, all other server callers, exports, request/response shapes, statuses, dependencies, signing/transfer code, package version and deployment configuration are unchanged.
The server handler's purpose/entry-point/dependency/side-effect header remains accurate.
README explains that an operator must correct an unsupported token configuration; changing the amount alone cannot admit a token above 18 decimals.

The permanent E2E table adds an 18-decimal one-unit settlement control.
Its raw HTTP refusal table adds the reviewer's 19-decimal USDC and 20-decimal USDT quotes plus a 30-decimal USD alias on both networks.
Each high-decimal case also checks both SDK create entry points for the exact typed HTTP 400 refusal.
The final assertions count zero invoice allocations, zero invoice `set()` calls and zero stored invoices across all three create calls.
Existing nine whitespace/excess-precision cases remain intact.
Invalid authenticated requests consume the original shared durable quota before payload admission, so zero invoice writes does not mean zero quota writes.

Pinned server development `e9070a0aabbd480481280fa2cbf74611fbde7af5` was exported from Git without checkout metadata into `/private/tmp/paysdk-fix3-m1ouayuu`.
Installed server dependencies are read through a symlink; test compilation writes only scratch `.test-build`.
A full tracked-file comparison under `functions` confirms that only `src/payment/createPayment.ts` differs from the pinned baseline.
The real server checkout is unchanged and is not qualified by these scratch results.
Round 3 touches SDK README, RELEASE, the E2E test table and both change reports; the prior SDK runtime and unit-test edits remain intact and uncommitted.

## How it was verified

Current raw evidence is in `/Users/darkness/Work/Aureus/.agent-mail/attachments/paysdk-fix3-1027/`.

| Check | Before v3 | Final v3 | Evidence |
| --- | --- | --- | --- |
| Unchanged round-3 reviewer high-decimal regression | 0 pass, 2 fail; HTTP/SDK accept and allocate/write two invoices per case | 2 pass; HTTP 400, SDK typed refusal, zero allocations/writes/invoices | `high-decimals-before.log`, `high-decimals-observed-before.json`, `reviewer-fixtures-after.log`, `review3-high-decimals-observed.json` |
| Retained high-decimal/18-decimal selection | 1 pass, 6 fail; valid 18-decimal control already settles | All included in 63 passing E2E tests | `retained-regression-before.log`, `e2e-after.log` |
| SDK `npm test` | Incoming prior round 18/18 | 18 pass | `sdk-after.log` |
| Handler `npm run test:e2e` | Incoming prior round 56 tests | 63 pass | `e2e-after.log` |
| Server requirements | Existing three gates | 3 pass | `server-gates-after.log` |
| Earlier reviewer fixtures | Original 4 precision + 9 direct HTTP cases | 13 pass, plus 2 high-decimal cases = 15 total | `reviewer-fixtures-after.log` |
| Focused server payment suites | Existing six-suite selection | 169 pass after TypeScript test compilation | `focused-server-after.log` |
| All reviewer probes | Native arithmetic remains unchanged | 18-decimal admitted, 19/20 refused; whitespace refused and representable trailing zeroes accepted | `review3-buyer-verification-probe.dart.log`, `review3-buyer-units.dart.log`, `review2-buyer-amount-probe.dart.log`, `whitespace-after.log` |
| Patch applicability and exact source identity | Unpatched pinned baseline | Forward/reverse checks pass; only server handler changed; applied handler equals tested handler | `patch-check.log`, `scratch-source-comparison.log`, `run-identity.json` |

All requested Node suites finish with zero failures, cancellations or skips on Node v22.23.3.
The three SDK suites total 84 passing tests; overlapping reviewer cases are reported separately, not counted as unique additions.
The focused command is `node scripts/run-tests.cjs unit payment.createPayment.test.ts payment.apiKeyRotation.test.ts payment.cancelPayment.test.ts payment.completeSkyzaiPayment.test.ts payment.validateJWT.test.ts paymentSummary.test.ts`.
That normal runner successfully compiles with `tsc -p tsconfig.test.json` before running 169 tests; it is not a production build.
Reviewer JavaScript fixtures were copied unchanged to this task's evidence directory to preserve reviewer-owned outputs.
The three native Dart probes only relocate their parser import to the identical pinned parser in scratch and use the installed standalone Dart binary.
The unchanged amount guard therefore still rejects the high-decimal quotes, while the server now refuses those configurations before invoice creation.
JavaScript syntax, both report checks, SDK whitespace checks and patch checks are recorded in `verification.log`.
Prior failing-first evidence and the round-2 reports are preserved in earlier attachment directories and the incoming report copies in this directory.

The canonical work-state tool write was rejected because runtime approvals are unavailable; no alternate to-do store or bypass was used.
No live/cloud/provider endpoint, chain transaction, browser/device handoff, emulator, funded settlement, power-loss check, full server unit suite or production/native app build ran.
These author-run local results require independent review and actual-target validation.

## Deploy / release impact

The server technical owner must apply the full v3 replacement to the intended unpatched development target, resolve any intervening changes, rerun validation there and regenerate final committed-range reports.
Both superseded patches must remain historical only; RELEASE.md names v3 and the pinned unpatched baseline explicitly.
The matching server must be independently reviewed, integrated and deployed by Ramesh before releasing the precision-dependent SDK changes.
The actual server is not claimed to include any of these patches.
Configured tokens above 18 decimals now deliberately refuse merchant creation until the buyer owner separately corrects and qualifies its arithmetic; changing the Dart buyer is outside this task.
Existing stored high-decimal invoices are not migrated or repaired by this create-admission fix.
Package metadata remains 3.0.0 and the proposed 3.1.0 release remains subject to approval.
No staging, Git metadata writes, commits, pushes, merges, publication, deployments, subagents or terminal/app launches occurred.
The brief explicitly requires all work uncommitted.
The integrator owns merge-time project-map and server context/graph refreshes and import of PENDING acceptance rows into the cross-project workbook outside this seat's writable roots.

## Server patch facts

The full v3 patch changes only `functions/src/payment/createPayment.ts`, +15/-1 lines against pinned development `e9070a0aabbd480481280fa2cbf74611fbde7af5`.
The final change from v2 is the admission ceiling and its explanatory comment.
The shared exact parser and native buyer remain byte-identical to the pinned baseline.

| Artifact | SHA-256 |
| --- | --- |
| Original patch, preserved | `ee40dd9ad49795b9314d8789caf8b2cfbbb1c4498670bde68e80738b9315d9c7` |
| v2 patch, preserved | `a21d031af6ce87d89c847196e759b12ed2640631c4ea45e422050248faeec630` |
| Final v3 full replacement | `61e7b1f725fba860ce307de00f8f4db9f84bc31458849dcf4727e76cccb030f1` |

The final handler identity and baseline are recorded in `run-identity.json`; the full SDK change preservation patch and file hashes are in this directory's `sdk-fix3.patch` and `SHA256SUMS`.

# Part 2: Facts (generated from git)

## Sensitive areas touched

- **Payments / money** (1): `src/SkyzaiPay.js`

## Commits


## Source files (1)

### `src/SkyzaiPay.js` (modified, +4/-11)
- Changed: `REFUSAL_CODES`, `createPayment()`

## Test files (2)

### `test/payment.e2e.test.js` (modified, +107/-0)
- Changed: `buyerRequest()`, `test '${currency} decimals=${decimals} amount=${amount}: ${units === null ? 'refused before invoice creation' : 'settles'}'`, `test 'raw ${network} ${currency} amount=${JSON.stringify(amount)} refuses before invoice allocation'`, `test 'raw merchant HTTP create rejects invalid amounts and unsafe verification units before writing invoices'`
- Test cases added/edited (3): ${currency} decimals=${decimals} amount=${amount}: ${units === null ? 'refused before invoice creation' : 'settles'}; raw ${network} ${currency} amount=${JSON.stringify(amount)} refuses before invoice allocation; raw merchant HTTP create rejects invalid amounts and unsafe verification units before writing invoices

### `test/sdk.test.js` (modified, +15/-4)
- Changed: `test 'amounts retain decimal text and leave configured token precision to the server'`, `test 'create rejects configured-token precision refusals for every supported currency'`
- Test cases added/edited (2): amounts retain decimal text and leave configured token precision to the server; create rejects configured-token precision refusals for every supported currency
- Test cases removed/edited (1): amounts use exact decimal token units and reject rounding or unsafe values

## Docs and context files (5)

### `README.md` (modified, +8/-1)
- Changed: `payment`, `skyzai`

### `RELEASE.md` (modified, +23/-0)

### `docs/README.md` (added, +4/-0)

### `docs/changes/README.md` (added, +5/-0)

### `docs/changes/sdk-server-align-1026.md` (added, +101/-0)
