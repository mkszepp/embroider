import glob from 'globby';
import { resolve } from 'path';
import { readFileSync, readJSONSync } from 'fs-extra';
import yaml from 'js-yaml';

export type Range = 'exact' | 'caret';
export interface PkgEntry {
  version: string;
  pkgJSONPath: string;
  dependencies: Map<string, Range>;
  peerDependencies: Map<string, Range>;
}

function workspaceRangeType(range: string): Range | undefined {
  if (!range.startsWith('workspace:')) {
    return;
  }
  switch (range.slice(10)) {
    case '*':
      // this is how pnpm interprets workspace:*
      return 'exact';
    case '^':
      return 'caret';
    default:
      throw new Error(`unsupported workspace dependency type ${range}`);
  }
}

export function publishedInterPackageDeps(): Map<string, PkgEntry> {
  let rootDir = resolve(__dirname, '..', '..', '..');
  let packages: Map<string, PkgEntry> = new Map();
  for (let pattern of (yaml.load(readFileSync(resolve(__dirname, '../../../pnpm-workspace.yaml'), 'utf8')) as any)
    .packages) {
    for (let dir of glob.sync(pattern, { cwd: rootDir, expandDirectories: false, onlyDirectories: true })) {
      let pkgJSONPath = resolve(rootDir, dir, 'package.json');
      let pkg = readJSONSync(pkgJSONPath);
      if (pkg.private) {
        continue;
      }
      let entry: PkgEntry = { version: pkg.version, pkgJSONPath, dependencies: new Map(), peerDependencies: new Map() };
      // no devDeps because changes to devDeps shouldn't ever force us to
      // release
      for (let section of ['dependencies', 'peerDependencies'] as const) {
        if (pkg[section]) {
          for (let [depName, depRange] of Object.entries(pkg[section] as Record<string, string>)) {
            let rangeType = workspaceRangeType(depRange);
            if (rangeType) {
              entry[section].set(depName, rangeType);
            }
          }
        }
      }
      packages.set(pkg.name, entry);
    }
  }
  return packages;
}
