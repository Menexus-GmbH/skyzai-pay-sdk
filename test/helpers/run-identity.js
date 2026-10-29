// Preloaded by every npm test command; prints source identities before any test or pin-admission failure.
// Reads SDK Git state and the committed server config; unavailable Git fails clearly after the partial receipt.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readServerPin } from './server-source.js';

const root = fileURLToPath(new URL('../..', import.meta.url));
const git = args => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
let sdkSha = 'unavailable';
let dirty = 'unavailable';
let gitError;
try {
  sdkSha = git(['rev-parse', 'HEAD']);
  dirty = git(['status', '--porcelain']).length > 0;
} catch (error) {
  gitError = error.code === 'ENOENT'
    ? new Error('Git is required to run Skyzai SDK tests; install Git and ensure git is on PATH.', { cause: error })
    : error;
}
let serverSha = 'unavailable';
let pinError;
try {
  serverSha = readServerPin();
} catch (error) {
  pinError = error;
}
console.info(`[skyzai test run] sdk_sha=${sdkSha} sdk_dirty=${dirty} server_sha=${serverSha}`);
if (gitError) throw gitError;
if (pinError) throw pinError;
