'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const {
  containsSecret,
  filterPullRequestsByHead,
  isAllowedBranch,
  isAcceptedCommitMessage,
  isConventionalTitle,
  isExcludedPath,
  findProtectedBranchCommits,
  getFeaturePushArgs,
  makeBranchName,
  parseArgs,
  selectExistingPullRequest,
  stageSafeChanges,
  selectSafePaths,
  waitAndMergePullRequest
} = require('./flow');

function runTests() {
  assert.equal(isConventionalTitle('fix(api): reject invalid booking'), true);
  assert.equal(isConventionalTitle('plain message'), false);
  assert.equal(isAcceptedCommitMessage('Merge branch staging'), true);
  assert.equal(isAllowedBranch('feat/booking-flow'), true);
  assert.equal(isAllowedBranch('main'), false);
  assert.equal(isAllowedBranch('feature'), false);
  assert.deepEqual(getFeaturePushArgs('origin', 'fix/booking'), ['push', '-u', 'origin', 'fix/booking']);
  assert.throws(() => getFeaturePushArgs('origin', 'main'), /Only an allowed feature branch/);
  assert.throws(() => getFeaturePushArgs('origin', 'staging'), /Only an allowed feature branch/);

  assert.equal(isExcludedPath('.env.production'), true);
  assert.equal(isExcludedPath('.env-mode'), true);
  assert.equal(isExcludedPath('data/private.json'), true);
  assert.equal(isExcludedPath('db-backup.zip'), true);
  assert.equal(isExcludedPath('nested/uploads/image.png'), true);
  assert.equal(isExcludedPath('dist/build-manifest.json'), true);
  assert.equal(isExcludedPath('.aws/credentials'), true);
  assert.equal(isExcludedPath('credentials.json'), true);
  assert.equal(isExcludedPath('src/booking.js'), false);
  assert.deepEqual(
    selectSafePaths(['src/booking.js', '.env.local', 'data/session.json', 'docs/guide.md']),
    ['src/booking.js', 'docs/guide.md']
  );
  const fakeToken = ['ghp', 'abcdefghijklmnopqrstuvwxyz123456'].join('_');
  assert.equal(containsSecret(`token=${fakeToken}`), true);
  assert.equal(containsSecret('ordinary descriptive text'), false);

  const generated = makeBranchName('fix: Correct booking flow');
  assert.match(generated, /^fix\/correct-booking-flow-\d{8}T\d{6}Z$/);
  assert.equal(isAllowedBranch(generated), true);
  assert.throws(() => parseArgs(['--message', 'unsafe message']), /Conventional Commits/);
  assert.throws(() => parseArgs(['--message', 'fix: valid', '--branch', 'main']), /branch-flow policy/);
  assert.equal(parseArgs(['--message', 'fix: valid', '--dry-run']).dryRun, true);
  assert.equal(selectExistingPullRequest([
    { number: 7, state: 'MERGED', headRefOid: 'old' },
    { number: 8, state: 'MERGED', headRefOid: 'current' }
  ], 'current').number, 8);
  assert.equal(selectExistingPullRequest([
    { number: 9, state: 'MERGED', headRefOid: 'old' }
  ], 'current'), null);
  assert.equal(filterPullRequestsByHead([
    { number: 1, headRefName: 'flow', headRepositoryOwner: { login: 'other' } },
    { number: 2, headRefName: 'flow', headRepositoryOwner: { login: 'upnexaeg-art' } }
  ], 'upnexaeg-art:flow').length, 1);
  assert.equal(filterPullRequestsByHead([
    { number: 3, headRefName: 'flow', headRepositoryOwner: { login: 'upnexaeg-art' } }
  ], 'flow').length, 1);
  assert.throws(() => selectExistingPullRequest([
    { number: 10, state: 'CLOSED', headRefOid: 'current' }
  ], 'current'), /closed without merging/);

  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'maw3ed-git-flow-'));
  try {
    execFileSync('git', ['init', '--quiet'], { cwd: fixture });
    execFileSync('git', ['config', 'core.autocrlf', 'false'], { cwd: fixture });
    execFileSync('git', ['config', 'user.email', 'git-flow-test@example.invalid'], { cwd: fixture });
    execFileSync('git', ['config', 'user.name', 'Git Flow Test'], { cwd: fixture });
    fs.mkdirSync(path.join(fixture, 'src'), { recursive: true });
    fs.mkdirSync(path.join(fixture, 'dist'), { recursive: true });
    fs.writeFileSync(path.join(fixture, 'src', 'app.js'), 'const app = true;\n');
    fs.writeFileSync(path.join(fixture, 'dist', 'build-manifest.json'), '{"builtAt":"old"}\n');
    const messageFile = path.join(fixture, 'COMMIT_EDITMSG');
    fs.writeFileSync(messageFile, 'fix: valid commit message\n');
    execFileSync(process.execPath, [path.join(__dirname, 'flow.js'), 'validate-message-file', messageFile], { cwd: fixture });
    fs.writeFileSync(messageFile, 'invalid commit message\n');
    assert.throws(() => execFileSync(
      process.execPath,
      [path.join(__dirname, 'flow.js'), 'validate-message-file', messageFile],
      { cwd: fixture, stdio: 'ignore' }
    ));
    fs.rmSync(messageFile);
    execFileSync('git', ['add', '--', 'src/app.js'], { cwd: fixture });
    execFileSync('git', ['add', '--', 'dist/build-manifest.json'], { cwd: fixture });
    execFileSync('git', ['commit', '--quiet', '-m', 'chore: test fixture'], { cwd: fixture });
    fs.writeFileSync(path.join(fixture, 'src', 'app.js'), 'const app = false;\n');
    fs.writeFileSync(path.join(fixture, 'dist', 'build-manifest.json'), '{"builtAt":"new"}\n');
    fs.mkdirSync(path.join(fixture, 'data'), { recursive: true });
    fs.mkdirSync(path.join(fixture, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(fixture, '.env.local'), 'LOCAL_SECRET=not-for-commit\n');
    fs.writeFileSync(path.join(fixture, 'data', 'session.json'), '{"private":true}\n');
    fs.writeFileSync(path.join(fixture, 'docs', 'guide.md'), '# Safe documentation\n');
    const staged = stageSafeChanges(fixture).sort();
    assert.deepEqual(staged, ['docs/guide.md', 'src/app.js']);
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }

  const historyFixture = fs.mkdtempSync(path.join(os.tmpdir(), 'maw3ed-git-history-'));
  try {
    execFileSync('git', ['init', '--quiet'], { cwd: historyFixture });
    execFileSync('git', ['config', 'core.autocrlf', 'false'], { cwd: historyFixture });
    execFileSync('git', ['config', 'user.email', 'git-flow-test@example.invalid'], { cwd: historyFixture });
    execFileSync('git', ['config', 'user.name', 'Git Flow Test'], { cwd: historyFixture });
    fs.writeFileSync(path.join(historyFixture, 'README.md'), 'base\n');
    execFileSync('git', ['add', '--', 'README.md'], { cwd: historyFixture });
    execFileSync('git', ['commit', '--quiet', '-m', 'chore: base'], { cwd: historyFixture });
    execFileSync('git', ['branch', '-M', 'main'], { cwd: historyFixture });
    const baseCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: historyFixture, encoding: 'utf8' }).trim();
    execFileSync('git', ['update-ref', 'refs/remotes/upstream/main', baseCommit], { cwd: historyFixture });
    execFileSync('git', ['update-ref', 'refs/remotes/upstream/staging', baseCommit], { cwd: historyFixture });
    fs.mkdirSync(path.join(historyFixture, 'data'), { recursive: true });
    fs.writeFileSync(path.join(historyFixture, 'data', 'private.json'), '{"private":true}\n');
    execFileSync('git', ['add', '--', 'data/private.json'], { cwd: historyFixture });
    execFileSync('git', ['commit', '--quiet', '-m', 'chore: local private data'], { cwd: historyFixture });
    const privateCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: historyFixture, encoding: 'utf8' }).trim();
    execFileSync('git', ['update-ref', 'refs/remotes/upstream/main', privateCommit], { cwd: historyFixture });
    execFileSync('git', ['switch', '--quiet', '-c', 'feat/test-history'], { cwd: historyFixture });
    fs.writeFileSync(path.join(historyFixture, 'README.md'), 'feature\n');
    execFileSync('git', ['add', '--', 'README.md'], { cwd: historyFixture });
    execFileSync('git', ['commit', '--quiet', '-m', 'docs: feature change'], { cwd: historyFixture });
    const featureCommits = execFileSync(
      'git',
      ['rev-list', `${baseCommit}..HEAD`],
      { cwd: historyFixture, encoding: 'utf8' }
    ).trim().split(/\r?\n/);
    assert.ok(findProtectedBranchCommits(historyFixture, featureCommits).includes(privateCommit));
  } finally {
    fs.rmSync(historyFixture, { recursive: true, force: true });
  }

  let mergeCalls = [];
  let viewCount = 0;
  const approvedRunGh = (args) => {
    mergeCalls.push(args);
    if (args[0] === 'pr' && args[1] === 'view') {
      viewCount += 1;
      return JSON.stringify({
        state: viewCount < 3 ? 'OPEN' : 'MERGED',
        baseRefName: 'staging',
        headRefName: 'fix/booking',
        reviewDecision: 'APPROVED',
        mergeStateStatus: 'CLEAN'
      });
    }
    return '';
  };
  const merged = waitAndMergePullRequest({
    cwd: process.cwd(),
    repo: 'owner/repo',
    number: 12,
    expectedBase: 'staging',
    expectedHead: 'fix/booking',
    runGh: approvedRunGh
  });
  assert.deepEqual(merged, { state: 'merged' });
  assert.equal(mergeCalls.some((args) => args.includes('--admin')), false);
  assert.equal(mergeCalls.some((args) => args.includes('--required')), true);
  assert.equal(mergeCalls.some((args) => args.includes('--merge')), true);

  mergeCalls = [];
  viewCount = 0;
  const pendingReviewRunGh = (args) => {
    mergeCalls.push(args);
    if (args[0] === 'pr' && args[1] === 'view') {
      viewCount += 1;
      return JSON.stringify({
        state: 'OPEN',
        baseRefName: 'staging',
        headRefName: 'fix/booking',
        reviewDecision: 'REVIEW_REQUIRED',
        mergeStateStatus: 'BLOCKED'
      });
    }
    return '';
  };
  const pending = waitAndMergePullRequest({
    cwd: process.cwd(),
    repo: 'owner/repo',
    number: 13,
    expectedBase: 'staging',
    expectedHead: 'fix/booking',
    runGh: pendingReviewRunGh
  });
  assert.deepEqual(pending, { state: 'waiting' });
  assert.equal(mergeCalls.some((args) => args.includes('--auto')), true);
  assert.equal(mergeCalls.some((args) => args.includes('--admin')), false);

  mergeCalls = [];
  viewCount = 0;
  const mergeQueueRunGh = (args) => {
    mergeCalls.push(args);
    if (args[0] === 'pr' && args[1] === 'view') {
      viewCount += 1;
      return JSON.stringify({
        state: viewCount < 3 ? 'OPEN' : 'MERGED',
        baseRefName: 'staging',
        headRefName: 'fix/booking',
        reviewDecision: 'APPROVED',
        mergeStateStatus: viewCount < 3 ? 'QUEUED' : 'CLEAN'
      });
    }
    return '';
  };
  const queued = waitAndMergePullRequest({
    cwd: process.cwd(),
    repo: 'owner/repo',
    number: 15,
    expectedBase: 'staging',
    expectedHead: 'fix/booking',
    runGh: mergeQueueRunGh
  });
  assert.deepEqual(queued, { state: 'merged' });
  assert.equal(mergeCalls.some((args) => args.includes('--admin')), false);

  mergeCalls = [];
  viewCount = 0;
  const failedChecksRunGh = (args) => {
    mergeCalls.push(args);
    if (args[0] === 'pr' && args[1] === 'view') {
      return JSON.stringify({
        state: 'OPEN',
        baseRefName: 'staging',
        headRefName: 'fix/booking',
        reviewDecision: 'APPROVED',
        mergeStateStatus: 'CLEAN'
      });
    }
    if (args[0] === 'pr' && args[1] === 'checks') throw new Error('required check failed');
    return '';
  };
  assert.throws(() => waitAndMergePullRequest({
    cwd: process.cwd(),
    repo: 'owner/repo',
    number: 14,
    expectedBase: 'staging',
    expectedHead: 'fix/booking',
    runGh: failedChecksRunGh
  }), /required check failed/);
  assert.equal(mergeCalls.some((args) => args[1] === 'merge'), false);

  console.log('git flow tests passed');
  console.log('merge protection tests passed');
}

runTests();
