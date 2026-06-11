const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { ingestAnalysesToMemory } = require('../memoryUpdater');

test('memoryUpdater', async (t) => {
  const testDir = path.join(__dirname, 'test_memory_updater');
  const analysesDir = path.join(testDir, 'analyses');
  const memoryFilePath = path.join(testDir, 'sentinel5_memory.md');

  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
  fs.mkdirSync(testDir);
  fs.mkdirSync(analysesDir);

  const initialMemoryContent = `# Sentinel5 Correlation Memory\n\n## Known Failure Patterns\n\n| Defect ID | Failure Pattern / Root Cause | Impacted Files / Directories | Mitigation / Notes |\n| :--- | :--- | :--- | :--- |\n| 100 | Config Error | config.js | Fix config |\n\n## Unstable System Paths\n\n* /src/legacy/api.js`;

  await t.test('does nothing if directories do not exist', () => {
    ingestAnalysesToMemory(path.join(testDir, 'nonexistent'), memoryFilePath);
    assert.strictEqual(fs.existsSync(memoryFilePath), false);
  });

  await t.test('ingests new analysis correctly with legacy format', () => {
    fs.writeFileSync(memoryFilePath, initialMemoryContent, 'utf-8');

    const analysisContent = `### 1. 5-Why Analysis\nWhy? Because.\n\n### 2. Fault Categorization\nNull Pointer Exception\n\n### 3. Leak Stage Discovery\nDev\n\n### 4. Concrete Testing Mitigations\nAdd unit test for null checks`;
    fs.writeFileSync(path.join(analysesDir, 'ANALYSIS_BUG_101.md'), analysisContent, 'utf-8');

    ingestAnalysesToMemory(analysesDir, memoryFilePath);

    const updatedMemory = fs.readFileSync(memoryFilePath, 'utf-8');
    assert.ok(updatedMemory.includes('| 101 | Null Pointer Exception | Unknown | Add unit test for null checks |'));
    assert.ok(updatedMemory.includes('## Unstable System Paths'));
  });

  await t.test('ingests new analysis correctly with new format', () => {
    const analysisContent = `### 1. 5-Why Analysis\nWhy? Because.\n\n### 2. Fault Categorization\nBoundary Error\n\n### 3. Leak Stage Discovery\nDev\n\n### 4. Impacted Files / Directories\nsrc/math.js\n\n### 5. Concrete Testing Mitigations\nAdd boundary tests`;
    fs.writeFileSync(path.join(analysesDir, 'ANALYSIS_BUG_103.md'), analysisContent, 'utf-8');

    ingestAnalysesToMemory(analysesDir, memoryFilePath);

    const updatedMemory = fs.readFileSync(memoryFilePath, 'utf-8');
    assert.ok(updatedMemory.includes('| 103 | Boundary Error | src/math.js | Add boundary tests |'));
    assert.ok(updatedMemory.includes('## Unstable System Paths'));
  });

  await t.test('does not duplicate existing analysis', () => {
    const memoryBefore = fs.readFileSync(memoryFilePath, 'utf-8');

    // Call again with the same files
    ingestAnalysesToMemory(analysesDir, memoryFilePath);

    const memoryAfter = fs.readFileSync(memoryFilePath, 'utf-8');
    assert.strictEqual(memoryBefore, memoryAfter);
  });

  await t.test('handles missing sections gracefully', () => {
    const brokenAnalysisContent = `### 1. 5-Why Analysis\nWhy? Because.`;
    fs.writeFileSync(path.join(analysesDir, 'ANALYSIS_BUG_102.md'), brokenAnalysisContent, 'utf-8');

    ingestAnalysesToMemory(analysesDir, memoryFilePath);

    const updatedMemory = fs.readFileSync(memoryFilePath, 'utf-8');
    assert.ok(updatedMemory.includes('| 102 | Unknown | Unknown | Unknown |'));
  });

  // Cleanup
  fs.rmSync(testDir, { recursive: true, force: true });
});
