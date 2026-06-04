const fs = require('fs');
const path = require('path');
const azdev = require('azure-devops-node-api');
const GitInterfaces = require('azure-devops-node-api/interfaces/GitInterfaces');
const csv = require('csv-parser');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const { stripHtmlTags, formatDateToISO } = require('./utils');
const { generatePredictiveThreatPrompt } = require('./promptGenerator');

const STATE_FILE_PATH = path.join(__dirname, 'state.json');
const CSV_FILE_PATH = path.join(__dirname, 'defects.csv');
const MEMORY_FILE_PATH = path.join(__dirname, 'sentinel5_memory.md');
const REPOS_FILE_PATH = path.join(__dirname, 'repos.json');
const WEEKLY_CHANGES_FILE_PATH = path.join(__dirname, 'weekly_changes.md');

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


function initializeRepositoriesList() {
  if (!fs.existsSync(REPOS_FILE_PATH)) {
    const defaultRepos = [
      "org/repo-1",
      "org/repo-2",
      "org/repo-3"
    ];
    fs.writeFileSync(REPOS_FILE_PATH, JSON.stringify(defaultRepos, null, 2), 'utf-8');
    console.log('Initialized repos.json with placeholder repositories.');
  }
}

function initializeMemoryDatabase() {
  if (!fs.existsSync(MEMORY_FILE_PATH)) {
    const schema = `# Sentinel5 Correlation Memory

This file serves as a central vulnerability index to log known failure patterns, impacted files or directories, and historical defect tracking IDs.

## Known Failure Patterns

| Defect ID | Failure Pattern / Root Cause | Impacted Files / Directories | Mitigation / Notes |
| :--- | :--- | :--- | :--- |
| (e.g., 123) | (e.g., Null pointer on missing config) | (e.g., src/config.js) | (e.g., Added null checks in PR #45) |

## Unstable System Paths

* (e.g., \`/src/legacy/api.js\` - frequent regressions during updates)
`;
    fs.writeFileSync(MEMORY_FILE_PATH, schema, 'utf-8');
    console.log('Initialized sentinel5_memory.md schema.');
  }
}


async function syncPullRequests(connection, project, state) {
  if (!fs.existsSync(REPOS_FILE_PATH)) {
    console.log('repos.json not found, skipping multi-repo query.');
    return;
  }

  let repos = [];
  try {
    const rawRepos = fs.readFileSync(REPOS_FILE_PATH, 'utf-8');
    repos = JSON.parse(rawRepos);
  } catch (err) {
    console.error('Error reading repos.json:', err.message);
    return;
  }

  if (repos.length === 0) {
    console.log('No repositories defined in repos.json.');
    return;
  }

  const gitApi = await connection.getGitApi();
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  console.log(`Searching for pull requests merged since ${formatDateToISO(weekAgo)} in ${repos.length} repositories...`);

  let gitRepos = [];
  try {
    gitRepos = await gitApi.getRepositories(project);
  } catch (err) {
    console.error('Failed to fetch repositories for project:', err.message);
    return;
  }

  const allWeeklyPrs = [];

  for (const repoName of repos) {
    try {
      // Find the repository ID by name
      const targetRepo = gitRepos.find(r => r.name === repoName || repoName.endsWith(`/${r.name}`));

      if (!targetRepo) {
         console.warn(`Repository ${repoName} not found in project ${project}.`);
         continue;
      }

      const searchCriteria = {
        status: GitInterfaces.PullRequestStatus.Completed,
        minTime: weekAgo
      };

      console.log(`Fetching PRs for ${repoName}...`);
      // Use azdev's getPullRequests
      const prs = await gitApi.getPullRequests(targetRepo.id, searchCriteria, project);

      const filteredPrs = prs.filter(pr => {
        const isTargetMatch = pr.targetRefName && (pr.targetRefName.includes('main') || pr.targetRefName.includes('release'));
        const isRecent = pr.closedDate && new Date(pr.closedDate) >= weekAgo;
        return isTargetMatch && isRecent;
      });

      console.log(`Found ${filteredPrs.length} relevant PRs in ${repoName}.`);

      // We can do something with the PRs later, for now we just log
      for (const pr of filteredPrs) {
         console.log(`  - PR #${pr.pullRequestId}: ${pr.title} (Target: ${pr.targetRefName})`);

         // Get commits for the PR
         const commitsPage = await gitApi.getPullRequestCommits(targetRepo.id, pr.pullRequestId, project);
         const commits = commitsPage || []; // Assuming array or array-like structure inside if paged

         const fileImpactCounts = new Map();

         if (commits && commits.length > 0) {
           for (const commit of commits) {
             try {
               const commitChanges = await gitApi.getChanges(commit.commitId, targetRepo.id, project);
               if (commitChanges && commitChanges.changes) {
                 for (const change of commitChanges.changes) {
                   if (change.item && change.item.path) {
                     const path = change.item.path;
                     fileImpactCounts.set(path, (fileImpactCounts.get(path) || 0) + 1);
                   }
                 }
               }
             } catch (commitErr) {
               console.warn(`    Failed to fetch changes for commit ${commit.commitId}: ${commitErr.message}`);
             }
           }
         }

         // Sort files by impact count descending and take top 5
         const topImpactedFiles = Array.from(fileImpactCounts.entries())
           .sort((a, b) => b[1] - a[1])
           .slice(0, 5)
           .map(entry => entry[0]);

         allWeeklyPrs.push({
           repoName: repoName,
           id: pr.pullRequestId,
           title: pr.title,
           author: pr.createdBy ? (pr.createdBy.displayName || pr.createdBy.uniqueName || 'Unknown') : 'Unknown',
           closedDate: pr.closedDate ? formatDateToISO(pr.closedDate) : 'Unknown',
           description: stripHtmlTags(pr.description),
           topImpactedFiles: topImpactedFiles
         });
      }

    } catch (err) {
       console.error(`Failed to sync PRs for ${repoName}: ${err.message}`);
    }
  }

  generateWeeklyChangesReport(allWeeklyPrs, weekAgo, new Date());
}

function generateWeeklyChangesReport(prs, startDate, endDate) {
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
      if (pr.topImpactedFiles.length > 0) {
        for (const file of pr.topImpactedFiles) {
          markdown += `- ${file}\n`;
        }
      } else {
        markdown += `- No file changes detected or unable to fetch.\n`;
      }
      markdown += `\n---\n\n`;
    }
  }

  fs.writeFileSync(WEEKLY_CHANGES_FILE_PATH, markdown, 'utf-8');
  console.log(`Successfully generated ${WEEKLY_CHANGES_FILE_PATH}`);
}

async function main() {
  const orgUrl = process.env.ADO_ORG_URL;
  const token = process.env.ADO_PAT;
  const project = process.env.ADO_PROJECT;

  initializeMemoryDatabase();
  initializeRepositoriesList();

  const currentDate = new Date();
  let state;

  if (!fs.existsSync(STATE_FILE_PATH)) {
    // If it does not exist, initialize it with a startDate of 30 days ago and an endDate of today
    const startDate = new Date(currentDate);
    startDate.setDate(startDate.getDate() - 30);

    state = {
      startDate: formatDateToISO(startDate),
      endDate: formatDateToISO(currentDate)
    };

    fs.writeFileSync(STATE_FILE_PATH, JSON.stringify(state, null, 2), 'utf-8');
    console.log('Initialized state.json:', state);
  } else {
    // If it does exist, slide the date window forward
    try {
      const rawData = fs.readFileSync(STATE_FILE_PATH, 'utf-8');
      const parsedState = JSON.parse(rawData);

      const newStartDate = parsedState.endDate; // The old endDate becomes the new startDate
      const newEndDate = formatDateToISO(currentDate);

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
    const existingBugs = await readExistingBugs(CSV_FILE_PATH);
    await generatePromptFiles(existingBugs);
    await generatePredictiveThreatPrompt();
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
      const existingBugs = await readExistingBugs(CSV_FILE_PATH);
      await generatePromptFiles(existingBugs);
      await generatePredictiveThreatPrompt();
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
        createdDate: formatDateToISO(fields['System.CreatedDate']),
        changedDate: formatDateToISO(fields['System.ChangedDate'])
      };
    });

    console.log('Structured and sanitized bug records:');
    // console.log(JSON.stringify(formattedBugs, null, 2)); // Optionally comment this out

    const existingBugs = await readExistingBugs(CSV_FILE_PATH);

    // Merge bugs (deduplicate by id)
    const bugMap = new Map();

    // Map existing bugs first
    for (const bug of existingBugs) {
      // Depending on CSV headers, adjust properties.
      // Assuming headers will match the expected output.
      bugMap.set(String(bug.ID), bug);
    }

    // Process new bugs
    for (const newBug of formattedBugs) {
      const bugIdStr = String(newBug.id);
      if (bugMap.has(bugIdStr)) {
        const existingBug = bugMap.get(bugIdStr);
        // Compare dates if both exist
        const existingDate = new Date(existingBug['Modified Date']);
        const newDate = new Date(newBug.changedDate);
        if (newDate > existingDate) {
          // Replace with new bug
          bugMap.set(bugIdStr, {
            ID: newBug.id,
            Title: newBug.title,
            Description: newBug.description,
            Tags: newBug.tags,
            'Created Date': newBug.createdDate,
            'Modified Date': newBug.changedDate,
            Comments: existingBug.Comments || ''
          });
        }
      } else {
        bugMap.set(bugIdStr, {
          ID: newBug.id,
          Title: newBug.title,
          Description: newBug.description,
          Tags: newBug.tags,
          'Created Date': newBug.createdDate,
          'Modified Date': newBug.changedDate,
          Comments: ''
        });
      }
    }

    const mergedBugs = Array.from(bugMap.values());
    console.log(`Merged dataset contains ${mergedBugs.length} unique bugs.`);

    const csvWriter = createCsvWriter({
      path: CSV_FILE_PATH,
      header: [
        { id: 'ID', title: 'ID' },
        { id: 'Title', title: 'Title' },
        { id: 'Description', title: 'Description' },
        { id: 'Tags', title: 'Tags' },
        { id: 'Created Date', title: 'Created Date' },
        { id: 'Modified Date', title: 'Modified Date' },
        { id: 'Comments', title: 'Comments' }
      ]
    });

    await csvWriter.writeRecords(mergedBugs);
    console.log(`Successfully wrote ${mergedBugs.length} bugs to ${CSV_FILE_PATH}.`);
    await generatePromptFiles(mergedBugs);

    await syncPullRequests(connection, project, state);

  } catch (error) {
    console.error('Error connecting to Azure DevOps or fetching bugs:', error.message);
    const existingBugs = await readExistingBugs(CSV_FILE_PATH);
    await generatePromptFiles(existingBugs);
  }

  await generatePredictiveThreatPrompt();
}

main();


async function generatePromptFiles(bugs) {
  const promptsDir = path.join(__dirname, 'prompts');
  const analysesDir = path.join(__dirname, 'analyses');

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
