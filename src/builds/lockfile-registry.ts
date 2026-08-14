/**
 * Foreign lockfile-registry detection.
 *
 * Lockfiles produced inside sandboxed IDEs (Replit's `package-firewall`
 * mirror is the canonical case) pin every tarball's `resolved` URL to a host
 * that only exists inside that sandbox. `npm ci` then resolves metadata fine
 * but dies downloading tarballs everywhere else — including GitHub Actions,
 * where it would kill the APK build at its first step.
 *
 * The lockfile is PROTECTED, so the repair must not touch the repository:
 * DesignLab detects the foreign prefixes deterministically at round time and
 * the generated workflow rewrites them to the public registry **in CI only**,
 * before install. Pinned versions are preserved exactly — npm integrity
 * hashes are content hashes and do not depend on which registry served the
 * tarball.
 */

const RESOLVED_URL = /"resolved":\s*"(https?:\/\/[^"]+)"/g;

/** Registries whose tarballs resolve publicly; anything else is foreign. */
const PUBLIC_REGISTRY_HOSTS = new Set(['registry.npmjs.org', 'registry.yarnpkg.com']);

/**
 * Extracts the distinct foreign registry prefixes from a package-lock.json
 * body. A prefix is everything before the package-name segment of a tarball
 * URL (`<prefix>/<name>/-/<file>.tgz`, scoped: `<prefix>/@scope/name/-/…`),
 * so replacing `<prefix>/` with `https://registry.npmjs.org/` maps every
 * pinned tarball onto its public location.
 */
export function extractForeignRegistryPrefixes(lockText: string): string[] {
  const prefixes = new Set<string>();

  for (const match of lockText.matchAll(RESOLVED_URL)) {
    const url = match[1];
    if (!url) continue;

    const marker = url.indexOf('/-/');
    if (marker < 0) continue;

    // Strip the package-name segment(s) before "/-/".
    const beforeMarker = url.slice(0, marker);
    const segments = beforeMarker.split('/');
    const nameSegments = segments.at(-2)?.startsWith('@') ? 2 : 1;
    const prefix = segments.slice(0, segments.length - nameSegments).join('/');

    let host: string;
    try {
      host = new URL(prefix).hostname;
    } catch {
      continue;
    }
    if (PUBLIC_REGISTRY_HOSTS.has(host)) continue;

    prefixes.add(prefix);
  }

  return [...prefixes].sort();
}

/**
 * The CI shell step that rewrites foreign prefixes to the public registry.
 * Emitted into generated workflows before dependency installation.
 */
export function lockfileNormalisationCommands(prefixes: readonly string[]): string[] {
  return prefixes.map(
    (prefix) => `sed -i 's#${prefix.replace(/#/g, '\\#')}/#https://registry.npmjs.org/#g' package-lock.json`,
  );
}
