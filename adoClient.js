const fs = require('fs');
const GitInterfaces = require('azure-devops-node-api/interfaces/GitInterfaces');
const { stripHtmlTags, formatDateToISO } = require('./utils');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const { readExistingBugs } = require('./stateManager');

async function syncPullRequests(gitApi, project, weekAgo, reposFilePath) {
  if (!fs.existsSync(reposFilePath)) {
    console.log('repos.json not found, skipping multi-repo query.');
    return [];
  }

  let repos = [];
  try {
    const rawRepos = fs.readFileSync(reposFilePath, 'utf-8');
    repos = JSON.parse(rawRepos);
  } catch (err) {
    console.error('Error reading repos.json:', err.message);
    return [];
  }

  if (repos.length === 0) {
    console.log('No repositories defined in repos.json.');
    return [];
  }

  console.log(`Searching for pull requests merged since ${formatDateToISO(weekAgo)} in ${repos.length} repositories...`);

  let gitRepos = [];
  try {
    gitRepos = await gitApi.getRepositories(project);
  } catch (err) {
    console.error('Failed to fetch repositories for project:', err.message);
    return [];
  }

  const allWeeklyPrs = [];

  for (const repoName of repos) {
    try {
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
      const prs = await gitApi.getPullRequests(targetRepo.id, searchCriteria, project);

      const filteredPrs = prs.filter(pr => {
        const isTargetMatch = pr.targetRefName && (pr.targetRefName.includes('main') || pr.targetRefName.includes('release'));
        const isRecent = pr.closedDate && new Date(pr.closedDate) >= weekAgo;
        return isTargetMatch && isRecent;
      });

      console.log(`Found ${filteredPrs.length} relevant PRs in ${repoName}.`);

      for (const pr of filteredPrs) {
         console.log(`  - PR #${pr.pullRequestId}: ${pr.title} (Target: ${pr.targetRefName})`);

         const commitsPage = await gitApi.getPullRequestCommits(targetRepo.id, pr.pullRequestId, project);
         const commits = commitsPage || [];

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

  return allWeeklyPrs;
}

async function fetchAndMergeBugs(witApi, project, startDate, endDate, csvFilePath) {
  const wiql = {
    query: `SELECT [System.Id] FROM WorkItems WHERE [System.WorkItemType] = 'Bug' AND [System.TeamProject] = '${project}' AND [System.ChangedDate] >= '${startDate}' AND [System.ChangedDate] <= '${endDate}'`
  };

  console.log(`Executing WIQL query...`);
  const queryResult = await witApi.queryByWiql(wiql, { project });

  if (!queryResult.workItems || queryResult.workItems.length === 0) {
    console.log('No bugs found matching the criteria.');
    return await readExistingBugs(csvFilePath);
  }

  const workItemIds = queryResult.workItems.map(wi => wi.id);
  console.log(`Found ${workItemIds.length} bugs. Fetching details...`);

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

  const existingBugs = await readExistingBugs(csvFilePath);
  const bugMap = new Map();

  for (const bug of existingBugs) {
    bugMap.set(String(bug.ID), bug);
  }

  for (const newBug of formattedBugs) {
    const bugIdStr = String(newBug.id);
    if (bugMap.has(bugIdStr)) {
      const existingBug = bugMap.get(bugIdStr);
      const existingDate = new Date(existingBug['Modified Date']);
      const newDate = new Date(newBug.changedDate);
      if (newDate > existingDate) {
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
    path: csvFilePath,
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
  console.log(`Successfully wrote ${mergedBugs.length} bugs to ${csvFilePath}.`);
  return mergedBugs;
}

module.exports = {
  syncPullRequests,
  fetchAndMergeBugs
};
