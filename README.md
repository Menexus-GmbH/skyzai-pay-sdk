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

Obtain a merchant API key from Skyzai's `generateAPIKey` flow for a KYB-approved business that you administer.
The key is an HS256 JWT containing a `keyId` linked to the server's `APIKeys` record.
The SDK sends it as `Authorization: Bearer <apiKey>` to `createPayment`, `getPayment`, and `cancelPayment`.
A Firebase custom token or Firebase ID token cannot replace this merchant key.
Expired or revoked keys must be replaced through Skyzai.

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
It does not sign in to Firebase or access Firestore directly.
The server stores these requests in `transactions`.

| Event | Meaning |
| --- | --- |
| `status_change` | Server status changed; argument is the status string |
| `completed` | Server verified settlement; argument is the updated `Payment` |
| `confirmed` | Compatibility success callback, also emitted for `completed` |
| `expired`, `failed`, `cancelled` | Terminal server state; argument is the updated `Payment` |
| `error` | HTTP, authentication, or transport failure; argument is an `Error` |
| `monitoring_stopped` | Expiry grace elapsed; argument is the `Payment` with the last server status |

Subscribe to either `completed` or `confirmed` for fulfillment, so you do not handle success twice.
Always attach an `error` listener before starting monitoring.
Terminal states stop polling automatically.
Authentication, access, and missing-payment errors also stop polling; transient errors are reported and retried on the next interval.
Calling `startListening()` repeatedly does not create duplicate polling loops.
`stopListening()` suppresses an in-flight poll's result and prevents further polling.

`isExpired()` checks the server's `expiresAt` against the local clock for a pending request, or returns true for server status `expired`.
It does not invent a server status or confirm a payment.
At `expiresAt + expiryGrace` (two minutes by default), monitoring makes one final `getPayment` request, surfaces the result, and stops even if the server still says `pending`.
In that case `monitoring_stopped` reports the final server status without fabricating `expired` or success.
If the final request fails, `error` is emitted and `monitoring_stopped` carries the last known status.
The backend enforces settlement expiry separately; see the server release gate below.

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
HTTP errors expose `error.status` and the server message, including 401 invalid/expired key, 403 revoked key or access denied, 404 missing payment, 429 rate limit, and 503 unconfigured currency.
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
It uses the server's `FakeDb`, local fixture signing material, a fake admin identity verifier, Firebase wrapper shims, and fake mirror responses.
Unexpected external imports and outbound server fetches fail closed.
No cloud SDK, credentials, real blockchain transfer, or mirror request is used.

The separate server-requirements suite is a release gate for merchant expiry enforcement and JWT-secret bindings.
It must pass against the server version used for release; passing SDK tests alone is insufficient.

The [local dashboard](./examples/skyzai-pay-dash) exercises merchant checkout, polling, cancellation, and receipts.
