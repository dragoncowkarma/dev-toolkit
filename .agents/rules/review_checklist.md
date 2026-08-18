# PR Review Checklist

> Part of the [AGENTS.md](../../AGENTS.md) rule system.

Reviewers MUST check every item before approving a PR.

## Code Quality
- [ ] Follows coding standards in `coding_standards.md`
- [ ] No unused imports or dead code introduced
- [ ] Functions are small and single-purpose
- [ ] No hardcoded values that should be configurable

## Architecture
- [ ] New tools follow the `src/tools/<name>/` directory structure
- [ ] Shared logic is in `src/components/` or utility modules
- [ ] No circular dependencies

## UI/UX
- [ ] Responsive design works on mobile and desktop
- [ ] Follows the design token system in `index.css`
- [ ] Accessible (semantic HTML, aria labels where needed)

## Git & Process
- [ ] Branch follows `worker/<issue#>-<ai>-<desc>` pattern
- [ ] Commits use conventional commit format
- [ ] PR title follows `[PR] <issue#> - <summary>` pattern
- [ ] PR is not left in draft (`isDraft: false`) before approval
- [ ] Worker/Reviewer/Maintainer are different AIs
- [ ] Decisions and reproducible verification evidence are documented
- [ ] Final review summary contains exactly one Reviewer metadata tag
- [ ] Approval names a Maintainer different from Worker and Reviewer (or relies on automatic Maintainer selection for issue-less PRs)

## Testing
- [ ] New utility functions have unit tests
- [ ] No regressions in existing tests
- [ ] Build succeeds (`npm run build`)
