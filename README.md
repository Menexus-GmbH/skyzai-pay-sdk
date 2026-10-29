# Skyzai Pay

Accept USDC payments on Hedera with the Skyzai merchant SDK.
The package is `skyzai-pay` and its default export is `SkyzaiPay`.
It targets the Skyzai backend exclusively.

```sh
npm install skyzai-pay
```

Requires Node.js 18+ or a browser with Fetch and AbortController.
This package uses ES modules.

## Merchant setup

The business owner obtains a merchant API key from Skyzai's `generateAPIKey` flow for a KYB-approved business.
Administrator access alone cannot issue a merchant key.
The key is an HS256 JWT containing a `keyId` linked to the server's `APIKeys` record.
The SDK sends it as `Authorization: Bearer <apiKey>` to `createPayment`, `getPayment`, and `cancelPayment`.
Keys containing control or non-ASCII characters are rejected before any request.
A Firebase custom token or Firebase ID token cannot replace this merchant key.
Expired or revoked keys must be replaced through Skyzai.
Rotation invalidates previous keys; every create, get, and cancel request rechecks the current key, business approval, closure, and account flags.

Keep the key on your merchant server and expose only your own authenticated checkout endpoints to shoppers.
Do not ship the key in a public web bundle or store it in browser local storage.
The included browser dashboard is a trusted local integration demo only.

```js
import SkyzaiPay from 'skyzai-pay';

const skyzai = new SkyzaiPay({ apiKey: process.env.SKYZAI_API_KEY });
const payment = await skyzai.payments.create({
  amount: '10.123456',
  currency: 'USDC',
  network: 'mainnet',
  metadata: { orderId: 'order-123' },
});

// Render this value as a QR code or link for the buyer's Skyzai app.
console.log(payment.getQRCode()); // skyzai://pay?id=...

payment.on('error', error => console.error(error.message));
payment.on('status_change', status => console.log(status));
payment.on('confirmed', paid => {
  console.log(paid.status, paid.txHash); // completed, verified chain transaction ID
});
payment.on('expired', () => console.log('Request expired'));
payment.on('cancelled', () => console.log('Request cancelled'));
payment.on('failed', () => console.log('Payment failed'));
payment.startListening();

// On shutdown or when leaving the checkout:
// payment.stopListening();
```

## Payment contract

`payments.create({ amount, currency, network, metadata })` returns a `Payment`.
Amounts are decimal strings in whole token units: `'10.123456'` means 10.123456 USDC, or 10,123,456 smallest units.
The default mainnet USDC token is `0.0.456858` with six decimals, resolved by the server.
The SDK checks positive decimal syntax and preserves the supplied text.
Only the server knows the configured token decimals, so `createPayment` must reject nonrepresentable or unsafe smallest-unit amounts before writing an invoice.
Configured tokens above 18 decimals are refused because the native buyer cannot verify them safely; the server operator must select a supported token configuration.
With the precision admission fix, `payments.create` rejects these HTTP 400 responses as `AMOUNT_NOT_REPRESENTABLE`.
This requires the matching server fix before releasing this SDK change; older servers can accept quotes the buyer cannot pay.
Use strings to preserve decimals; exponent notation is not accepted.

`currency` accepts `USDC`, `USD` (settled in USDC), or `USDT`.
USDT requires server-side token configuration for the requested network and otherwise returns HTTP 503 with `TOKEN_NOT_CONFIGURED`.
The server resolves the token ID and decimals from `appConfig/skyzaiPay.<network>.tokens.<currency>`, with `USD` using the `USDC` entry.
Without an override, mainnet USDC uses `0.0.456858` and testnet USDC uses `0.0.429274`, both with six decimals.
For example, six-decimal USDT rejects `'1.0000001'`, and two-decimal USDC rejects `'1.001'`.
Representable trailing zeroes are accepted; the SDK does not assume six decimals for configured assets.
`network` defaults to `mainnet`; production and unidentified server environments refuse `testnet` with HTTP 403 and `TESTNET_NOT_ALLOWED`.
Testnet requests work only against an explicitly identified non-production server, such as the local handler harness.
The SDK never changes the requested currency or network to retry a refusal.
The payment API supports Hedera settlement, even if a merchant profile contains EVM addresses.
`metadata` is an optional object.

```js
const payment = await skyzai.payments.get('payment-id');
await payment.refresh(); // Updates the same object through getPayment?id=...
const cancelled = await skyzai.payments.cancel('payment-id');
```

`Payment` exposes `id`/`paymentId`, `status`, `amount`, `currency`, `userId`, `userEmail`, `userName`, `metadata`, `destinations`, `txHash`, `qrCode`, and `deepLink`.
`createdAt`, `expiresAt`, `confirmedAt`, and `updatedAt` are `Date` values when returned by the server, otherwise `null`.
The creation response contains fewer fields than the get response; call `refresh()` for the full record.
In particular, creation omits merchant identity, metadata, `createdAt`, and `updatedAt`; the SDK exposes `null` for the missing identity/dates and `{}` for metadata until a get or refresh.
The server still stores the metadata supplied at creation.
Get returns `userId` and cancel returns `uId`; both become `Payment.userId`.
Merchant create/get/cancel responses omit `network`, `tokenId`, and `tokenDecimals`; retain the requested network in your checkout records rather than inferring it from the QR link.

`startListening()` polls authenticated `getPayment` requests every three seconds by default.
Refresh and polling share request ordering, so an older response cannot overwrite a newer request's result.
Terminal states never return to pending, and `stopListening()` discards in-flight responses.
It does not sign in to Firebase or access Firestore directly.
The server stores these requests in `transactions`.

| Event | Meaning |
| --- | --- |
| `status_change` | Server status changed; argument is the status string |
| `completed` | Server verified settlement; argument is the updated `Payment` |
| `confirmed` | Compatibility success callback, also emitted for `completed` |
| `expired`, `cancelled` | Server result that stops monitoring; argument is the updated `Payment` |
| `failed` | Compatibility terminal event; the current merchant server does not return this status |
| `error` | HTTP, authentication, or transport failure; argument is an `Error` |
| `monitoring_stopped` | Expiry grace elapsed; argument is the `Payment` with the last server status |

Subscribe to either `completed` or `confirmed` for fulfillment, so you do not handle success twice.
Always attach an `error` listener before starting monitoring.
Completed, confirmed, expired, failed, and cancelled results stop polling automatically.
Authentication, access, and missing-payment errors also stop polling; transient errors are reported and retried on the next interval.
Calling `startListening()` repeatedly does not create duplicate polling loops.
`stopListening()` suppresses an in-flight poll's result and prevents further polling.

The current merchant HTTP status values are:

| `Payment.status` | Meaning |
| --- | --- |
| `pending` | Awaiting settlement within the payment window |
| `completed` | Verified settlement; emits `completed` and compatibility `confirmed` |
| `confirmed` | Legacy server success value; emits `confirmed` |
| `expired` | Payment window elapsed, or an explicitly stored expired state |
| `cancelled` | Invoice withdrawn; no refund implied |
| `unknown` | Stored status is missing or unrecognized; no success or failure event |

The server maps unrecognized stored values, including `failed`, to `unknown`.
The SDK preserves `unknown` on a newly fetched or pending object and can continue polling until the monitoring deadline; it does not authorize fulfillment or a replacement transfer.
Retain the invoice ID and contact Skyzai support if the status remains unknown.

`isExpired()` checks the server's `expiresAt` against the local clock for a pending request, or returns true for server status `expired`.
It does not invent a server status or confirm a payment.
At `expiresAt + expiryGrace` (two minutes by default), monitoring makes one final `getPayment` request, surfaces the result, and stops even if the server still says `pending`.
In that case `monitoring_stopped` reports the final server status without fabricating `expired` or success.
If the final request fails, `error` is emitted and `monitoring_stopped` carries the last known status.
The backend enforces settlement expiry separately; see the server release gate below.

### Expiry, cancellation, and delayed settlement

Merchant invoices have a server-owned 15-minute payment window.
`getPayment` derives `expired` when that window elapses while the stored invoice remains pending.
A verified transfer with consensus time in `[createdAt, expiresAt)` can still complete that invoice when reported later, including after the SDK has emitted `expired` and stopped polling.
A transfer exactly at `expiresAt` is outside the window.

`startListening()` on an expired snapshot does not fetch again.
Keep the original payment ID and use `payment.refresh()` or `payments.get(id)` to check for delayed completion before requesting another payment.
Refreshing the same object from `expired` to `completed` emits `status_change`, `completed`, and the compatibility `confirmed` event with the verified receipt.

```js
// Recheck the original invoice after the buyer reports delayed completion.
await payment.refresh();
if (payment.status === 'completed') console.log(payment.txHash);
```

`payments.cancel(id)` withdraws a stored pending invoice, including one currently displayed as expired, and returns a separate `Payment` object.
Refresh an existing object to observe its cancellation.
Completed, confirmed, and already cancelled invoices cannot be cancelled.
Cancellation accepts only a stored `pending` state; a persisted `expired`, `unknown`, or unrecognized state is also refused with HTTP 400 and `HTTP_ERROR`.
This differs from the derived expired view of a still-pending record described above.
Cancellation does not reverse a transfer.
Verified late, cancelled, duplicate, or already claimed deposits can create private server recovery evidence for operator review without completing the invoice or executing a refund.
The buyer completion callable reports that review outcome; merchant get/cancel responses expose no recovery records or review status, so SDK HTTP error codes cannot identify it.
Retain the original invoice and proof for Skyzai support rather than sending another transfer to resolve an uncertain outcome.

### Buyer completion boundary

The buyer's Skyzai app makes the Hedera transfer with memo `Payment: <paymentId>` and calls Firebase callable `completeSkyzaiPayment` with its own authenticated session:

```js
// Buyer app contract, not a merchant SDK method:
// data: { transactionId: paymentId, onChainTransactionId: hederaTransactionId }
```

The server checks the mirror transaction's success, destination, token, amount, memo, and redemption ledger before recording `completed` with `txHash` and `confirmedAt`.
The merchant observes that result through `getPayment` or polling.
This SDK neither sends on-chain transfers nor wraps buyer completion.

Before a new transfer, the buyer app requires a memo-capable Ed25519 signing key and rechecks the invoice through a fresh server read.
That signing key is separate from the merchant API key.
Unsupported signing keys, cancelled or expired invoices, changed amount/token/network/destination/expiry/metadata, and a changed buyer session prevent a new send.
These are buyer-app admission failures; merchant create/get/cancel responses do not expose them as `SkyzaiPayError` codes.
A merchant invoice can remain `pending` after the buyer app refuses a transfer.

If the buyer app retained a transfer attempt or schedule, expiry or cancellation preserves recovery of that original attempt without signing another transfer.
Creating a schedule or collecting signatures does not prove execution or completion.
Merchant fulfillment still requires a verified `completed` result (or the legacy `confirmed` success value).
An uncertain native transfer must be reconciled using its original invoice and proof before another charge; local attempt storage has not been qualified for device power loss.

### Connect credit purchases

Connect credit purchases use a separate intent API and are outside this merchant SDK.
Their quote contains `intent_id`, `expires_at`, and a `payment` object with `network`, `token_id`, `decimals`, smallest-unit `amount`, `treasury_account`, and the intent ID as `memo`.
The buyer app preserves that quote, requires the selected network to match, and checks the original deadline before a new send, including after saving its pending-purchase checkpoint.
Missing or unknown quote network/expiry prevents a new send; recovery of an existing intent remains available without passing new-send admission again.
The server verifies the original intent's network and transfer time, so reporting a timely payment later can still recover the purchase.
Merchant `payments.create`, `payments.get`, and `payments.cancel` do not manage Connect intents or translate Connect refusal codes.

### Configuration and errors

```js
const skyzai = new SkyzaiPay({
  apiKey: process.env.SKYZAI_API_KEY,
  pollInterval: 3000,
  timeout: 30000,
  expiryGrace: 120000,
  debug: false,
});
```

The backend URL is `https://us-central1-skyzai-16e1b.cloudfunctions.net`.
An explicit `baseURL` may select a local HTTP test server on `127.0.0.1` or `[::1]`, optionally with an emulator path prefix.
Other remote origins are rejected and HTTP redirects are refused.
Configure local URLs only from trusted application configuration.
Debug output contains method, endpoint name, and HTTP status, never the API key.
JSON HTTP refusals throw the exported `SkyzaiPayError`, an `Error` subclass with `status` (HTTP status), `code` (SDK reason), and a credential-redacted server `message` prefixed with `Skyzai Pay:`.
The same error reaches `Payment.refresh()` and the polling `error` event.
Existing `error.status` checks continue to work.

| `error.code` | HTTP status | Recovery |
| --- | --- | --- |
| `API_KEY_INVALID` | 401 | Supply a valid Skyzai merchant key |
| `API_KEY_EXPIRED` | 401 | The business owner must issue a replacement key |
| `API_KEY_REISSUE_REQUIRED` | 401 | Replace a legacy key issued before revocation support |
| `API_KEY_REVOKED` | 403 | Use the current key after rotation, or have the owner issue a replacement |
| `BUSINESS_NOT_APPROVED` | 403 | Resolve KYB approval, business closure, or account-type eligibility through Skyzai |
| `ACCOUNT_BLOCKED` | 403 | Resolve the business's flag or block through Skyzai |
| `BUSINESS_NOT_FOUND` | 404 | Verify the business linked to the key through Skyzai |
| `TESTNET_NOT_ALLOWED` | 403 | Use the intended production mainnet checkout, or a known non-production server for testnet testing |
| `TOKEN_NOT_CONFIGURED` | 503 | Ask the server operator to configure USDT for the requested network before retrying |
| `AMOUNT_NOT_REPRESENTABLE` | 400 | Supply a representable, safe amount; configured tokens above 18 decimals require an operator configuration change; no invoice was created |
| `HTTP_ERROR` | Any non-success status | Inspect `status` and `message`; includes access denial, missing payment, rate limits, cancellation refusal, and unknown messages |

The HTTP handlers currently return messages without machine-readable codes, so these SDK reasons match known status/message pairs.
An unknown or changed message falls back to `HTTP_ERROR`.
Rotation and explicit revocation share `API_KEY_REVOKED` because the server returns the same refusal for both.
Local validation, transport, timeout, and malformed-response failures remain plain `Error` values.

```js
import { SkyzaiPayError } from 'skyzai-pay';

try {
  await payment.refresh();
} catch (error) {
  if (error instanceof SkyzaiPayError && error.code === 'API_KEY_REVOKED') {
    console.error('Configure the current merchant key, then create a new SDK client.');
  } else {
    throw error;
  }
}
```

Polling stops on 400, 401, 403, or 404 without changing the last known payment status.
After resolving business eligibility or replacing the key, create a new SDK client and fetch the payment again before resuming monitoring.
The SDK does not automatically retry payment creation.

## MIGRATION: aureus-pay 2.x to skyzai-pay 3.0

1. Replace the dependency with `skyzai-pay@^3.0.0` and import `SkyzaiPay`.
2. Supply a Skyzai merchant `apiKey`; remove custom-token/Firebase initialization and old backend configuration.
3. Use the returned `skyzai://pay` QR/deep link and Hedera settlement.
4. Treat `completed` as success; existing `confirmed` callbacks remain supported.
5. Call `payment.refresh()` without an HTTP-client argument and dispose polling with `stopListening()`.
6. Keep buyer completion in the buyer app and merchant credentials on your server.

A deprecated named `AureusPay` export remains as an alias of `SkyzaiPay` only.
It has the same Skyzai-only constructor and behavior; old backend access is removed.
Node.js 16 is no longer supported.

## Local verification

```sh
npm ci
export SKYZAI_APP_ROOT=/path/to/skyzai_app
npm run test:all
```

The [committed server pin](test/server-pin.json) selects the exact Functions revision, currently the reviewed precision-v3 commit.
`SKYZAI_APP_ROOT` supplies a local Git repository containing that commit and installed `functions/node_modules`, including TypeScript and jsonwebtoken.
Before handler startup, both installed package versions must match the pinned Functions lockfile; the source receipt records the verified versions.
Missing or mismatched dependencies fail with instructions to install Functions dependencies matching that lockfile.
The checkout's HEAD and uncommitted source files are not used.
The harness extracts the pinned Functions tree with `git archive` into a unique ignored `test/.cache/` directory, transpiles that source in memory, and runs the SDK through a loopback HTTP server.
Every npm test command prints SDK HEAD, working-tree dirty state and the configured server SHA before tests, including failures.
Missing or malformed pins print `server_sha=unavailable` before the diagnostic.
The combined `test:all` command stops with a nonzero exit if the unit, E2E contract or server-requirement suite fails.
The harness removes the extracted tree on process exit.
Missing, malformed or unavailable pins fail rather than falling back to checkout HEAD.
See [test setup](test/README.md) for the pin and dependency boundary.
It executes real `createGenerateAPIKeyHandler`, `validateJWT`, `createPayment`, `getPayment`, `cancelPayment`, `createCompleteSkyzaiPaymentHandler`, token resolution, transfer evaluation, and payment-summary logic.
It uses the server's `FakeDb`, local fixture signing material, a fake business-owner identity verifier, Firebase wrapper shims, and fake mirror responses with verified transaction IDs.
The merchant fixture is a KYB-approved business with an explicit owner, matching the hardened key-generation and per-request business checks.
Completion tests use a fixed injected clock when comparing receipt timestamps and reject mirror evidence without a transaction ID.
Lifecycle regressions cover delayed completion after an SDK expiry event, consensus exactly at expiry, cancellation of elapsed invoices, and private review evidence retained once across repeated reports.
Network regressions cover production and unidentified-project testnet refusal without an invoice, local testnet USDC/USD settlement, and configured or missing USDT on both networks.
Contract regressions cover create/get/cancel methods and payloads, partial creation data, identity/date normalization, all current statuses, unknown stored values, and cancellation refusals that preserve the invoice.
Unexpected external imports and outbound server fetches fail closed.
No cloud SDK, credentials, real blockchain transfer, or mirror request is used.

The separate server-requirements suite is a release gate for merchant expiry enforcement and JWT-secret bindings.
It must pass against the server version used for release; passing SDK tests alone is insufficient.

The [local dashboard](./examples/skyzai-pay-dash) exercises merchant checkout, polling, cancellation, and receipts.
