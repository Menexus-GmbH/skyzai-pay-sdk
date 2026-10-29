// Reproduces combined-runner failures in disposable SDK copies using the real suites and read-only server donor.
// Invoked separately by test:prove-failures to avoid recursion; retains logs and removes copies/child processes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readServerPin } from './helpers/server-source.js';

test('combined runner rejects mutations and passes restored source without changing the checkout', async t => {
  assert.ok(process.env.SKYZAI_APP_ROOT, 'Set SKYZAI_APP_ROOT to the read-only server donor.');
  const root = fileURLToPath(new URL('..', import.meta.url));
  const cache = join(root, 'test/.cache');
  mkdirSync(cache, { recursive: true });
  const evidence = mkdtempSync(join(cache, 'runner-proofs-'));
  t.diagnostic(`Reproducible failure receipts: ${evidence}`);
  const originalPaths = ['test/server-pin.json', 'test/payment.e2e.test.js', 'test/server-requirements.test.js'];
  const originals = originalPaths.map(path => readFileSync(join(root, path)));
  t.after(() => originalPaths.forEach((path, index) => assert.deepEqual(readFileSync(join(root, path)), originals[index])));
  const sha = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const pin = readServerPin();
  const receipts = [];
  const allSuites = ['test', 'test:e2e', 'test:server-requirements'];
  const cases = [
    { name: 'missing-pin', suites: allSuites.slice(0, 1), diagnostic: 'Missing server pin at', server: 'unavailable' },
    { name: 'wrong-pin', suites: allSuites.slice(0, 2), diagnostic: `Server pin ${'0'.repeat(40)} is not available`, server: '0'.repeat(40) },
    { name: 'broken-e2e', suites: allSuites.slice(0, 2), diagnostic: 'P1_DELIBERATE_E2E_FAILURE', server: pin },
    { name: 'broken-server-gate', suites: allSuites, diagnostic: 'must bind JWT_SECRET', server: pin },
    { name: 'restored', suites: allSuites, server: pin },
  ];
  for (const scenario of cases) {
    await t.test(scenario.name, async t => {
      const fixture = mkdtempSync(join(evidence, 'sdk-'));
      t.after(() => rmSync(fixture, { recursive: true, force: true }));
      mkdirSync(join(fixture, 'test/.cache'), { recursive: true });
      const paths = ['package.json', 'package-lock.json', 'src', ...readdirSync(join(root, 'test')).filter(name => name !== '.cache').map(name => `test/${name}`)];
      for (const path of paths) cpSync(join(root, path), join(fixture, path), { recursive: true });
      const mutate = (path, before, after) => {
        const target = join(fixture, path);
        const source = readFileSync(target, 'utf8');
        assert.ok(source.includes(before), `Mutation target missing: ${path}`);
        writeFileSync(target, source.replace(before, after));
      };
      if (scenario.name === 'missing-pin') rmSync(join(fixture, originalPaths[0]));
      if (scenario.name === 'wrong-pin') writeFileSync(join(fixture, originalPaths[0]), JSON.stringify({ sha: scenario.server }));
      if (scenario.name === 'broken-e2e') mutate(originalPaths[1], "assert.equal(payment.status, 'pending');", "assert.equal(payment.status, 'P1_DELIBERATE_E2E_FAILURE');");
      if (scenario.name === 'broken-server-gate') mutate(originalPaths[2], "secret === 'JWT_SECRET' || secret.name === 'JWT_SECRET'", "secret === 'P1_DELIBERATE_GATE_FAILURE' || secret.name === 'P1_DELIBERATE_GATE_FAILURE'");

      const env = { ...process.env, SKYZAI_APP_ROOT: resolve(process.env.SKYZAI_APP_ROOT) };
      // These are independent test runners, not nested files of the outer Node runner.
      delete env.NODE_TEST_CONTEXT;
      const child = spawn('npm', ['run', 'test:all'], { cwd: fixture, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
      let output = '';
      child.stdout.on('data', chunk => { output += chunk; });
      child.stderr.on('data', chunk => { output += chunk; });
      const stop = () => {
        try { process.kill(-child.pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
      };
      const timeout = setTimeout(stop, 60_000);
      let status;
      let signal;
      try {
        [status, signal] = await once(child, 'close');
      } finally {
        clearTimeout(timeout);
        if (child.pid && child.exitCode === null && child.signalCode === null) stop();
        writeFileSync(join(evidence, `${scenario.name}.log`), output);
      }
      assert.equal(signal, null, output);
      assert.equal(status, scenario.name === 'restored' ? 0 : 1, output);
      const packageJson = JSON.parse(readFileSync(join(fixture, 'package.json'), 'utf8'));
      const observed = output.split('\n').filter(line => allSuites.some(suite => line === `> ${packageJson.name}@${packageJson.version} ${suite}`));
      assert.deepEqual(observed, scenario.suites.map(suite => `> ${packageJson.name}@${packageJson.version} ${suite}`), output);
      const identities = output.match(/\[skyzai test run\].*/g) || [];
      assert.ok(identities.length > 0, output);
      for (const identity of identities) assert.match(identity, new RegExp(`^\\[skyzai test run\\] sdk_sha=${sha} sdk_dirty=(true|false) server_sha=${scenario.server}$`));
      if (scenario.diagnostic) assert.ok(output.includes(scenario.diagnostic), output);
      else assert.deepEqual(output.match(/^# fail \d+$/gm), ['# fail 0', '# fail 0', '# fail 0'], output);
      assert.deepEqual(readdirSync(join(fixture, 'test/.cache')).filter(name => name.startsWith('server-')), []);
      receipts.push({ case: scenario.name, command: 'npm run test:all', exit: status, suites: scenario.suites, identities });
      writeFileSync(join(evidence, 'receipts.json'), JSON.stringify(receipts, null, 2) + '\n');
    });
  }
});
