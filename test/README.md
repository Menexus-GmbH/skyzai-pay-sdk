# Local SDK test fixtures

These Node test suites exercise SDK behavior and the merchant HTTP contract without cloud credentials, provider requests or chain transfers.
`npm run test:all` runs all three suites in order and exits nonzero as soon as a suite fails.
`npm test` runs SDK units, source-pin admission tests and the run-identity regression.
`npm run test:e2e` runs SDK requests over loopback HTTP against actual server handlers.
`npm run test:server-requirements` checks the source boundary and the server expiry/JWT requirements.
The handler adapter still uses the server's FakeDb and fake Mirror evidence; it does not qualify real Firestore transactions or native buyer transport.

## Pinned Functions source

`server-pin.json` is the source revision consumed by both handler suites.
The baseline is server commit `06ced3371528a871849156a70a114e457215b1be`, the reviewed PAYSDK-PRECISION-V3-1027 fix, rather than the moving development tip.
Changing the pin requires rerunning all suites and reviewing the resulting SDK/server contract.
This baseline is not a claim about the latest server revision or deployed behavior.

Set `SKYZAI_APP_ROOT` to an existing local `skyzai_app` Git repository containing that exact commit.
The helper requires the SHA to name a commit object directly, archives its `functions/` tree into a unique directory under ignored `test/.cache/`, and removes that directory when the process exits.
Tag, tree and blob object SHAs fail admission; `GIT_NO_REPLACE_OBJECTS=1` keeps local replacement refs from changing either the object type or archived source.
Before allocating an archive, the helper requires the pinned commit to contain the `functions/src` directory; missing Functions/source directories or a file at that path fail with a clear source-layout diagnostic.
Every npm test command preloads `helpers/run-identity.js` to print SDK HEAD, `sdk_dirty` and the configured server SHA before any tests, including failures.
Missing or malformed pins print `server_sha=unavailable` before the pin diagnostic; an unavailable Git object prints the requested SHA before failing admission.
`sdk_dirty=true` means the tested working tree includes tracked edits or untracked files beyond HEAD.
Direct Node invocations need `--import ./test/helpers/run-identity.js` for the same receipt.
There is no fetch, checkout, worktree, installation or modification of the server repository.
Missing config, a non-full SHA or an unavailable commit fails before handler startup.

Only TypeScript, jsonwebtoken and their runtime dependencies come from the donor repository's existing `functions/node_modules`.
They are read-only inputs, not installed automatically by these tests.
The verified local donor provides TypeScript 5.9.3 and jsonwebtoken 9.0.3, matching those entries in the pinned Functions lockfile.
Before loading either module, the helper checks its resolved installed package version against the archived `functions/package-lock.json`.
Missing packages or version mismatches fail with an `install Functions dependencies matching the pinned lockfile` diagnostic.
The `[skyzai test source]` receipt includes the verified `typescript` and `jsonwebtoken` versions beside the SDK and server SHAs.
This checks those two direct dependencies, not the complete transitive dependency tree or package integrity.
Unexpected handler imports and outbound server fetches remain forbidden by `helpers/skyzai-server.js`.

Use Node 22 through fnm for this test foundation:

```sh
eval "$(fnm env --shell zsh)"
fnm use 22.23.3
export SKYZAI_APP_ROOT=/Users/darkness/Work/Aureus/skyzai_app
npm run test:all
```

The combined command uses the three existing npm scripts and their exit codes, with no CI workflow or network setup.
The [P1 change report](../docs/changes/TEST-BATCH0-PAY-1029.md) records the missing/wrong pin and deliberate E2E/server-gate failure proofs.
