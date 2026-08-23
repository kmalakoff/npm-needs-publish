import spawn from 'cross-spawn-cb';
import fs from 'fs';
import os from 'os';
import path from 'path';

export type PackCallback = (error: Error | null, tarball?: Buffer) => void;

// Packs with the npm the user publishes with, so `files`, `.npmignore` and
// `prepare` scripts are honoured exactly as they will be at publish time.
export function npmPack(cwd: string, callback: PackCallback): void {
  let outDir: string;
  try {
    outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'npm-needs-publish-'));
  } catch (err) {
    return callback(err as Error);
  }

  // `npm pack <dir>` writes into the process cwd on npm 3 through 11;
  // --pack-destination only exists from npm 7.18.
  spawn('npm', ['pack', cwd], { cwd: outDir, encoding: 'utf8' }, (spawnError) => {
    if (spawnError) {
      remove(outDir);
      return callback(spawnError);
    }

    let tarball: Buffer;
    try {
      // Read the directory rather than stdout: npm's pack output format has
      // changed across majors, the directory contents have not.
      const produced = fs.readdirSync(outDir).filter((entry) => entry.slice(-4) === '.tgz');
      if (produced.length !== 1) throw new Error(`npm pack produced ${produced.length} tarballs, expected 1`);
      tarball = fs.readFileSync(path.join(outDir, produced[0]));
    } catch (err) {
      remove(outDir);
      return callback(err as Error);
    }

    remove(outDir);
    callback(null, tarball);
  });
}

// Best-effort: a leaked temp dir must never fail the publish check.
function remove(dir: string): void {
  try {
    const entries = fs.readdirSync(dir);
    for (let i = 0; i < entries.length; i++) {
      try {
        fs.unlinkSync(path.join(dir, entries[i]));
      } catch {
        /* ignore */
      }
    }
    fs.rmdirSync(dir);
  } catch {
    /* ignore */
  }
}
