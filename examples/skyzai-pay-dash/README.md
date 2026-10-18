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

The demo uses the production Skyzai endpoint by default and can create real payment requests.
The automated SDK tests instead use loopback HTTP and fake chain/mirror data; they never make real payments.

```sh
npm run lint
npm run build
```
