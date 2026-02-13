# Release Workflow

This document outlines the process for releasing a new version of RiffScore.

## Pre-Release Checklist

### 1. Final Verification

- [ ] All tests pass: `npm test`
- [ ] TypeScript compiles cleanly: `npm run typecheck`
- [ ] Lint passes: `npm run lint`
- [ ] Build succeeds: `npm run build`
- [ ] Manual smoke test on local dev server: `npm run dev`
  - Create/edit notes and chords
  - Test playback
  - Test export (ABC, MusicXML)
  - Verify undo/redo

### 2. Update Documentation

- [ ] Update `README.md` if features affect the public interface or usage
- [ ] Update `ARCHITECTURE.md` if structural changes were made
- [ ] Update relevant docs in `docs/` (API.md, CONFIGURATION.md, etc.)
- [ ] Ensure code examples in docs still work
- [ ] Update screenshots if UI changed significantly

### 3. Update Changelog

- [ ] Update `CHANGELOG.md`:
  - Change `[Unreleased]` to `[1.0.0-alpha.X] - YYYY-MM-DD`
  - Add new `[Unreleased]` section at top (if continuing development)
- [ ] Review changelog entries for accuracy and completeness

### 4. Version Bump

- [ ] Update version in `package.json`
- [ ] Commit: `git commit -m "chore: bump version to 1.0.0-alpha.X"`

## Release Process

### 5. Merge to Dev

```bash
# Ensure feature branch is up to date
git checkout dev
git pull origin dev
git merge feature/your-branch

# Push to remote
git push origin dev
```

### 6. Review AI Feedback

- [ ] Create PR from `dev` to `main`
- [ ] Review GitHub Copilot/Codex feedback on the PR
- [ ] Address any valid concerns (fix issues or document why feedback doesn't apply)
- [ ] Request human review if needed

### 7. Merge to Main

```bash
# After PR approval
gh pr merge <PR-number> --merge

# Or via GitHub UI
```

### 8. Create GitHub Release

```bash
# Find the correct commit for the release
git log main --oneline -10

# Create and push tag
git tag -a v1.0.0-alpha.X <commit-sha> -m "Release v1.0.0-alpha.X"
git push origin v1.0.0-alpha.X

# Create GitHub release
gh release create v1.0.0-alpha.X --title "v1.0.0-alpha.X" --notes "$(cat <<'EOF'
## Summary
- Highlight 1
- Highlight 2

## Added
- Feature 1
- Feature 2

## Fixed
- Bug fix 1

**Full Changelog**: https://github.com/joekotvas/RiffScore/blob/main/CHANGELOG.md
EOF
)"

# Mark as latest if needed
gh release edit v1.0.0-alpha.X --latest
```

### 9. Publish to npm (when ready for public release)

```bash
# Ensure you're logged in
npm login

# Publish (use --dry-run first to verify)
npm publish --dry-run
npm publish
```

> **Note**: Currently in alpha, npm publishing may be deferred until stable release.

### 10. Clean Up Branches

```bash
# Delete merged feature branches
git branch -d feature/your-branch
git push origin --delete feature/your-branch

# Verify only main and dev remain
git branch -a
```

### 11. Deployment Verification

- [ ] Verify Netlify deployment at https://riffscore.netlify.app
- [ ] Smoke test the deployed version

## Post-Release

### 12. LinkedIn Announcement

- [ ] Capture a relevant screenshot or GIF showing the new feature in action
  - Use the deployed site at riffscore.netlify.app
  - Crop to focus on the feature, not browser chrome
  - Consider a short screen recording for interactive features

Draft a post highlighting:

1. **What shipped** - Key features/fixes in user terms
2. **Impact** - How it helps musicians/educators
3. **Technical highlights** - Notable implementation details (lines added, test coverage, etc.)
4. **AI acknowledgment** - Credit Claude Code as development partner while emphasizing UX craft
5. **Call to action** - Link to live demo

Example structure:

```
**Shipped: [Feature Name] in RiffScore (Alpha X)**

Just deployed [brief description].

What this means for musicians and educators:

**Feature 1.** [User benefit explanation]

**Feature 2.** [User benefit explanation]

The implementation: [X lines added] across [Y files]. [Technical highlights].

I'm using Claude Code as a development partner on this project. [Reflection on AI-assisted development].

Live at **riffscore.netlify.app** — still in alpha, but increasingly capable.
```

## Quick Reference Commands

```bash
# Full test suite
npm test

# Type check only
npm run typecheck

# Create release tag
git tag -a v1.0.0-alpha.X <sha> -m "Release v1.0.0-alpha.X"
git push origin v1.0.0-alpha.X

# Create GitHub release
gh release create v1.0.0-alpha.X --title "v1.0.0-alpha.X" --notes "Release notes here"

# Mark release as latest
gh release edit v1.0.0-alpha.X --latest

# List all releases
gh release list

# Delete a branch
git branch -d branch-name
git push origin --delete branch-name
```

## Troubleshooting

### GitHub thinks wrong release is "Latest"

```bash
gh release edit v1.0.0-alpha.X --latest
```

### Tag already exists

```bash
# Delete and recreate
git tag -d v1.0.0-alpha.X
git push origin --delete v1.0.0-alpha.X
git tag -a v1.0.0-alpha.X <correct-sha> -m "Release v1.0.0-alpha.X"
git push origin v1.0.0-alpha.X
```

### Need to update release notes

```bash
gh release edit v1.0.0-alpha.X --notes "Updated notes here"
```
