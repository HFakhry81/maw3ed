#!/usr/bin/env node
'use strict';

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');

const BRANCH_RE = /^(feat|fix|chore|docs|feature|hotfix|refactor|test|ci|build|perf|style|cursor|sync|dependabot)\/.+/;
const TITLE_RE = /^(feat|fix|chore|docs|refactor|test|ci|build|perf|style|revert)(\([^)]+\))?!?: .+/;
const EXCLUDED_PATH_RE = /(^|\/)(?:node_modules|dist|uploads|temp_uploads|backup|backups|archive|archives)(\/|$)/i;
const SECRET_PATTERNS = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/,
  /\b(?:sk|pk)_(?:live|test)_[A-Za-z0-9]{12,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bAIza[0-9A-Za-z_-]{35}\b/,
  /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/,
  /https?:\/\/[^/\s:]+:[^@\s/]+@/i
];
const CHECK_TIMEOUT_MS = 30 * 60 * 1000;

function isConventionalTitle(value) {
  return TITLE_RE.test(value);
}

function isAcceptedCommitMessage(value) {
  return /^(?:Merge |Revert |fixup! |squash! )/.test(value) || isConventionalTitle(value);
}

function isAllowedBranch(value) {
  return BRANCH_RE.test(value);
}

function isExcludedPath(value) {
  const file = value.replace(/\\/g, '/').replace(/^\.\/+/, '').toLowerCase();
  const basename = file.slice(file.lastIndexOf('/') + 1);
  return basename === '.env' ||
    basename.startsWith('.env') ||
    basename === '.npmrc' ||
    basename === '.netrc' ||
    basename === 'credentials' ||
    basename.startsWith('credentials.') ||
    basename.startsWith('service-account') ||
    /(^|\/)\.aws\/credentials$/.test(file) ||
    /(^|\/)\.ssh\//.test(file) ||
    /(^|\/)data(\/|$)/i.test(file) ||
    /(?:^|[._-])(?:backup|backups|archive|archives)(?:[._-]|$)/i.test(basename) ||
    EXCLUDED_PATH_RE.test(file) ||
    /\.(?:pem|key|p12|pfx|keystore)$/i.test(file);
}

function containsSecret(value) {
  return SECRET_PATTERNS.some((pattern) => pattern.test(value));
}

function selectSafePaths(paths) {
  return paths.filter((file) => !isExcludedPath(file));
}

function getFeaturePushArgs(remote, branch) {
  if (!isAllowedBranch(branch) || branch === 'main' || branch === 'staging') {
    throw new Error('Only an allowed feature branch may be pushed by git:flow.');
  }
  return ['push', '-u', remote, branch];
}

function findProtectedBranchCommits(cwd, featureCommits) {
  const refs = git(cwd, 'for-each-ref', '--format=%(refname)', 'refs/heads', 'refs/remotes')
    .split(/\r?\n/)
    .filter((ref) => ref === 'refs/heads/main' ||
      ref === 'refs/heads/staging' ||
      /\/(?:main|staging)$/.test(ref));
  const featureSet = new Set(featureCommits);
  const leaked = new Set();
  for (const ref of refs) {
    const commits = git(cwd, 'rev-list', ref)
      .split(/\r?\n/)
      .filter(Boolean);
    for (const commit of commits) {
      if (featureSet.has(commit)) leaked.add(commit);
    }
  }
  return [...leaked];
}

function parseArgs(argv) {
  if (argv[0] === 'setup-hooks' ||
      argv[0] === 'validate-message' ||
      argv[0] === 'validate-message-file' ||
      argv[0] === 'validate-branch') {
    return { command: argv[0], value: argv[1] };
  }
  if (argv.includes('--help') || argv.includes('-h')) return { command: 'help' };

  const options = { command: 'flow', dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--message' || arg === '-m' || arg === '--branch' || arg === '-b') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}.`);
      index += 1;
      if (arg === '--message' || arg === '-m') options.message = value;
      else options.branch = value;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  if (!options.message) throw new Error('A Conventional Commit --message is required.');
  if (!isConventionalTitle(options.message)) {
    throw new Error('The message must follow Conventional Commits, for example: "fix: correct booking flow".');
  }
  if (options.branch && !isAllowedBranch(options.branch)) {
    throw new Error('The branch name does not match the repository branch-flow policy.');
  }
  return options;
}

function sanitize(value) {
  return String(value || '')
    .replace(/(https?:\/\/)[^/\s@]+@/gi, '$1[redacted]@')
    .trim();
}

function run(command, args, cwd, timeout = 120000) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
    timeout,
    maxBuffer: 16 * 1024 * 1024,
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: '0',
      GH_PROMPT_DISABLED: '1'
    }
  });
  if (result.error) {
    throw new Error(`Could not run ${command}: ${sanitize(result.error.message)}`);
  }
  if (result.status !== 0) {
    const detail = sanitize(result.stderr || result.stdout);
    throw new Error(`${command} ${args[0] || ''} failed${detail ? `: ${detail}` : '.'}`);
  }
  return result.stdout || '';
}

function optionalRun(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 120000,
    maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GH_PROMPT_DISABLED: '1' }
  });
  if (result.error) throw new Error(`Could not run ${command}: ${sanitize(result.error.message)}`);
  return { status: result.status, stdout: result.stdout || '', stderr: result.stderr || '' };
}

function git(cwd, ...args) {
  return run('git', args, cwd);
}

function getRepoRoot(cwd) {
  return git(cwd, 'rev-parse', '--show-toplevel').trim();
}

function getRemoteUrl(cwd, name) {
  const result = optionalRun('git', ['remote', 'get-url', name], cwd);
  return result.status === 0 ? result.stdout.trim() : null;
}

function parseGitHubRepo(remoteUrl) {
  const match = remoteUrl && remoteUrl.match(/(?:github\.com[:/])([^/]+\/[^/]+?)(?:\.git)?$/i);
  if (!match) throw new Error('The canonical remote must point to a GitHub repository.');
  return match[1];
}

function parseGitHubOwner(remoteUrl) {
  return parseGitHubRepo(remoteUrl).split('/')[0];
}

function makeBranchName(message) {
  const typeMatch = message.match(/^([a-z]+)(?:\([^)]+\))?!?:/);
  const type = typeMatch && typeMatch[1] !== 'revert' ? typeMatch[1] : 'chore';
  const description = message.slice(message.indexOf(':') + 1)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 28)
    .replace(/-$/g, '') || 'change';
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  return `${type}/${description}-${stamp}`;
}

function parseNulSeparated(value) {
  return value.split('\0').filter(Boolean);
}

function gitBranchExists(cwd, branch) {
  return git(cwd, 'branch', '--list', branch).trim().length > 0;
}

function remoteBranchExists(cwd, remote, branch) {
  return git(cwd, 'ls-remote', '--heads', remote, `refs/heads/${branch}`).trim().length > 0;
}

function ensureNoStagedChanges(cwd) {
  if (git(cwd, 'diff', '--cached', '--name-only', '-z').length > 0) {
    throw new Error('The index already contains staged changes. Review or unstage them before running git:flow.');
  }
}

function ensureNoLocalAheadCommit(cwd, remoteRef, branch) {
  const ahead = Number(git(cwd, 'rev-list', '--count', `${remoteRef}/${branch}..HEAD`).trim());
  if (ahead > 0) {
    throw new Error(
      `Refusing to branch from local ${branch}: it has ${ahead} commit(s) not present on ${remoteRef}/${branch}. ` +
      'Preserve or review those commits separately; git:flow will not publish them.'
    );
  }
}

function ensureFeatureBranch(cwd, options, remoteRef) {
  const current = git(cwd, 'branch', '--show-current').trim();
  if (!current) throw new Error('Detached HEAD is not supported. Switch to a branch and retry.');

  if (current === 'main' || current === 'staging') {
    ensureNoLocalAheadCommit(cwd, remoteRef, current);
    const branch = options.branch || makeBranchName(options.message);
    if (!isAllowedBranch(branch)) throw new Error('The generated or requested branch name is not allowed.');
    if (gitBranchExists(cwd, branch)) throw new Error(`Local branch already exists: ${branch}`);
    if (remoteBranchExists(cwd, options.pushRemote, branch)) {
      throw new Error(`Remote branch already exists: ${branch}`);
    }
    git(cwd, 'check-ref-format', '--branch', branch);
    git(cwd, 'switch', '--no-track', '-c', branch, `${remoteRef}/staging`);
    return branch;
  }

  if (!isAllowedBranch(current)) {
    throw new Error(`Current branch "${current}" is not allowed by the branch-flow policy.`);
  }
  if (options.branch && options.branch !== current) {
    throw new Error(`You are on "${current}", but --branch requested "${options.branch}".`);
  }
  const featureCommits = git(cwd, 'rev-list', `${remoteRef}/staging..HEAD`)
    .split(/\r?\n/)
    .filter(Boolean);
  if (findProtectedBranchCommits(cwd, featureCommits).length > 0) {
    throw new Error(
      'The feature branch contains commit(s) from protected-branch history that are not on canonical staging. ' +
      'Refusing to publish potentially unrelated commits.'
    );
  }
  return current;
}

function ensureFeatureHistoryPublished(cwd, remote, remoteRef, branch) {
  const featureCommits = git(cwd, 'rev-list', `${remoteRef}/staging..HEAD`)
    .split(/\r?\n/)
    .filter(Boolean);
  const remoteRefName = `refs/heads/${branch}`;
  const remoteLine = git(cwd, 'ls-remote', '--heads', remote, remoteRefName).trim();
  if (!remoteLine && featureCommits.length > 0) {
    throw new Error('The feature branch contains local commits not created by this run and not yet pushed. Refusing to publish them.');
  }
  if (remoteLine && remoteLine.split(/\s+/)[0] !== git(cwd, 'rev-parse', 'HEAD').trim()) {
    throw new Error('The local feature branch differs from its published head. Synchronize it before running git:flow.');
  }
}

function stageSafeChanges(cwd) {
  ensureNoStagedChanges(cwd);
  const changedPaths = parseNulSeparated(git(
    cwd,
    'ls-files',
    '--modified',
    '--deleted',
    '--others',
    '--exclude-standard',
    '-z'
  ));
  const safePaths = selectSafePaths(changedPaths);
  if (safePaths.length === 0) {
    if (changedPaths.length === 0) return [];
    throw new Error('No safe changed files to commit. Sensitive/runtime paths are excluded.');
  }

  for (let index = 0; index < safePaths.length; index += 100) {
    git(cwd, 'add', '-A', '--', ...safePaths.slice(index, index + 100));
  }

  const stagedPaths = parseNulSeparated(git(cwd, 'diff', '--cached', '--name-only', '-z'));
  if (stagedPaths.length === 0) throw new Error('No files were staged for commit.');
  const excluded = stagedPaths.filter(isExcludedPath);
  if (excluded.length > 0) {
    git(cwd, 'reset', '--quiet');
    throw new Error('Sensitive/runtime paths reached the index; all newly staged files were unstaged.');
  }
  const hooks = stagedPaths.filter((file) => file === '.githooks/commit-msg' || file === '.githooks/pre-push');
  if (hooks.length > 0) git(cwd, 'update-index', '--chmod=+x', '--', ...hooks);
  git(cwd, 'diff', '--cached', '--check');
  const diff = git(cwd, 'diff', '--cached', '--no-ext-diff', '--unified=0');
  if (containsSecret(diff)) {
    git(cwd, 'reset', '--quiet');
    throw new Error('A likely credential was found in the staged diff; all newly staged files were unstaged.');
  }
  return stagedPaths;
}

function setupHooks(cwd) {
  git(cwd, 'config', '--local', 'core.hooksPath', '.githooks');
}

function ensurePushTargetSafe(cwd, remote, branch) {
  const upstream = optionalRun(
    'git',
    ['rev-parse', '--abbrev-ref', '--symbolic-full-name', `${branch}@{upstream}`],
    cwd
  );
  const expected = `${remote}/${branch}`;
  if (upstream.status === 0) {
    if (upstream.stdout.trim() === expected) return;
    if (remoteBranchExists(cwd, remote, branch)) {
      throw new Error(`Branch "${branch}" tracks a different remote and the push target already exists.`);
    }
    git(cwd, 'branch', '--unset-upstream', branch);
    return;
  }
  if (remoteBranchExists(cwd, remote, branch)) {
    throw new Error(`Remote branch "${branch}" exists but is not its upstream. Refusing to overwrite it.`);
  }
}

function gh(cwd, args, timeout) {
  return run('gh', args, cwd, timeout);
}

function ghJson(cwd, args) {
  const text = gh(cwd, args);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`GitHub CLI returned invalid JSON for: gh ${args.slice(0, 2).join(' ')}`);
  }
}

function findPullRequests(cwd, repo, base, head) {
  const prs = ghJson(cwd, [
    'pr', 'list', '--repo', repo, '--state', 'all', '--base', base,
    '--json', 'number,title,baseRefName,headRefName,headRefOid,headRepositoryOwner,state'
  ]);
  return filterPullRequestsByHead(prs, head).sort((left, right) => right.number - left.number);
}

function filterPullRequestsByHead(prs, head) {
  const [expectedOwner, expectedBranch] = head.includes(':') ? head.split(':', 2) : [null, head];
  return prs.filter((pr) => {
    if (pr.headRefName !== expectedBranch) return false;
    return !expectedOwner || (pr.headRepositoryOwner && pr.headRepositoryOwner.login === expectedOwner);
  });
}

function selectExistingPullRequest(prs, headSha) {
  const ordered = [...prs].sort((left, right) => right.number - left.number);
  const open = ordered.find((pr) => pr.state === 'OPEN');
  if (open) return open;
  const merged = ordered.find((pr) => pr.state === 'MERGED' && pr.headRefOid === headSha);
  if (merged) return merged;
  const closed = ordered.find((pr) => pr.state === 'CLOSED' && pr.headRefOid === headSha);
  if (closed) throw new Error(`PR #${closed.number} for this exact branch head was closed without merging.`);
  return null;
}

function findExistingPullRequest(cwd, { repo, base, head, headSha }) {
  return selectExistingPullRequest(findPullRequests(cwd, repo, base, head), headSha);
}

function createOrFindPullRequest(cwd, { repo, base, head, headSha, title, body }) {
  let pr = findExistingPullRequest(cwd, { repo, base, head, headSha });
  if (pr) {
    if (pr.baseRefName !== base || pr.headRefName !== head.split(':').pop()) {
      throw new Error('An existing pull request does not match the requested branch flow.');
    }
    if (pr.state === 'OPEN' && base === 'staging' && pr.title !== title) {
      throw new Error(`An open PR already exists with a different title: "${pr.title}". Update it manually.`);
    }
    return pr;
  }
  gh(cwd, [
    'pr', 'create', '--repo', repo, '--base', base, '--head', head,
    '--title', title, '--body', body
  ]);
  pr = findExistingPullRequest(cwd, { repo, base, head, headSha });
  if (!pr) throw new Error(`GitHub did not return the newly created ${base} pull request.`);
  return pr;
}

function waitAndMergePullRequest({ cwd, repo, number, expectedBase, expectedHead, runGh = (args, timeout) => gh(cwd, args, timeout) }) {
  const prArgs = [
    'pr', 'view', String(number), '--repo', repo, '--json',
    'state,baseRefName,headRefName,reviewDecision,mergeStateStatus'
  ];
  let pr = JSON.parse(runGh(prArgs));
  if (pr.baseRefName !== expectedBase || pr.headRefName !== expectedHead) {
    throw new Error(`PR #${number} does not match the expected ${expectedHead} -> ${expectedBase} flow.`);
  }
  if (pr.state === 'MERGED') return { state: 'merged' };
  if (pr.state !== 'OPEN') throw new Error(`PR #${number} is ${pr.state}, not open.`);

  runGh(['pr', 'checks', String(number), '--repo', repo, '--watch', '--required'], CHECK_TIMEOUT_MS);
  pr = JSON.parse(runGh(prArgs));
  if (pr.state === 'MERGED') return { state: 'merged' };
  if (pr.state !== 'OPEN') throw new Error(`PR #${number} changed to ${pr.state} while checks were running.`);
  if (pr.reviewDecision === 'CHANGES_REQUESTED') {
    throw new Error(`PR #${number} has requested changes. Resolve the review before merging.`);
  }

  if (pr.reviewDecision === 'REVIEW_REQUIRED') {
    runGh(['pr', 'merge', String(number), '--repo', repo, '--auto']);
  } else if (pr.mergeStateStatus === 'CLEAN') {
    runGh(['pr', 'merge', String(number), '--repo', repo, '--merge']);
  } else if (pr.mergeStateStatus === 'QUEUED') {
    runGh(['pr', 'merge', String(number), '--repo', repo]);
  } else {
    throw new Error(
      `PR #${number} is not mergeable (review=${pr.reviewDecision || 'none'}, ` +
      `mergeState=${pr.mergeStateStatus || 'unknown'}). No protection was bypassed.`
    );
  }

  pr = JSON.parse(runGh(prArgs));
  return pr.state === 'MERGED' ? { state: 'merged' } : { state: 'waiting' };
}

function syncLocalBranch(cwd, branch, remoteRef) {
  const exists = git(cwd, 'branch', '--list', branch).trim().length > 0;
  if (!exists) return 'absent';
  const localIsAncestor = optionalRun('git', ['merge-base', '--is-ancestor', branch, `${remoteRef}/${branch}`], cwd);
  if (localIsAncestor.status === 0) {
    const update = optionalRun('git', ['branch', '-f', branch, `${remoteRef}/${branch}`], cwd);
    return update.status === 0 ? 'updated' : `not-updated: ${sanitize(update.stderr || update.stdout)}`;
  }
  const remoteIsAncestor = optionalRun('git', ['merge-base', '--is-ancestor', `${remoteRef}/${branch}`, branch], cwd);
  if (remoteIsAncestor.status === 0) return 'local-ahead';
  return 'diverged';
}

function cleanupLocalFeatureBranch(cwd, branch) {
  if (git(cwd, 'status', '--porcelain', '--untracked-files=all').length > 0) return 'preserved-dirty-worktree';
  if (git(cwd, 'branch', '--show-current').trim() !== branch) return 'not-current';
  const switched = optionalRun('git', ['switch', 'staging'], cwd);
  if (switched.status !== 0) return `preserved: ${sanitize(switched.stderr || switched.stdout)}`;
  const deleted = optionalRun('git', ['branch', '-d', branch], cwd);
  return deleted.status === 0
    ? 'deleted'
    : `preserved: ${sanitize(deleted.stderr || deleted.stdout)}`;
}

function runFlow(options, cwd) {
  const canonicalRemote = getRemoteUrl(cwd, 'upstream') ? 'upstream' : 'origin';
  const canonicalUrl = getRemoteUrl(cwd, canonicalRemote);
  const canonicalRepo = parseGitHubRepo(canonicalUrl);
  const pushRemote = getRemoteUrl(cwd, 'origin') ? 'origin' : canonicalRemote;
  const pushUrl = getRemoteUrl(cwd, pushRemote);
  const pushOwner = parseGitHubOwner(pushUrl);
  options.pushRemote = pushRemote;

  if (options.dryRun) {
    console.log(`git:flow usage: would use ${canonicalRemote}/staging -> ${canonicalRepo}/main.`);
    console.log('Would stage safe changed files only, run the repository syntax check, commit, push a feature branch,');
    console.log('create PRs to staging and main, wait for required checks, and merge without bypassing protections.');
    console.log('Excluded: .env*, .npmrc/.netrc, data/, uploads/, backups/, node_modules/, and private-key files.');
    return;
  }

  gh(cwd, ['auth', 'status']);
  git(cwd, 'fetch', '--prune', canonicalRemote, 'main', 'staging');
  ensureNoStagedChanges(cwd);
  const branch = ensureFeatureBranch(cwd, options, canonicalRemote);
  ensureFeatureHistoryPublished(cwd, pushRemote, canonicalRemote, branch);
  const stagedPaths = stageSafeChanges(cwd);
  if (stagedPaths.length > 0) {
    const basedOnCurrentStaging = optionalRun(
      'git',
      ['merge-base', '--is-ancestor', `${canonicalRemote}/staging`, 'HEAD'],
      cwd
    );
    if (basedOnCurrentStaging.status !== 0) {
      git(cwd, 'reset', '--quiet');
      throw new Error(`The feature branch is behind ${canonicalRemote}/staging. Update it before adding changes.`);
    }
    console.log(`Staged ${stagedPaths.length} safe file(s) on ${branch}.`);
    run(process.execPath, ['scripts/ci-syntax-check.js'], cwd, CHECK_TIMEOUT_MS);
    git(cwd, '-c', 'core.hooksPath=.githooks', 'commit', '-m', options.message);
    ensurePushTargetSafe(cwd, pushRemote, branch);
    git(cwd, ...getFeaturePushArgs(pushRemote, branch));
  }

  const featureHead = `${pushOwner}:${branch}`;
  const featureHeadSha = git(cwd, 'rev-parse', 'HEAD').trim();
  const featurePrInput = {
    repo: canonicalRepo,
    base: 'staging',
    head: featureHead,
    headSha: featureHeadSha,
    title: options.message,
    body: 'Created by `npm run git:flow`.\n\n- Safe-path staging and credential scan completed locally.\n- Required GitHub checks and review rules remain authoritative.'
  };
  if (stagedPaths.length === 0 && !findExistingPullRequest(cwd, featurePrInput)) {
    throw new Error('No safe changes or existing feature PR to resume.');
  }
  const featurePr = createOrFindPullRequest(cwd, featurePrInput);
  const featureResult = waitAndMergePullRequest({
    cwd,
    repo: canonicalRepo,
    number: featurePr.number,
    expectedBase: 'staging',
    expectedHead: branch
  });
  if (featureResult.state === 'waiting') {
    console.log(`Feature PR #${featurePr.number} is waiting for required review/merge conditions. GitHub auto-merge was requested where supported.`);
    return;
  }

  git(cwd, 'fetch', '--prune', canonicalRemote, 'main', 'staging');
  const shortSha = git(cwd, 'rev-parse', '--short', `${canonicalRemote}/staging`).trim();
  const releaseHeadSha = git(cwd, 'rev-parse', `${canonicalRemote}/staging`).trim();
  const releaseTitle = `chore: release ${shortSha} to main`;
  const releasePr = createOrFindPullRequest(cwd, {
    repo: canonicalRepo,
    base: 'main',
    head: `${parseGitHubOwner(canonicalUrl)}:staging`,
    headSha: releaseHeadSha,
    title: releaseTitle,
    body: 'Created by `npm run git:flow` after the feature PR merged into `staging`.\n\n- Required GitHub checks and review rules remain authoritative.'
  });
  const releaseResult = waitAndMergePullRequest({
    cwd,
    repo: canonicalRepo,
    number: releasePr.number,
    expectedBase: 'main',
    expectedHead: 'staging'
  });
  if (releaseResult.state === 'waiting') {
    console.log(`Release PR #${releasePr.number} is waiting for required review/merge conditions. GitHub auto-merge was requested where supported.`);
    return;
  }

  git(cwd, 'fetch', '--prune', canonicalRemote, 'main', 'staging');
  const syncResults = ['main', 'staging'].map((name) => `${name}=${syncLocalBranch(cwd, name, canonicalRemote)}`);
  if (remoteBranchExists(cwd, pushRemote, branch)) git(cwd, 'push', pushRemote, '--delete', branch);
  const localCleanup = cleanupLocalFeatureBranch(cwd, branch);
  console.log(`Merged PRs #${featurePr.number} and #${releasePr.number}. Local sync: ${syncResults.join(', ')}.`);
  console.log(`Local feature-branch cleanup: ${localCleanup}.`);
}

function printHelp() {
  console.log([
    'git:flow usage',
    '',
    '  npm run git:flow -- --message "fix: correct booking flow" [--branch fix/booking-flow] [--dry-run]',
    '  npm run git:setup-hooks',
    '',
    'Creates or reuses a policy-compliant feature branch, stages safe changes, runs syntax checks,',
    'commits and pushes the feature branch, opens a PR to staging, then a release PR to main.',
    'It waits for required checks and uses GitHub merge rules; it never uses --admin or force-push.',
    'If review is required, it requests GitHub auto-merge and stops; rerun after it merges to resume the release flow.',
    'Sensitive/runtime paths are excluded. Local protected-branch commits are never published.',
    'Requires Git, Node.js, gh, and authenticated GitHub CLI access.'
  ].join('\n'));
}

function main(argv) {
  const options = parseArgs(argv);
  if (options.command === 'help') {
    printHelp();
    return;
  }
  if (options.command === 'validate-message') {
    if (!isAcceptedCommitMessage(options.value || '')) throw new Error('Commit message must follow Conventional Commits.');
    return;
  }
  if (options.command === 'validate-message-file') {
    const message = fs.readFileSync(options.value, 'utf8').trimEnd();
    if (!isAcceptedCommitMessage(message)) throw new Error('Commit message must follow Conventional Commits.');
    return;
  }
  if (options.command === 'validate-branch') {
    if (!isAllowedBranch(options.value || '')) throw new Error('Branch name is not allowed by branch-flow policy.');
    return;
  }

  const cwd = getRepoRoot(process.cwd());
  if (options.command === 'setup-hooks') {
    setupHooks(cwd);
    console.log('Git hooks enabled for this repository.');
    return;
  }
  if (!options.dryRun) setupHooks(cwd);
  runFlow(options, cwd);
}

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(`[git:flow] ${sanitize(error.message)}`);
    process.exitCode = 1;
  }
}

module.exports = {
  containsSecret,
  filterPullRequestsByHead,
  isAllowedBranch,
  isAcceptedCommitMessage,
  isConventionalTitle,
  isExcludedPath,
  findProtectedBranchCommits,
  makeBranchName,
  parseArgs,
  selectExistingPullRequest,
  stageSafeChanges,
  selectSafePaths,
  getFeaturePushArgs,
  waitAndMergePullRequest
};
