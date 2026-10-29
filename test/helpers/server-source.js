// Pins the actual-handler adapter to a Git archive, never the donor checkout's working files.
// Reads local Git/Functions dependencies only; creates disposable archives under test/.cache and removes them at exit.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const sdkRoot = fileURLToPath(new URL('../..', import.meta.url));
const defaultPinFile = join(sdkRoot, 'test/server-pin.json');

export function readServerPin(pinFile = defaultPinFile) {
  let pin;
  try {
    pin = JSON.parse(readFileSync(pinFile, 'utf8'));
  } catch (error) {
    throw new Error(`${error.code === 'ENOENT' ? 'Missing' : 'Invalid'} server pin at ${pinFile}; expected JSON with a full commit SHA.`, { cause: error });
  }
  if (typeof pin?.sha !== 'string' || !/^[0-9a-f]{40}$/.test(pin.sha)) {
    throw new Error(`Server pin at ${pinFile} must contain a 40-character lowercase commit SHA in "sha".`);
  }
  return pin.sha;
}

export function prepareServerSource({ repository = process.env.SKYZAI_APP_ROOT, pinFile = defaultPinFile, cacheRoot = join(sdkRoot, 'test/.cache') } = {}) {
  const sha = readServerPin(pinFile);
  if (!repository) throw new Error('Set SKYZAI_APP_ROOT to a local skyzai_app Git repository containing the pinned commit and installed Functions dependencies.');
  repository = resolve(repository);
  const git = args => execFileSync('git', ['-C', repository, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    git(['rev-parse', '--verify', `${sha}^{commit}`]);
  } catch (error) {
    throw new Error(`Server pin ${sha} is not available in ${repository}; supply a local skyzai_app repository containing that commit.`, { cause: error });
  }
  mkdirSync(cacheRoot, { recursive: true });
  const directory = mkdtempSync(join(cacheRoot, `server-${sha}-`));
  const cleanup = () => rmSync(directory, { recursive: true, force: true });
  try {
    const archive = join(directory, 'functions.tar');
    git(['archive', '--format=tar', '--output', archive, sha, 'functions']);
    execFileSync('tar', ['-xf', archive, '-C', directory], { stdio: ['ignore', 'pipe', 'pipe'] });
    rmSync(archive);
    const sdkSha = execFileSync('git', ['-C', sdkRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    console.info(`[skyzai test source] sdk_sha=${sdkSha} server_sha=${sha} source=git-archive`);
    process.once('exit', cleanup);
    return { root: join(directory, 'functions'), dependenciesRoot: join(repository, 'functions'), sha, sdkSha };
  } catch (error) {
    cleanup();
    throw new Error(`Could not archive Functions for server pin ${sha}.`, { cause: error });
  }
}
