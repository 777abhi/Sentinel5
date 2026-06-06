const fs = require('fs');
const path = require('path');
const azdev = require('azure-devops-node-api');
const { generatePredictiveThreatPrompt } = require('./promptGenerator');
const { readExistingBugs, initializeRepositoriesList, initializeMemoryDatabase, manageState } = require('./stateManager');
const { generateWeeklyChangesReport, generatePromptFiles } = require('./reportGenerator');
const { syncPullRequests, fetchAndMergeBugs } = require('./adoClient');

const STATE_FILE_PATH = path.join(__dirname, 'state.json');
const CSV_FILE_PATH = path.join(__dirname, 'defects.csv');
const MEMORY_FILE_PATH = path.join(__dirname, 'sentinel5_memory.md');
const REPOS_FILE_PATH = path.join(__dirname, 'repos.json');
const WEEKLY_CHANGES_FILE_PATH = path.join(__dirname, 'weekly_changes.md');

async function main() {
  const orgUrl = process.env.ADO_ORG_URL;
  const token = process.env.ADO_PAT;
  const project = process.env.ADO_PROJECT;

  initializeMemoryDatabase(MEMORY_FILE_PATH);
  initializeRepositoriesList(REPOS_FILE_PATH);

  let state;
  try {
    state = manageState(STATE_FILE_PATH);
  } catch (error) {
    return;
  }

  // ADO Integration
  if (!orgUrl || !token || !project) {
    console.log('ADO credentials (ADO_ORG_URL, ADO_PAT, ADO_PROJECT) not provided. Skipping API sync.');
    const existingBugs = await readExistingBugs(CSV_FILE_PATH);
    await generatePromptFiles(existingBugs, __dirname);
    await generatePredictiveThreatPrompt();
    return;
  }

  try {
    const authHandler = azdev.getPersonalAccessTokenHandler(token);
    const connection = new azdev.WebApi(orgUrl, authHandler);
    const witApi = await connection.getWorkItemTrackingApi();
    const gitApi = await connection.getGitApi();

    const mergedBugs = await fetchAndMergeBugs(witApi, project, state.startDate, state.endDate, CSV_FILE_PATH);
    await generatePromptFiles(mergedBugs, __dirname);

    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const allWeeklyPrs = await syncPullRequests(gitApi, project, weekAgo, REPOS_FILE_PATH);
    generateWeeklyChangesReport(allWeeklyPrs, weekAgo, new Date(), WEEKLY_CHANGES_FILE_PATH);

  } catch (error) {
    console.error('Error connecting to Azure DevOps or fetching bugs:', error.message);
    const existingBugs = await readExistingBugs(CSV_FILE_PATH);
    await generatePromptFiles(existingBugs, __dirname);
  }

  await generatePredictiveThreatPrompt();
}

if (require.main === module) {
  main();
}

module.exports = {
  main
};
