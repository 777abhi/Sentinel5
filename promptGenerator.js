const fs = require('fs');
const path = require('path');

const PROMPT_TEMPLATE_PATH = path.join(__dirname, 'prompts', 'predictive_threat_ingestion_prompt.md');
const WEEKLY_CHANGES_PATH = path.join(__dirname, 'weekly_changes.md');
const MEMORY_PATH = path.join(__dirname, 'sentinel5_memory.md');
const OUTPUT_PROMPT_PATH = path.join(__dirname, 'prompts', 'COMPILED_PREDICTIVE_THREAT_PROMPT.md');

async function generatePredictiveThreatPrompt() {
  try {
    let template = '';
    if (fs.existsSync(PROMPT_TEMPLATE_PATH)) {
      template = fs.readFileSync(PROMPT_TEMPLATE_PATH, 'utf-8');
    } else {
      console.warn(`Template not found at ${PROMPT_TEMPLATE_PATH}`);
      return;
    }

    let weeklyChanges = '';
    if (fs.existsSync(WEEKLY_CHANGES_PATH)) {
      weeklyChanges = fs.readFileSync(WEEKLY_CHANGES_PATH, 'utf-8');
    } else {
       weeklyChanges = 'No weekly changes report found.';
    }

    let memory = '';
    if (fs.existsSync(MEMORY_PATH)) {
      memory = fs.readFileSync(MEMORY_PATH, 'utf-8');
    } else {
      memory = 'No memory database found.';
    }

    const compiledPrompt = `${template}

### Weekly Changes
${weeklyChanges}

### Sentinel5 Memory
${memory}
`;

    fs.writeFileSync(OUTPUT_PROMPT_PATH, compiledPrompt, 'utf-8');
    console.log(`Successfully compiled predictive threat prompt to ${OUTPUT_PROMPT_PATH}`);
  } catch (error) {
    console.error('Error generating predictive threat prompt:', error.message);
  }
}

module.exports = {
  generatePredictiveThreatPrompt
};
