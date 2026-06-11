const fs = require('fs');
const path = require('path');

function ingestAnalysesToMemory(analysesDir, memoryFilePath) {
  if (!fs.existsSync(analysesDir) || !fs.existsSync(memoryFilePath)) {
    return;
  }

  const memoryContent = fs.readFileSync(memoryFilePath, 'utf-8');
  const memoryLines = memoryContent.split('\n');

  // Find where the table starts and existing IDs
  let tableStartIdx = -1;
  const existingIds = new Set();

  for (let i = 0; i < memoryLines.length; i++) {
    const line = memoryLines[i].trim();
    if (line.startsWith('| Defect ID |')) {
      tableStartIdx = i;
    } else if (tableStartIdx !== -1 && line.startsWith('|') && !line.startsWith('| :---')) {
      const parts = line.split('|');
      if (parts.length > 1) {
        const idStr = parts[1].trim();
        existingIds.add(idStr);
      }
    }
  }

  if (tableStartIdx === -1) {
    console.warn('Could not find Known Failure Patterns table in memory database.');
    return;
  }

  let tableEndIdx = tableStartIdx + 1;
  while (tableEndIdx < memoryLines.length && memoryLines[tableEndIdx].trim().startsWith('|')) {
    tableEndIdx++;
  }

  const files = fs.readdirSync(analysesDir);
  const newRows = [];

  for (const file of files) {
    if (file.startsWith('ANALYSIS_BUG_') && file.endsWith('.md')) {
      const bugId = file.replace('ANALYSIS_BUG_', '').replace('.md', '');

      if (!existingIds.has(bugId) && !existingIds.has(`(e.g., ${bugId})`)) {
        const analysisPath = path.join(analysesDir, file);
        const analysisContent = fs.readFileSync(analysisPath, 'utf-8');

        let rootCause = 'Unknown';
        let mitigation = 'Unknown';
        let impactedFiles = 'Unknown';

        const lines = analysisContent.split('\n');
        let currentSection = '';

        for (const line of lines) {
          if (line.startsWith('### ')) {
            currentSection = line.substring(4).trim();
          } else if (line.trim().length > 0 && !line.startsWith('(')) {
            if (currentSection === '2. Fault Categorization' && rootCause === 'Unknown') {
              rootCause = line.trim().replace(/\|/g, '-');
            } else if (currentSection === '4. Impacted Files / Directories' && impactedFiles === 'Unknown') {
              impactedFiles = line.trim().replace(/\|/g, '-');
            } else if ((currentSection === '5. Concrete Testing Mitigations' || currentSection === '4. Concrete Testing Mitigations') && mitigation === 'Unknown') {
              mitigation = line.trim().replace(/\|/g, '-');
            }
          }
        }

        // Truncate long texts to fit in table nicely
        rootCause = rootCause.length > 50 ? rootCause.substring(0, 47) + '...' : rootCause;
        mitigation = mitigation.length > 50 ? mitigation.substring(0, 47) + '...' : mitigation;
        impactedFiles = impactedFiles.length > 50 ? impactedFiles.substring(0, 47) + '...' : impactedFiles;

        newRows.push(`| ${bugId} | ${rootCause} | ${impactedFiles} | ${mitigation} |`);
      }
    }
  }

  if (newRows.length > 0) {
    memoryLines.splice(tableEndIdx, 0, ...newRows);
    fs.writeFileSync(memoryFilePath, memoryLines.join('\n'), 'utf-8');
    console.log(`Ingested ${newRows.length} new analyses into Sentinel5 memory database.`);
  }
}

module.exports = {
  ingestAnalysesToMemory
};
