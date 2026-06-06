const fs = require('fs');
const path = require('path');
const { formatDateToISO } = require('./utils');

function generateWeeklyChangesReport(prs, startDate, endDate, outputPath) {
  let markdown = `# Weekly Changes Report\n\n`;
  markdown += `**Period:** ${formatDateToISO(startDate)} to ${formatDateToISO(endDate)}\n\n`;

  if (prs.length === 0) {
    markdown += `No merged pull requests found matching the criteria in the targeted repositories.\n`;
  } else {
    for (const pr of prs) {
      markdown += `## PR #${pr.id}: ${pr.title}\n\n`;
      markdown += `- **Repository:** ${pr.repoName}\n`;
      markdown += `- **Author:** ${pr.author}\n`;
      markdown += `- **Closed Date:** ${pr.closedDate}\n\n`;

      markdown += `### Description\n`;
      markdown += `${pr.description || 'No description provided.'}\n\n`;

      markdown += `### Top Impacted Files\n`;
      if (pr.topImpactedFiles && pr.topImpactedFiles.length > 0) {
        for (const file of pr.topImpactedFiles) {
          markdown += `- ${file}\n`;
        }
      } else {
        markdown += `- No file changes detected or unable to fetch.\n`;
      }
      markdown += `\n---\n\n`;
    }
  }

  fs.writeFileSync(outputPath, markdown, 'utf-8');
  console.log(`Successfully generated ${outputPath}`);
}

async function generatePromptFiles(bugs, baseDir) {
  const promptsDir = path.join(baseDir, 'prompts');
  const analysesDir = path.join(baseDir, 'analyses');

  if (!fs.existsSync(promptsDir)) {
    fs.mkdirSync(promptsDir, { recursive: true });
  }
  if (!fs.existsSync(analysesDir)) {
    fs.mkdirSync(analysesDir, { recursive: true });
  }

  for (const bug of bugs) {
    const analysisFile = path.join(analysesDir, `ANALYSIS_BUG_${bug.ID}.md`);
    if (!fs.existsSync(analysisFile)) {
      const promptFile = path.join(promptsDir, `PROMPT_BUG_${bug.ID}.md`);
      const markdown = `# Bug ${bug.ID}: ${bug.Title}

## Description
${bug.Description}

**Tags:** ${bug.Tags}
**Created Date:** ${bug['Created Date']}
**Modified Date:** ${bug['Modified Date']}
**Comments:** ${bug.Comments || 'None'}

---

## System Persona
Act as a Principal QA and Staff Systems Architect.

## Instructions
Analyze the bug described above and provide your output in the following strict Markdown layout so it can be easily copied:

### 1. 5-Why Analysis
(Provide a rigorous 5-Why chain detailing the root cause of the issue)

### 2. Fault Categorization
(Categorize the defect into a specific technical or process fault area)

### 3. Leak Stage Discovery
(Identify the exact phase of the development lifecycle where this defect leaked and explain why)

### 4. Concrete Testing Mitigations
(Detail concrete testing mitigations and strategies to prevent this class of defect in the future)
`;
      fs.writeFileSync(promptFile, markdown, 'utf8');
      console.log(`Generated prompt file for bug ${bug.ID}`);
    } else {
      console.log(`Skipping bug ${bug.ID}: Analysis already exists.`);
    }
  }
}

module.exports = {
  generateWeeklyChangesReport,
  generatePromptFiles
};
