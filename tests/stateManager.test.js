const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { readExistingBugs, initializeRepositoriesList, initializeMemoryDatabase, manageState } = require('../stateManager');

test('stateManager', async (t) => {
  await t.test('initializeRepositoriesList creates file', () => {
    const testPath = path.join(__dirname, 'test_repos.json');
    if (fs.existsSync(testPath)) fs.unlinkSync(testPath);
    initializeRepositoriesList(testPath);
    assert.strictEqual(fs.existsSync(testPath), true);
    const data = JSON.parse(fs.readFileSync(testPath, 'utf8'));
    assert.deepStrictEqual(data, ["org/repo-1", "org/repo-2", "org/repo-3"]);
    if (fs.existsSync(testPath)) fs.unlinkSync(testPath);
  });

  await t.test('initializeMemoryDatabase creates file', () => {
    const testPath = path.join(__dirname, 'test_memory.md');
    if (fs.existsSync(testPath)) fs.unlinkSync(testPath);
    initializeMemoryDatabase(testPath);
    assert.strictEqual(fs.existsSync(testPath), true);
    const content = fs.readFileSync(testPath, 'utf8');
    assert.ok(content.includes('# Sentinel5 Correlation Memory'));
    if (fs.existsSync(testPath)) fs.unlinkSync(testPath);
  });

  await t.test('manageState initializes state.json', () => {
    const testPath = path.join(__dirname, 'test_state.json');
    if (fs.existsSync(testPath)) fs.unlinkSync(testPath);
    const state = manageState(testPath);
    assert.strictEqual(fs.existsSync(testPath), true);
    assert.ok(state.startDate);
    assert.ok(state.endDate);
    if (fs.existsSync(testPath)) fs.unlinkSync(testPath);
  });

  await t.test('manageState slides date window', () => {
    const testPath = path.join(__dirname, 'test_state2.json');
    if (fs.existsSync(testPath)) fs.unlinkSync(testPath);

    // Create initial state
    const oldEndDate = new Date();
    oldEndDate.setDate(oldEndDate.getDate() - 1);
    const oldState = { startDate: '2023-01-01T00:00:00.000Z', endDate: oldEndDate.toISOString() };
    fs.writeFileSync(testPath, JSON.stringify(oldState), 'utf8');

    const state = manageState(testPath);
    assert.strictEqual(state.startDate, oldState.endDate);
    assert.notStrictEqual(state.endDate, oldState.endDate);
    if (fs.existsSync(testPath)) fs.unlinkSync(testPath);
  });

  await t.test('readExistingBugs returns empty array if file does not exist', async () => {
    const bugs = await readExistingBugs(path.join(__dirname, 'non_existent.csv'));
    assert.deepStrictEqual(bugs, []);
  });
});
