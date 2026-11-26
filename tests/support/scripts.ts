import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'

/*
 * Helpers for the tests of the repository checks in scripts/ (docs/10 §5.1,
 * Repository, Supply chain and Contract stages): run a script, and build a
 * throwaway fixture tree for it to check.
 */

const run = promisify(execFile)

/*
 * The variables that tie git to one repository (`git rev-parse
 * --local-env-vars`, git 2.x). Git exports some of them to its hooks, and
 * in a linked worktree `GIT_DIR` is an absolute path: a fixture command run
 * from the pre-push hook (`node ace test unit`) would then commit, branch
 * and even re-initialise the real repository instead of its temporary
 * folder. Every child these helpers start runs without them.
 */
const REPOSITORY_VARIABLES = [
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_CONFIG',
  'GIT_CONFIG_PARAMETERS',
  'GIT_CONFIG_COUNT',
  'GIT_OBJECT_DIRECTORY',
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_IMPLICIT_WORK_TREE',
  'GIT_GRAFT_FILE',
  'GIT_INDEX_FILE',
  'GIT_NO_REPLACE_OBJECTS',
  'GIT_REPLACE_REF_BASE',
  'GIT_PREFIX',
  'GIT_SHALLOW_FILE',
  'GIT_COMMON_DIR',
]

// `env` (the test process's by default) without the repository variables.
export function isolatedEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const copy = { ...env }
  for (const name of REPOSITORY_VARIABLES) delete copy[name]
  return copy
}

export type ScriptResult = { code: number; stdout: string; stderr: string }

// Runs a command and returns its exit code and output instead of throwing.
export async function runCommand(
  command: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv } = {}
): Promise<ScriptResult> {
  try {
    const { stdout, stderr } = await run(command, args, {
      cwd: options.cwd ?? process.cwd(),
      env: isolatedEnv(options.env),
      maxBuffer: 64 * 1024 * 1024,
    })
    return { code: 0, stdout, stderr }
  } catch (error) {
    const failed = error as { code: number; stdout: string; stderr: string }
    return { code: Number(failed.code), stdout: failed.stdout, stderr: failed.stderr }
  }
}

// Runs `node scripts/<name>` from the repository root.
export function runScript(name: string, args: string[] = []) {
  return runCommand('node', [join(process.cwd(), 'scripts', name), ...args])
}

// A temporary folder holding `files` (path → content; an undefined content
// writes nothing); `cleanup` removes it.
export async function fixtureTree(files: Record<string, string | undefined>) {
  const root = await mkdtemp(join(tmpdir(), 'dripnepal-check-'))
  for (const [path, content] of Object.entries(files)) {
    if (content === undefined) continue
    await mkdir(dirname(join(root, path)), { recursive: true })
    await writeFile(join(root, path), content)
  }
  return { root, cleanup: () => rm(root, { recursive: true, force: true }) }
}

// Runs git in a fixture with a fixed author, so a test commit needs no config.
export function git(root: string, ...args: string[]) {
  return run(
    'git',
    [
      '-c',
      'user.name=fixture',
      '-c',
      'user.email=fixture@example.invalid',
      '-c',
      'commit.gpgsign=false',
      '-c',
      'core.hooksPath=/dev/null',
      ...args,
    ],
    { cwd: root, env: isolatedEnv() }
  )
}
