# Skyzai Pay 3.0.0 release handoff

These are TYPE-THIS instructions for Ramesh.
No push, publish, repository rename, or cloud operation was performed by the SDK worker.
The package uses the Skyzai merchant API-key contract approved by the overseer on 2026-10-18.

## Precision review follow-up 2026-10-27

The review reproduced invoices accepted with six-decimal USDT amount `'1.0000001'` and two-decimal USDC amount `'1.001'` that the buyer cannot pay.
The SDK now preserves decimal text without assuming six decimals for configured USDC/USD, and surfaces the matching server refusal as HTTP 400 `AMOUNT_NOT_REPRESENTABLE`.
The server patch validates exact token units at creation using the resolved decimals and the completion verifier's numeric limits, before allocating or writing a transaction.
Configured decimals must be integers from 0 through 18 because native buyer numeric verification overflows above 18; those configurations receive the same typed refusal even for an exact one-unit quote.
Direct HTTP amounts with outer whitespace are also refused before invoice allocation or writes.
Representable trailing zeroes remain valid.

**Integration pending:** the real server checkout is unchanged because it is outside this seat's writable roots.
The server technical owner must apply and review the full replacement `attachments/paysdk-fix-align-1027/server-precision-v3.patch` under `/Users/darkness/Work/Aureus/.agent-mail`, then rerun these suites against that checkout.
It applies to unpatched Skyzai development `e9070a0aabbd480481280fa2cbf74611fbde7af5`; do not stack it over the original or v2 patches, which remain historical evidence.
The fixes and generated change reports remain uncommitted as required by the fix-round-3 brief.
The integrator must regenerate report facts for the final commit range.

Local `npm test` passes **18/18**.
Against a scratch copy of pinned development plus v3, E2E passes **63/63** and server gates pass **3/3**, for **84 passed, 0 failed** across the three SDK suites.
All reviewer precision/admission fixtures separately pass **15/15**, and the six focused server payment suites pass **169/169** after TypeScript test compilation.
The native buyer probe retains 18-decimal admission and 19/20-decimal refusal; no Dart buyer change is included.
These results validate the draft patch; they do not establish integration into the actual server branch, a production build or independent review clearance.
The earlier 47-test scratch results and unchanged-server failures are historical round-1 evidence; the cumulative follow-up report in `docs/changes/paysdk-fix-align-1027.md` records current results and artifact identity.
Do not release the SDK precision change before the corresponding `createPayment` server fix is integrated, reviewed and deployed by Ramesh.

## server alignment 2026-10-26

Proposed next version: **3.1.0**.
The new `SkyzaiPayError` export and stable refusal codes add public API while retaining `Error` inheritance, HTTP `status`, existing payment methods, and event behavior, so a minor release is appropriate.
`package.json` and the lockfile remain at 3.0.0; no version bump or publication was performed.
The historical 3.0.0 publication recipe below must be updated to the approved version before use.

The source of truth was the local PAYHARD-1026 checkout at `/Users/darkness/.treehouse/skyzai_app-a2503e/13/skyzai_app`, inspected read-only.
The audit covered all SDK HTTP calls, their shared JWT validator and token resolver, buyer completion/recovery, and the buyer/Connect admission boundaries described in `docs/changes/PAYHARD-1026.md`.

### Mismatches found and fixed

| Gap | Aligned result |
| --- | --- |
| Merchant refusals were generic errors without stable recovery reasons. | Exported `SkyzaiPayError` carries `status` and `code` through create/get/cancel, refresh, and polling, with existing credential redaction preserved. |
| Key rotation/revocation and current business policy were not distinguishable to consumers. | Added `API_KEY_INVALID`, `API_KEY_EXPIRED`, `API_KEY_REISSUE_REQUIRED`, `API_KEY_REVOKED`, `BUSINESS_NOT_APPROVED`, `ACCOUNT_BLOCKED`, and `BUSINESS_NOT_FOUND`; documented owner-only issuance and recovery after KYB withdrawal, closure, flags, and key replacement. |
| Production testnet and missing-token refusals lacked typed reasons and routing guidance. | Added `TESTNET_NOT_ALLOWED` and `TOKEN_NOT_CONFIGURED`; documented server-owned token selection, USD-to-USDC settlement, testnet admission, and retaining the requested network because merchant responses omit asset/network fields. |
| The local server harness used administrator-only key issuance and incomplete transfer evidence. | Fixtures now use an approved business owner, verified Mirror transaction IDs, and fixed receipt clocks, so regressions exercise current handlers and reject missing transfer identity. |
| Expiry guidance omitted delayed timely completion and the strict consensus cutoff. | Documented the server's 15-minute window `[createdAt, expiresAt)`, explicit refresh after an expired snapshot, exact-expiry refusal, and private recovery evidence without an SDK receipt or automatic refund. |
| Cancellation guidance did not distinguish stored pending from derived expiry. | Documented pending-only cancellation, including an elapsed invoice still stored pending; persisted expired/unknown and completed/confirmed/cancelled states are refused, and cancel returns a separate object without reversing funds. |
| Response and status guidance could imply a full creation record or a server `failed` outcome. | Documented partial create data, get `userId` versus cancel `uId` normalization, nullable dates, retained metadata after refresh, all six server wire statuses, and unrecognized stored values becoming `unknown` without success/failure events. |
| Buyer signing-key/fresh-invoice checks and Connect quotes were not explained at the SDK boundary. | README and example guidance now distinguish buyer-app admission from merchant HTTP errors, preserve recovery of original scheduled attempts, and describe Connect's separate network/expiry-bound quote without adding merchant methods or invented refusal codes. |

The existing request contract already matches the server: POST `createPayment` with `{ amount, currency, network, metadata }`, GET `getPayment?id=...`, and POST `cancelPayment` with `{ paymentId }`, all using the merchant Bearer key.
Real-handler regressions verify these shapes and the existing response normalization; no wire-format change was required.
The server rechecks current key/business authority on every call, including reads and cancellation.
An active-key pointer change rejects the previous key even if its row still has `revoked: false`.
Rotation and explicit revocation share `API_KEY_REVOKED` because their HTTP messages are identical.
HTTP handlers expose messages rather than machine-readable reason codes; the SDK maps known status/message pairs and uses `HTTP_ERROR` for changed or unknown messages, access denial, missing invoices, cancellation refusals, and rate limits.
Transport, timeout, malformed-response, and local-validation failures remain plain `Error` values.

### Verified behavior and limits

`npm test` passes **17/17** SDK tests.
With `SKYZAI_APP_ROOT` set to the checkout above, `npm run test:e2e` passes **38/38** tests and `npm run test:server-requirements` passes **3/3** gates, for **58 passed, 0 failed** in total.
Coverage includes exact request/response shapes, all status projections, cancellation eligibility, current-business/key refusals on every SDK path, testnet and configured-token settlement, delayed completion after expiry, strict expiry boundaries, and repeat-safe private recovery evidence.
The release gates also check expiry enforcement and JWT-secret bindings on all three merchant endpoints.

Buyer signing-key/fresh-invoice checks, terminal-schedule recovery controls, and Connect quote admission were inspected in source; the JS harness does not execute the Flutter/native or Connect flows.
The buyer app requires a memo-capable Ed25519 key for checkout, validates fresh invoice terms before dispatch, and recovers retained attempts instead of sending again after expiry/cancellation.
Connect preserves its original intent network and deadline for new sends and verifies delayed payment proofs against the original intent; its refusal protocol is separate from merchant `SkyzaiPayError`.
SDK polling still stops on terminal status or HTTP 400/401/403/404, preserves the last known status on refusal, and permits explicit expired-to-completed refresh when timely settlement is reported later.

These are local in-memory handler checks with fake chain evidence, not deployed-server or funded-release qualification.
No cloud operation, live Mirror request, on-chain transfer, browser/device handoff, or power-loss recovery check was performed.
The server report retains funded-release gates for generic native attempt durability, original pre-broadcast ID continuity, provider/device behavior, and historical Connect claim adoption.
No server files, dependencies, package version, or npm artifacts were changed by this alignment.

## Local release gate

Run the complete release gate from the reviewed SDK checkout with Node.js 22.12+ (verified locally on Node.js 22.23.3).
The SDK itself supports Node.js 18+; the dashboard's Vite dependencies require the newer release-gate runtime.
Point `SKYZAI_APP_ROOT` at the server checkout containing the reviewed expiry and JWT-secret-binding fixes.
That checkout needs its functions dependencies installed.

```sh
export SKYZAI_APP_ROOT=/path/to/reviewed/skyzai_app
npm ci
npm test
npm run test:e2e
npm run test:server-requirements
npm ci --prefix examples/skyzai-pay-dash
npm run lint --prefix examples/skyzai-pay-dash
npm run build --prefix examples/skyzai-pay-dash
npm pack --dry-run
```

All tests must pass before release.
The original server checkout at `bdb155ebb42782cf5be04732ef3db59cbf438e2a` fails the three server-requirements tests: late transfers can complete, merchant HTTP endpoints omit the JWT secret binding, and getPayment never derives expiry.
The SDK does not repair server code.
The reviewed server fixes must also be deployed by Ramesh before consumers use the new package.

## Repository rename

After the reviewed SDK branch is merged and ready, rename the existing repository in place.
The new repository name retains the `-sdk` suffix; the npm package is `skyzai-pay`.
The package metadata already points to this destination.

```sh
gh repo rename skyzai-pay-sdk --repo Menexus-GmbH/aureus-pay-sdk --yes
git remote set-url origin git@github.com:Menexus-GmbH/skyzai-pay-sdk.git
```

## npm publication

Use Ramesh's authorized npm account.
Check access to the new package name before publishing; registry availability was not checked by this local task.
For a new package, `npm view` may return E404; if it already exists, verify ownership and that 3.0.0 is available.

```sh
npm whoami
npm view skyzai-pay name version maintainers
npm pack
npm publish ./skyzai-pay-3.0.0.tgz --access public
npm view skyzai-pay@3.0.0 version dist.integrity
```

The tarball contains only `package.json`, `README.md`, and the three source modules.
The named `AureusPay` export is a deprecated alias of `SkyzaiPay`; no old backend or Firebase login path remains.
The migration instructions are in README.md.
The test harness proves local handler behavior with in-memory Firestore and fake mirror responses; it does not prove deployed configuration, live chain settlement, or a device QR handoff.
