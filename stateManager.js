const fs = require('fs');
const csv = require('csv-parser');
const { formatDateToISO } = require('./utils');

function readExistingBugs(filePath) {
  return new Promise((resolve, reject) => {
    const results = [];
    if (!fs.existsSync(filePath)) {
      resolve(results);
      return;
    }
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', () => resolve(results))
      .on('error', (err) => reject(err));
  });
}

function initializeRepositoriesList(reposFilePath) {
  if (!fs.existsSync(reposFilePath)) {
    const defaultRepos = [
      "org/repo-1",
      "org/repo-2",
      "org/repo-3"
    ];
    fs.writeFileSync(reposFilePath, JSON.stringify(defaultRepos, null, 2), 'utf-8');
    console.log('Initialized repos.json with placeholder repositories.');
  }
}

function initializeMemoryDatabase(memoryFilePath) {
  if (!fs.existsSync(memoryFilePath)) {
    const schema = `# Sentinel5 Correlation Memory

This file serves as a central vulnerability index to log known failure patterns, impacted files or directories, and historical defect tracking IDs.

## Known Failure Patterns

| Defect ID | Failure Pattern / Root Cause | Impacted Files / Directories | Mitigation / Notes |
| :--- | :--- | :--- | :--- |
| (e.g., 123) | (e.g., Null pointer on missing config) | (e.g., src/config.js) | (e.g., Added null checks in PR #45) |

## Unstable System Paths

* (e.g., \`/src/legacy/api.js\` - frequent regressions during updates)
`;
    fs.writeFileSync(memoryFilePath, schema, 'utf-8');
    console.log('Initialized sentinel5_memory.md schema.');
  }
}

function manageState(stateFilePath) {
  const currentDate = new Date();
  let state;

  if (!fs.existsSync(stateFilePath)) {
    const startDate = new Date(currentDate);
    startDate.setDate(startDate.getDate() - 30);

    state = {
      startDate: formatDateToISO(startDate),
      endDate: formatDateToISO(currentDate)
    };

    fs.writeFileSync(stateFilePath, JSON.stringify(state, null, 2), 'utf-8');
    console.log('Initialized state.json:', state);
  } else {
    try {
      const rawData = fs.readFileSync(stateFilePath, 'utf-8');
      const parsedState = JSON.parse(rawData);

      const newStartDate = parsedState.endDate;
      const newEndDate = formatDateToISO(currentDate);

      state = {
        startDate: newStartDate,
        endDate: newEndDate
      };

      fs.writeFileSync(stateFilePath, JSON.stringify(state, null, 2), 'utf-8');
      console.log('Updated state.json:', state);
    } catch (error) {
      console.error('Error reading or parsing state.json:', error);
      throw error;
    }
  }
  return state;
}

module.exports = {
  readExistingBugs,
  initializeRepositoriesList,
  initializeMemoryDatabase,
  manageState
};
