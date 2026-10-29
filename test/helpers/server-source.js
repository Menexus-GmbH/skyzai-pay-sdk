// Pins the actual-handler adapter to a Git archive, never the donor checkout's working files.
// Validates source/deps, cleans archives on exit/signals and prunes dead PID owners without touching live runs or the donor.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const sdkRoot = fileURLToPath(new URL('../..', import.meta.url));
const defaultPinFile = join(sdkRoot, 'test/server-pin.json');
const sourceDirectories = new Set();

function pruneDeadSources(cacheRoot) {
  for (const entry of readdirSync(cacheRoot, { withFileTypes: true })) {
    const match = /^server-[0-9a-f]{40}-([1-9][0-9]*)-[A-Za-z0-9]+$/.exec(entry.name);
    const pid = Number(match?.[1]);
    if (!entry.isDirectory() || !Number.isInteger(pid) || pid > 2147483647) continue;
    try {
      // shortcut: reused PIDs retain stale archives; add process-start identity if PID reuse causes cache growth.
      process.kill(pid, 0);
    } catch (error) {
      if (error.code === 'ESRCH') rmSync(join(cacheRoot, entry.name), { recursive: true, force: true });
      else if (error.code !== 'EPERM') throw error;
    }
  }
}

function cleanSourceOnExit(directory) {
  if (sourceDirectories.size === 0) {
    process.once('exit', () => {
      for (const source of sourceDirectories) rmSync(source, { recursive: true, force: true });
    });
    for (const [signal, code] of [['SIGINT', 130], ['SIGTERM', 143]]) {
      process.once(signal, () => process.exit(code));
    }
  }
  sourceDirectories.add(directory);
}

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

export function verifyServerDependencies(root, dependenciesRoot) {
  const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'));
  const requireServer = createRequire(join(dependenciesRoot, 'package.json'));
  const versions = {};
  for (const name of ['typescript', 'jsonwebtoken']) {
    const expected = lock.packages?.[`node_modules/${name}`]?.version;
    if (typeof expected !== 'string' || !expected) {
      throw new Error(`Pinned Functions lockfile has no version for ${name}.`);
    }
    let installed;
    try {
      installed = JSON.parse(readFileSync(requireServer.resolve(`${name}/package.json`), 'utf8')).version;
    } catch (error) {
      throw new Error(`Cannot resolve Functions dependency ${name} from ${dependenciesRoot}; install Functions dependencies matching the pinned lockfile.`, { cause: error });
    }
    if (installed !== expected) {
      throw new Error(`Functions dependency mismatch for ${name}: expected ${expected} from the pinned lockfile, found ${installed} in ${dependenciesRoot}; install Functions dependencies matching the pinned lockfile.`);
    }
    versions[name] = installed;
  }
  return versions;
}

export function prepareServerSource({ repository = process.env.SKYZAI_APP_ROOT, pinFile = defaultPinFile, cacheRoot = join(sdkRoot, 'test/.cache') } = {}) {
  const sha = readServerPin(pinFile);
  if (!repository) throw new Error('Set SKYZAI_APP_ROOT to a local skyzai_app Git repository containing the pinned commit and installed Functions dependencies.');
  repository = resolve(repository);
  const git = args => execFileSync('git', ['-C', repository, ...args], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, GIT_NO_REPLACE_OBJECTS: '1' },
  });
  let type;
  try {
    type = git(['cat-file', '-t', sha]).trim();
  } catch (error) {
    throw new Error(`Server pin ${sha} is not available in ${repository}; supply a local skyzai_app repository containing that commit.`, { cause: error });
  }
  if (type !== 'commit') throw new Error(`Server pin ${sha} must name a commit object; found ${type}.`);
  try {
    if (git(['cat-file', '-t', `${sha}:functions/src`]).trim() !== 'tree') {
      throw new Error('functions/src is not a directory.');
    }
  } catch (error) {
    throw new Error(`Pinned server commit ${sha} must contain the functions/src directory; choose a server pin with the Functions source layout.`, { cause: error });
  }
  mkdirSync(cacheRoot, { recursive: true });
  pruneDeadSources(cacheRoot);
  const directory = mkdtempSync(join(cacheRoot, `server-${sha}-${process.pid}-`));
  const cleanup = () => rmSync(directory, { recursive: true, force: true });
  try {
    const archive = join(directory, 'functions.tar');
    git(['archive', '--format=tar', '--output', archive, sha, 'functions']);
    execFileSync('tar', ['-xf', archive, '-C', directory], { stdio: ['ignore', 'pipe', 'pipe'] });
    rmSync(archive);
    const root = join(directory, 'functions');
    const dependenciesRoot = join(repository, 'functions');
    const dependencyVersions = verifyServerDependencies(root, dependenciesRoot);
    const sdkSha = execFileSync('git', ['-C', sdkRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    console.info(`[skyzai test source] sdk_sha=${sdkSha} server_sha=${sha} typescript=${dependencyVersions.typescript} jsonwebtoken=${dependencyVersions.jsonwebtoken} source=git-archive`);
    cleanSourceOnExit(directory);
    return { root, dependenciesRoot, dependencyVersions, sha, sdkSha };
  } catch (error) {
    cleanup();
    throw new Error(`Could not prepare Functions for server pin ${sha}: ${error.message}`, { cause: error });
  }
}
