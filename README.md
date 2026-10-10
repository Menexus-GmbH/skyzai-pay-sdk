# Aureus Pay SDK

Create and monitor merchant payment requests with the Aureus or Skyzai backend.
Keep merchant credentials on your server.
The SDK reports backend status; it does not independently verify blockchain settlement.

## Install and import

```sh
npm install aureus-pay
```

Node.js 18 or newer is required.
This package is ESM.

```js
import AureusPay, { Payment } from 'aureus-pay';
```

From CommonJS, use dynamic import inside an async function:

```js
const { default: AureusPay } = await import('aureus-pay');
```

## Configure authentication on your server

Aureus is the default backend and requires a merchant API-key JWT:

```js
const aureus = new AureusPay({ apiKey: process.env.AUREUS_API_KEY });
```

Skyzai requires the merchant's Firebase ID token, not an Aureus API key or a Firebase custom token:

```js
const skyzai = new AureusPay({
  backend: 'skyzai',
  getIdToken: async () => merchantSession.getIdToken(true)
});
```

`merchantSession` represents your server's authenticated merchant-session integration.
Supply a callback that obtains a fresh ID token when called again.
The callback runs for every request, and once more on a 401 before a single retry.
A Firebase Admin SDK custom token must first be exchanged for an ID token; it is not accepted directly.
Do not use a buyer's token for merchant requests.

| Configuration | Behavior |
|---|---|
| `backend` | `'aureus'` (default) or `'skyzai'` |
| `apiKey` | Required only for Aureus; cannot be combined with `getIdToken` |
| `getIdToken` | Required only for Skyzai; async callback returning a non-empty token |
| `baseURL` | Optional HTTPS endpoint configured by the merchant server operator |

Defaults are `https://us-central1-aureus-money.cloudfunctions.net` and `https://us-central1-skyzai-16e1b.cloudfunctions.net` respectively.
Never derive `baseURL` from buyer input, metadata, a feed or a third party.
Credentials are intentionally sent to the configured endpoint, so use only an endpoint you control and trust for that backend.
Requests use HTTPS (plain HTTP is allowed only for `localhost`, for the Firebase emulator), do not follow redirects or proxies, and responses are capped at 1 MiB.
Local fake-server tests replace the HTTP adapter; localhost is not a production endpoint.

There is no SDK `environment` or testnet switch.
Network/token availability and payment expiry are controlled by the selected backend.
This SDK does not promise general EVM support or implement hosted checkout, webhooks, refunds or chain verification.

## Create, retrieve and cancel

```js
const payment = await aureus.payments.create({
  amount: '10.00',
  currency: 'USDC',
  orderId: 'ORDER_123',
  metadata: { productId: 'product-123' }
});

const current = await aureus.payments.get(payment.id);
const cancelled = await aureus.payments.cancel(payment.id);
await current.refresh();
```

`amount` must be a positive decimal and `currency` must be `USDC`, `USDT` or `USD`.
Backend configuration decides which currencies can actually be paid.
Compute price, quantity and merchant identity on your server using trusted order records.
`metadata` must be an object.
`orderId` is copied to `metadata.orderId`, overriding a value there if both are supplied.
It is a reconciliation reference, not server-enforced order binding or an idempotency key.
Persist payment/order linkage and enforce fulfillment once in your own database.
Cancellation is subject to backend rules and can fail; do not assume a cancelled request reverses a transfer.

Create responses missing identity, metadata or creation/update timestamps are refreshed once via `getPayment` before returning.
If that refresh fails, create rejects even though the backend may already have created the payment.
Inspect the error's cause and reconcile the order before retrying; creation is not idempotent.

## Payment data and monitoring

`Payment` exposes `id`/`paymentId`, `uId`/`userId`, `amount`, `currency`, `status`, `metadata`, `orderId`, `destinations`, `txHash`, `userEmail`, `userName`, `qrCode`, `qrUri` and `deepLink`.
`createdAt`, `updatedAt`, `expiresAt` and `confirmedAt` are `Date` objects when supplied, otherwise `null`.
Both backend identity spellings are normalized.

```js
payment.on('confirmed', data => {
  // Reconcile backend evidence and fulfill your stored order idempotently.
  console.log('Backend reports paid:', data.paymentId, data.txHash);
});
payment.on('expired', () => console.log('Payment expired'));
payment.on('cancelled', () => console.log('Payment cancelled'));
payment.on('failed', data => console.log('Payment failed:', data.status));
payment.on('error', error => console.error(error.message));
payment.startListening();
// On shutdown or when monitoring is no longer needed:
// payment.stopListening();
```

Both backend statuses `completed` and `confirmed` mean paid to the SDK.
`confirmed` and the new `paid` alias each emit once per Payment instance with backend data.
Subscribe to one of these for fulfillment to avoid running your handler twice.
`status` and `status_change` retain the backend's raw status.
Pending and processing payments continue polling; completed, confirmed, expired, cancelled and failed stop polling.
An already-terminal payment emits its terminal event synchronously when listening starts, so register handlers first.
Repeated starts do not duplicate terminal events.

Polling waits 3 seconds before the first request and 3 seconds after each completed request, so requests never overlap.
The legacy signature `startListening(apiClient, intervalMs)` remains supported; use `startListening(undefined, 1000)` to change only the interval.
A polling error stops listening and emits `error`; always register an error handler before starting, then explicitly restart after resolving the problem.
`refresh()` uses the bound client, with `refresh(apiClient)` retained for compatibility.
`getStatus()`, `getQRCode()`, `getDeepLink()` and `isExpired()` remain available.
The local clock expiry check does not write or infer a backend terminal status.

## Server creates, browser renders

Your authenticated server route must load an order belonging to the buyer and derive the price from its stored product data.
This Express-style example assumes your existing `requireBuyer`, `orders` and `aureus` integration:

```js
app.post('/api/orders/:orderId/payment', requireBuyer, async (req, res, next) => {
  try {
    const order = await orders.getForBuyer(req.params.orderId, req.user.id);
    if (!order || order.status !== 'unpaid') return res.sendStatus(409);
    const payment = await aureus.payments.create({
      amount: order.total,
      currency: order.currency,
      orderId: order.id
    });
    await orders.attachPayment(order.id, payment.id);
    res.json({ paymentId: payment.id, qrUri: payment.qrUri, deepLink: payment.deepLink });
  } catch (error) {
    next(error);
  }
});
```

Add your application's CSRF protection and an atomic order reservation/idempotency guard before allowing concurrent creates.
Run server monitoring or reconciliation jobs against the stored payment ID and authorized order.
A browser must query your own authorized order-status route, rather than receiving merchant credentials or calling merchant payment APIs directly.
Do not send merchant profiles or arbitrary metadata to buyers.

`qrCode` and `qrUri` contain a URI such as `aureus://pay?id=...` or `skyzai://pay?id=...`, not an image.
Render that URI with a QR library, for example `react-qr-code`:

```jsx
import QRCode from 'react-qr-code';

// checkout is the safe JSON returned by your server route.
export function PaymentQR({ checkout }) {
  return (
    <div>
      <QRCode value={checkout.qrUri} title="Scan with your payment wallet" />
      <p>Scan with your wallet to pay.</p>
    </div>
  );
}
```

Install the renderer separately with `npm install react-qr-code`.
Wallet URI support depends on the installed app and platform; the SDK does not supply an app-install fallback or guarantee browser deep-link handling.

## Development and release

```sh
npm ci
npm test
npm pack --dry-run
```

Tests use fake local HTTP responses and do not call either real backend.
Version 2.1.0 adds backend/auth configuration and the paid alias, repairs monitoring and response handling, corrects QR/order/module/security documentation, and requires Node 18+.
The dashboard example is a legacy merchant-browser terminal, not a safe public buyer-checkout template.
Its completion listener is updated, but move its credential handling to a server before using it as a public checkout.

[Source](https://github.com/Menexus-GmbH/aureus-pay-sdk) · [Issues](https://github.com/Menexus-GmbH/aureus-pay-sdk/issues)
MIT License - see [LICENSE](LICENSE).
