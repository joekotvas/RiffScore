import { execSync } from 'child_process';

/**
 * Playwright global setup (issue #252, Lane B).
 *
 * Regenerates the static gallery — the render surface for the pixel suite — from the
 * CURRENT source, so a screenshot run always reflects the working tree, not a stale
 * gallery. The gallery generator is the dependency-free jsdom renderer behind
 * `npm run visual:gallery`.
 */
export default function globalSetup(): void {
  execSync('npm run visual:gallery', { stdio: 'inherit' });
}
