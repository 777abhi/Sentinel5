const fs = require('fs');
const path = require('path');
const azdev = require('azure-devops-node-api');

const STATE_FILE_PATH = path.join(__dirname, 'state.json');

function stripHtmlTags(str) {
  if (!str) return '';
  return str.replace(/<[^>]*>?/gm, '').trim();
}

async function main() {
  const orgUrl = process.env.ADO_ORG_URL;
  const token = process.env.ADO_PAT;
  const project = process.env.ADO_PROJECT;

  const currentDate = new Date();
  let state;

  if (!fs.existsSync(STATE_FILE_PATH)) {
    // If it does not exist, initialize it with a startDate of 30 days ago and an endDate of today
    const startDate = new Date(currentDate);
    startDate.setDate(startDate.getDate() - 30);

    state = {
      startDate: startDate.toISOString(),
      endDate: currentDate.toISOString()
    };

    fs.writeFileSync(STATE_FILE_PATH, JSON.stringify(state, null, 2), 'utf-8');
    console.log('Initialized state.json:', state);
  } else {
    // If it does exist, slide the date window forward
    try {
      const rawData = fs.readFileSync(STATE_FILE_PATH, 'utf-8');
      const parsedState = JSON.parse(rawData);

      const newStartDate = parsedState.endDate; // The old endDate becomes the new startDate
      const newEndDate = currentDate.toISOString();

      state = {
        startDate: newStartDate,
        endDate: newEndDate
      };

      fs.writeFileSync(STATE_FILE_PATH, JSON.stringify(state, null, 2), 'utf-8');
      console.log('Updated state.json:', state);
    } catch (error) {
      console.error('Error reading or parsing state.json:', error);
      return;
    }
  }

  // ADO Integration
  if (!orgUrl || !token || !project) {
    console.log('ADO credentials (ADO_ORG_URL, ADO_PAT, ADO_PROJECT) not provided. Skipping API sync.');
    return;
  }

  try {
    const authHandler = azdev.getPersonalAccessTokenHandler(token);
    const connection = new azdev.WebApi(orgUrl, authHandler);
    const witApi = await connection.getWorkItemTrackingApi();

    const wiql = {
      query: `SELECT [System.Id] FROM WorkItems WHERE [System.WorkItemType] = 'Bug' AND [System.TeamProject] = '${project}' AND [System.ChangedDate] >= '${state.startDate}' AND [System.ChangedDate] <= '${state.endDate}'`
    };

    console.log(`Executing WIQL query...`);
    const queryResult = await witApi.queryByWiql(wiql, { project });

    if (!queryResult.workItems || queryResult.workItems.length === 0) {
      console.log('No bugs found matching the criteria.');
      return;
    }

    const workItemIds = queryResult.workItems.map(wi => wi.id);
    console.log(`Found ${workItemIds.length} bugs. Fetching details...`);

    // Fetch full details for the bugs
    // We typically fetch in chunks, but let's try a single call first if < 200, otherwise we'd need chunks.
    // Azure DevOps API allows max 200 work items in a single getWorkItems call.
    const CHUNK_SIZE = 200;
    const allBugs = [];

    for (let i = 0; i < workItemIds.length; i += CHUNK_SIZE) {
      const chunkIds = workItemIds.slice(i, i + CHUNK_SIZE);
      const bugs = await witApi.getWorkItems(chunkIds);
      allBugs.push(...bugs);
    }

    const formattedBugs = allBugs.map(bug => {
      const fields = bug.fields || {};
      return {
        id: bug.id,
        title: fields['System.Title'] || '',
        description: stripHtmlTags(fields['System.Description']),
        state: fields['System.State'] || '',
        tags: fields['System.Tags'] || '',
        createdDate: fields['System.CreatedDate'] || '',
        changedDate: fields['System.ChangedDate'] || ''
      };
    });

    console.log('Structured and sanitized bug records:');
    console.log(JSON.stringify(formattedBugs, null, 2));

  } catch (error) {
    console.error('Error connecting to Azure DevOps or fetching bugs:', error.message);
  }
}

main();
