const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { generateWeeklyChangesReport, generatePromptFiles } = require('../reportGenerator');

test('reportGenerator', async (t) => {
  await t.test('generateWeeklyChangesReport writes file correctly', () => {
    const testPath = path.join(__dirname, 'test_weekly_changes.md');
    if (fs.existsSync(testPath)) fs.unlinkSync(testPath);
    const prs = [
      { id: 1, title: 'Test PR', repoName: 'org/repo', author: 'Author', closedDate: '2023-01-01T00:00:00Z', description: 'Desc', topImpactedFiles: ['file1.js'] }
    ];
    generateWeeklyChangesReport(prs, new Date('2023-01-01'), new Date('2023-01-07'), testPath);
    assert.strictEqual(fs.existsSync(testPath), true);
    const content = fs.readFileSync(testPath, 'utf8');
    assert.ok(content.includes('PR #1: Test PR'));
    assert.ok(content.includes('- file1.js'));
    if (fs.existsSync(testPath)) fs.unlinkSync(testPath);
  });

  await t.test('generateWeeklyChangesReport writes empty message', () => {
    const testPath = path.join(__dirname, 'test_weekly_changes_empty.md');
    if (fs.existsSync(testPath)) fs.unlinkSync(testPath);
    generateWeeklyChangesReport([], new Date('2023-01-01'), new Date('2023-01-07'), testPath);
    assert.strictEqual(fs.existsSync(testPath), true);
    const content = fs.readFileSync(testPath, 'utf8');
    assert.ok(content.includes('No merged pull requests found matching the criteria'));
    if (fs.existsSync(testPath)) fs.unlinkSync(testPath);
  });

  await t.test('generatePromptFiles creates directories and files', async () => {
    const testDir = path.join(__dirname, 'test_report_gen');
    if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });

    const bugs = [
      { ID: '101', Title: 'Bug 1', Description: 'Desc 1', Tags: 'tag', 'Created Date': 'date', 'Modified Date': 'date', Comments: 'None' }
    ];
    await generatePromptFiles(bugs, testDir);

    const promptFilePath = path.join(testDir, 'prompts', 'PROMPT_BUG_101.md');
    assert.strictEqual(fs.existsSync(promptFilePath), true);
    const content = fs.readFileSync(promptFilePath, 'utf8');
    assert.ok(content.includes('# Bug 101: Bug 1'));
    assert.ok(content.includes('### 4. Impacted Files / Directories'));
    assert.ok(content.includes('### 5. Concrete Testing Mitigations'));

    if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
  });
});
