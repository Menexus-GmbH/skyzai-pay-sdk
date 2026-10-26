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
USDC and USD amounts with more than six decimal places, an unsafe integer number of smallest units, or precision loss in the server's numeric conversion are rejected before sending.
Use strings to preserve decimals; exponent notation is not accepted.

`currency` accepts `USDC`, `USD` (settled in USDC), or `USDT`.
USDT requires server-side token configuration and otherwise returns HTTP 503.
`network` defaults to `mainnet`; `testnet` is refused by the production server.
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
| `expired`, `failed`, `cancelled` | Server result that stops monitoring; argument is the updated `Payment` |
| `error` | HTTP, authentication, or transport failure; argument is an `Error` |
| `monitoring_stopped` | Expiry grace elapsed; argument is the `Payment` with the last server status |

Subscribe to either `completed` or `confirmed` for fulfillment, so you do not handle success twice.
Always attach an `error` listener before starting monitoring.
Completed, confirmed, expired, failed, and cancelled results stop polling automatically.
Authentication, access, and missing-payment errors also stop polling; transient errors are reported and retried on the next interval.
Calling `startListening()` repeatedly does not create duplicate polling loops.
`stopListening()` suppresses an in-flight poll's result and prevents further polling.

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
| `HTTP_ERROR` | Any non-success status | Inspect `status` and `message`; includes access denial, missing payment, rate limits, unconfigured currency, cancellation refusal, and unknown messages |

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
npm test
SKYZAI_APP_ROOT=/path/to/skyzai_app npm run test:e2e
SKYZAI_APP_ROOT=/path/to/skyzai_app npm run test:server-requirements
```

The Skyzai checkout must have its `functions/node_modules` installed, including TypeScript and jsonwebtoken.
The harness transpiles the actual server source in memory and runs the SDK through a loopback HTTP server.
It executes real `createGenerateAPIKeyHandler`, `validateJWT`, `createPayment`, `getPayment`, `cancelPayment`, `createCompleteSkyzaiPaymentHandler`, token resolution, transfer evaluation, and payment-summary logic.
It uses the server's `FakeDb`, local fixture signing material, a fake business-owner identity verifier, Firebase wrapper shims, and fake mirror responses with verified transaction IDs.
The merchant fixture is a KYB-approved business with an explicit owner, matching the hardened key-generation and per-request business checks.
Completion tests use a fixed injected clock when comparing receipt timestamps and reject mirror evidence without a transaction ID.
Lifecycle regressions cover delayed completion after an SDK expiry event, consensus exactly at expiry, cancellation of elapsed invoices, and private review evidence retained once across repeated reports.
Unexpected external imports and outbound server fetches fail closed.
No cloud SDK, credentials, real blockchain transfer, or mirror request is used.

The separate server-requirements suite is a release gate for merchant expiry enforcement and JWT-secret bindings.
It must pass against the server version used for release; passing SDK tests alone is insufficient.

The [local dashboard](./examples/skyzai-pay-dash) exercises merchant checkout, polling, cancellation, and receipts.
