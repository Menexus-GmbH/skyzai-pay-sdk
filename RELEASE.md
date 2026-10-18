# Skyzai Pay 3.0.0 release handoff

These are TYPE-THIS instructions for Ramesh.
No push, publish, repository rename, or cloud operation was performed by the SDK worker.
The package uses the Skyzai merchant API-key contract approved by the overseer on 2026-10-18.

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
