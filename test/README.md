# Local SDK test fixtures

These Node test suites exercise SDK behavior and the merchant HTTP contract without cloud credentials, provider requests or chain transfers.
`npm test` runs SDK units and source-pin admission tests.
`npm run test:e2e` runs SDK requests over loopback HTTP against actual server handlers.
`npm run test:server-requirements` checks the source boundary and the server expiry/JWT requirements.
The handler adapter still uses the server's FakeDb and fake Mirror evidence; it does not qualify real Firestore transactions or native buyer transport.

## Pinned Functions source

`server-pin.json` is the source revision consumed by both handler suites.
The baseline is server commit `06ced3371528a871849156a70a114e457215b1be`, the reviewed PAYSDK-PRECISION-V3-1027 fix, rather than the moving development tip.
Changing the pin requires rerunning all suites and reviewing the resulting SDK/server contract.
This baseline is not a claim about the latest server revision or deployed behavior.

Set `SKYZAI_APP_ROOT` to an existing local `skyzai_app` Git repository containing that exact commit.
The helper verifies the commit exists, archives its `functions/` tree into a unique directory under ignored `test/.cache/`, and removes that directory when the process exits.
Each handler suite prints the SDK HEAD and pinned server SHA before loading handlers.
SDK edits made after HEAD are still part of the tested working tree.
There is no fetch, checkout, worktree, installation or modification of the server repository.
Missing config, a non-full SHA or an unavailable commit fails before handler startup.

Only TypeScript, jsonwebtoken and their runtime dependencies come from the donor repository's existing `functions/node_modules`.
They are read-only inputs, not installed automatically by these tests.
The verified local donor provides TypeScript 5.9.3 and jsonwebtoken 9.0.3, matching those entries in the pinned Functions lockfile.
The helper does not enforce a complete dependency-lock match.
Unexpected handler imports and outbound server fetches remain forbidden by `helpers/skyzai-server.js`.

Use Node 22 through fnm for this test foundation:

```sh
eval "$(fnm env --shell zsh)"
fnm use 22.23.3
export SKYZAI_APP_ROOT=/Users/darkness/Work/Aureus/skyzai_app
npm test
npm run test:e2e
npm run test:server-requirements
```
