const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { generatePredictiveThreatPrompt } = require('./promptGenerator');

const PROMPT_TEMPLATE_PATH = path.join(__dirname, 'prompts', 'predictive_threat_ingestion_prompt.md');
const WEEKLY_CHANGES_PATH = path.join(__dirname, 'weekly_changes.md');
const MEMORY_PATH = path.join(__dirname, 'sentinel5_memory.md');
const OUTPUT_PROMPT_PATH = path.join(__dirname, 'prompts', 'COMPILED_PREDICTIVE_THREAT_PROMPT.md');

// Setup mock content
const mockTemplate = '# Mock Template\nData:';
const mockWeekly = 'Mock Weekly Changes';
const mockMemory = 'Mock Memory';

test('generatePredictiveThreatPrompt', async (t) => {
  await t.test('compiles prompt successfully with valid inputs', async () => {
    // Save original states if they exist
    const origTemplateExists = fs.existsSync(PROMPT_TEMPLATE_PATH);
    const origWeeklyExists = fs.existsSync(WEEKLY_CHANGES_PATH);
    const origMemoryExists = fs.existsSync(MEMORY_PATH);
    const origOutputExists = fs.existsSync(OUTPUT_PROMPT_PATH);

    let origTemplate = '';
    let origWeekly = '';
    let origMemory = '';
    let origOutput = '';

    if (origTemplateExists) origTemplate = fs.readFileSync(PROMPT_TEMPLATE_PATH, 'utf-8');
    if (origWeeklyExists) origWeekly = fs.readFileSync(WEEKLY_CHANGES_PATH, 'utf-8');
    if (origMemoryExists) origMemory = fs.readFileSync(MEMORY_PATH, 'utf-8');
    if (origOutputExists) origOutput = fs.readFileSync(OUTPUT_PROMPT_PATH, 'utf-8');

    // Make sure dirs exist
    const promptsDir = path.join(__dirname, 'prompts');
    if (!fs.existsSync(promptsDir)) {
      fs.mkdirSync(promptsDir);
    }

    // Write mocks
    fs.writeFileSync(PROMPT_TEMPLATE_PATH, mockTemplate, 'utf-8');
    fs.writeFileSync(WEEKLY_CHANGES_PATH, mockWeekly, 'utf-8');
    fs.writeFileSync(MEMORY_PATH, mockMemory, 'utf-8');

    await generatePredictiveThreatPrompt();

    assert.strictEqual(fs.existsSync(OUTPUT_PROMPT_PATH), true);
    const result = fs.readFileSync(OUTPUT_PROMPT_PATH, 'utf-8');

    assert.match(result, /# Mock Template/);
    assert.match(result, /### Weekly Changes\nMock Weekly Changes/);
    assert.match(result, /### Sentinel5 Memory\nMock Memory/);

    // Restore original state
    if (origTemplateExists) {
        fs.writeFileSync(PROMPT_TEMPLATE_PATH, origTemplate, 'utf-8');
    } else {
        fs.unlinkSync(PROMPT_TEMPLATE_PATH);
    }

    if (origWeeklyExists) {
        fs.writeFileSync(WEEKLY_CHANGES_PATH, origWeekly, 'utf-8');
    } else {
        fs.unlinkSync(WEEKLY_CHANGES_PATH);
    }

    if (origMemoryExists) {
        fs.writeFileSync(MEMORY_PATH, origMemory, 'utf-8');
    } else {
        fs.unlinkSync(MEMORY_PATH);
    }

    if (origOutputExists) {
        fs.writeFileSync(OUTPUT_PROMPT_PATH, origOutput, 'utf-8');
    } else {
        fs.unlinkSync(OUTPUT_PROMPT_PATH);
    }
  });
});
