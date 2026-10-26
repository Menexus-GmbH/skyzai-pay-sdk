# Skyzai Pay local dashboard

A React/Vite checkout demo using the local `skyzai-pay` package.
It supports USDC on Hedera mainnet, `skyzai://pay` QR codes, server status polling, cancellation, and receipts.

```sh
npm ci
npm run dev
```

Enter a Skyzai merchant API key in Settings.
The key is held in memory for the current session and is validated by the server when a request is made.
This browser example is for a trusted local merchant workstation only.
For a public storefront, keep merchant credentials on your own server and expose authenticated checkout routes to your frontend.

Checkout displays server refusal messages for revoked keys, lost KYB approval, closure, and account flags.
Replace a rotated or revoked key in Settings with the current owner-issued key.
Business approval and flag refusals require resolving eligibility through Skyzai; replacing the key alone does not resolve them.
Neither refusal means the invoice was cancelled or paid.

An expired invoice can still complete when the buyer reports a transfer made before expiry.
The demo stops monitoring on expiry and has no saved-invoice recovery screen; retain the payment ID and recheck it through your merchant integration before starting another charge.
Use `payment.refresh()` on an existing SDK object or `terminal.payments.get(paymentId)` to retrieve the latest result.
Cancellation withdraws the request but does not reverse a transfer or issue a refund.
Late or cancelled deposits may require Skyzai operator review, which is not exposed by merchant get/cancel responses.
See the [expiry and delayed-settlement contract](../../README.md#expiry-cancellation-and-delayed-settlement).

Integrations can use the exported error type before starting their own monitoring:

```js
import { SkyzaiPayError } from 'skyzai-pay';

payment.on('error', error => {
  if (error instanceof SkyzaiPayError && error.code === 'API_KEY_REVOKED') {
    console.error('Replace the merchant key in Settings and fetch the payment again.');
  } else {
    console.error(error.message);
  }
});
payment.startListening();
```

See the [SDK error codes](../../README.md#configuration-and-errors) for all refusal reasons and recovery steps.

The demo uses the production Skyzai endpoint by default and can create real payment requests.
The automated SDK tests instead use loopback HTTP and fake chain/mirror data; they never make real payments.

```sh
npm run lint
npm run build
```
