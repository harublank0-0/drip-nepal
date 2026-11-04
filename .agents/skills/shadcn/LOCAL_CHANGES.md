# Local changes to this skill

This is a copy of the `shadcn` skill from <https://github.com/shadcn-ui/ui> (`skills/shadcn/`), restored from this repository's history (the copy that commit `2f97bba` untracked); `skills-lock.json` at the repository root records its source. It is MIT-licensed (`LICENSE.md` in this folder). It was patched on 2026-11-04 so that it follows ADR-0015 (`docs/adr/0015-ui-foundation-shadcn-and-kit-policy.md`):

1. **Pinned CLI.** Every `npx shadcn@latest` in the Markdown files became `pnpm exec shadcn`, which runs the version pinned in `package.json`. The note that offered `pnpm dlx` and `bunx` was replaced in `SKILL.md` and `cli.md`.
2. **Nothing runs on load.** Upstream `SKILL.md` ran `npx shadcn@latest info --json` through the `` !`…` `` syntax every time the skill loaded, and its `allowed-tools` pre-approved any `shadcn@latest` command. Both are removed: the skill now tells Claude to run `info` when it needs it, and each CLI command goes through the normal permission prompt.
3. **Allowed registries only.** "Check community registries too" is removed, and a "DripNepal rules" block at the top of `SKILL.md` states the ADR-0015 rules: shadcn/ui core and the free Shadcn UI Kit only, `--dry-run` before every `add`, and docs/08 wins over this skill.

When you update the skill from upstream, reapply these three changes and record the new version in `skills-lock.json`.
