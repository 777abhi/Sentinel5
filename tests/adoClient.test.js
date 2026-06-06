const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { syncPullRequests, fetchAndMergeBugs } = require('../adoClient');

test('adoClient', async (t) => {
  await t.test('syncPullRequests returns empty if no repos file', async () => {
    const gitApi = {};
    const res = await syncPullRequests(gitApi, 'proj', new Date(), path.join(__dirname, 'non_existent.json'));
    assert.deepStrictEqual(res, []);
  });

  await t.test('syncPullRequests processes repos correctly', async () => {
    const reposPath = path.join(__dirname, 'test_repos_ado.json');
    fs.writeFileSync(reposPath, JSON.stringify(['test-repo']), 'utf8');

    const mockGitApi = {
      getRepositories: async () => [{ name: 'test-repo', id: '123' }],
      getPullRequests: async () => [{ pullRequestId: 1, title: 'pr1', targetRefName: 'main', closedDate: new Date().toISOString() }],
      getPullRequestCommits: async () => [{ commitId: 'abc' }],
      getChanges: async () => ({ changes: [{ item: { path: 'file.js' } }] })
    };

    const res = await syncPullRequests(mockGitApi, 'proj', new Date(0), reposPath);
    assert.strictEqual(res.length, 1);
    assert.strictEqual(res[0].repoName, 'test-repo');
    assert.strictEqual(res[0].id, 1);
    assert.deepStrictEqual(res[0].topImpactedFiles, ['file.js']);

    if (fs.existsSync(reposPath)) fs.unlinkSync(reposPath);
  });

  await t.test('fetchAndMergeBugs handles no bugs found', async () => {
    const mockWitApi = {
      queryByWiql: async () => ({ workItems: [] })
    };
    const csvPath = path.join(__dirname, 'test_bugs.csv');
    if (fs.existsSync(csvPath)) fs.unlinkSync(csvPath);

    const res = await fetchAndMergeBugs(mockWitApi, 'proj', 'date', 'date', csvPath);
    assert.deepStrictEqual(res, []);
  });

  await t.test('fetchAndMergeBugs merges and writes bugs', async () => {
    const mockWitApi = {
      queryByWiql: async () => ({ workItems: [{ id: 1 }] }),
      getWorkItems: async () => [{ id: 1, fields: { 'System.Title': 'bug', 'System.CreatedDate': '2023-01-01', 'System.ChangedDate': '2023-01-02' } }]
    };
    const csvPath = path.join(__dirname, 'test_bugs.csv');
    if (fs.existsSync(csvPath)) fs.unlinkSync(csvPath);

    const res = await fetchAndMergeBugs(mockWitApi, 'proj', 'date', 'date', csvPath);
    assert.strictEqual(res.length, 1);
    assert.strictEqual(res[0].ID, 1);
    assert.strictEqual(res[0].Title, 'bug');
    assert.strictEqual(fs.existsSync(csvPath), true);

    if (fs.existsSync(csvPath)) fs.unlinkSync(csvPath);
  });
});
