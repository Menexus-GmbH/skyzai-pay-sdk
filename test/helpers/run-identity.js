// Preloaded by every npm test command; prints source identities before any test or pin-admission failure.
// Reads SDK Git state and the committed server config only, without preparing archives or loading dependencies.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readServerPin } from './server-source.js';

const root = fileURLToPath(new URL('../..', import.meta.url));
const git = args => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
const sdkSha = git(['rev-parse', 'HEAD']);
const dirty = git(['status', '--porcelain']).length > 0;
let serverSha = 'unavailable';
let pinError;
try {
  serverSha = readServerPin();
} catch (error) {
  pinError = error;
}
console.info(`[skyzai test run] sdk_sha=${sdkSha} sdk_dirty=${dirty} server_sha=${serverSha}`);
if (pinError) throw pinError;
