// Runs disposable source/handler subprocesses for lifecycle tests; IPC marks readiness and teardown kills/reaps every worker.
import { spawn } from 'node:child_process';
import { once } from 'node:events';

export async function startArchiveWorker(t, script) {
  const child = spawn(process.execPath, ['--input-type=module', '--eval', `
    process.on('message', message => { if (message === 'exit') process.exit(0); });
    ${script}
  `], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  const exited = once(child, 'close').then(([code, signal]) => ({ code, signal }));
  const timeout = setTimeout(() => child.kill('SIGKILL'), 15_000);
  t.after(async () => {
    try {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      await exited;
    } finally {
      clearTimeout(timeout);
    }
  });
  const ready = await Promise.race([
    once(child, 'message').then(([message]) => message),
    exited.then(() => { throw new Error(`Archive worker exited before readiness: ${output}`); }),
  ]);
  return { child, exited, ...ready };
}
