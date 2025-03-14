// Use dynamic import for @octokit/rest
import { Octokit } from '@octokit/rest';
import fs from 'fs';

// Make this file an ES module by changing the import style
// This function will be called once the module is loaded
async function init() {
  // Initialize Octokit
  const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN
  });

  // Get repository information from environment variables
  const [owner, repo] = process.env.GITHUB_REPOSITORY.split('/');
  let tagName = '';
  let previousTag = process.env.PREVIOUS_TAG || ''; // Can be set manually or determined programmatically

  // Handle both tag and branch deployments
  if (process.env.GITHUB_REF && process.env.GITHUB_REF.startsWith('refs/tags/')) {
    tagName = process.env.GITHUB_REF.replace('refs/tags/', '');
  } else {
    // If not a tag deployment, use the branch name or a timestamp
    tagName = process.env.GITHUB_REF ? 
      process.env.GITHUB_REF.replace('refs/heads/', '') : 
      new Date().toISOString().slice(0, 10);
  }

  async function getPreviousTag() {
    if (previousTag) return previousTag;
    
    try {
      const { data: tags } = await octokit.repos.listTags({
        owner,
        repo,
        per_page: 10
      });
      
      // Find the tag before the current one
      for (let i = 0; i < tags.length; i++) {
        if (tags[i].name === tagName && i + 1 < tags.length) {
          return tags[i + 1].name;
        }
      }
      
      // If no previous tag is found or this is the first tag
      return '';
    } catch (error) {
      console.error('Error getting previous tag:', error);
      return '';
    }
  }

  async function getMergedPRs(fromTag, toTag) {
    // If no tags are available, fetch PRs from the last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const dateString = thirtyDaysAgo.toISOString().split('T')[0];
    
    const query = `repo:${owner}/${repo} is:pr is:merged` + 
                 (fromTag ? ` merged:>${fromTag}` : ` merged:>${dateString}`);
    
    try {
      const { data } = await octokit.search.issuesAndPullRequests({
        q: query,
        sort: 'created',
        order: 'desc',
        per_page: 100
      });
      
      return data.items;
    } catch (error) {
      console.error('Error getting merged PRs:', error);
      return [];
    }
  }

  async function getPRDetails(prNumber) {
    try {
      const { data } = await octokit.pulls.get({
        owner,
        repo,
        pull_number: prNumber
      });
      
      return {
        title: data.title,
        body: data.body || '',
        author: data.user.login,
        prNumber: prNumber,
        mergedAt: data.merged_at
      };
    } catch (error) {
      console.error(`Error getting details for PR #${prNumber}:`, error);
      return null;
    }
  }

  function generateComprehensiveReleaseNotes(prMessages) {
    const categorizedChanges = {
      features: [],
      bugfixes: [],
      improvements: [],
      docs: [],
      other: []
    };

    // Process each PR message
    prMessages.forEach(pr => {
      const { title, body, author, prNumber, mergedAt } = pr;
      
      // Determine category based on PR title
      let category = 'other';
      const lowerTitle = title.toLowerCase();
      
      if (lowerTitle.includes('feat') || lowerTitle.includes('feature') || lowerTitle.includes('add')) {
        category = 'features';
      } else if (lowerTitle.includes('fix') || lowerTitle.includes('bug') || lowerTitle.includes('issue')) {
        category = 'bugfixes';
      } else if (lowerTitle.includes('improve') || lowerTitle.includes('enhance') || lowerTitle.includes('update') || lowerTitle.includes('refactor')) {
        category = 'improvements';
      } else if (lowerTitle.includes('doc') || lowerTitle.includes('readme')) {
        category = 'docs';
      }
      
      // Format date if available
      const mergedDate = mergedAt ? `Merged on: ${new Date(mergedAt).toLocaleDateString()}` : '';
      
      // Include the COMPLETE content - both title and body
      const completeContent = `${title}\n\n${mergedDate}\n\n${body || ''}`;
      
      // Add to appropriate category
      categorizedChanges[category].push({
        completeContent: completeContent,
        prNumber: prNumber,
        author: author
      });
    });
    
    // Format the release notes
    let releaseNotes = `# Release Notes for ${tagName}\n\n`;
    
    // Add date
    const today = new Date();
    releaseNotes += `**Release Date:** ${today.toISOString().split('T')[0]}\n\n`;
    
    // Add each category
    for (const [category, changes] of Object.entries(categorizedChanges)) {
      if (changes.length > 0) {
        releaseNotes += `## ${category.charAt(0).toUpperCase() + category.slice(1)}\n\n`;
        
        changes.forEach(change => {
          releaseNotes += `### PR #${change.prNumber} by @${change.author}\n\n`;
          releaseNotes += `${change.completeContent}\n\n`;
          releaseNotes += "---\n\n";
        });
      }
    }
    
    return releaseNotes;
  }

  try {
    // Get the previous tag
    const fromTag = await getPreviousTag();
    console.log(`Generating release notes from ${fromTag || 'last 30 days'} to ${tagName}`);
    
    // Get merged PRs
    const mergedPRs = await getMergedPRs(fromTag, tagName);
    console.log(`Found ${mergedPRs.length} merged PRs`);
    
    // Get details for each PR
    const prDetails = [];
    for (const pr of mergedPRs) {
      const details = await getPRDetails(pr.number);
      if (details) {
        prDetails.push(details);
      }
    }
    
    // Generate release notes
    const releaseNotes = generateComprehensiveReleaseNotes(prDetails);
    
    // Write release notes to file
    fs.writeFileSync('release-notes.md', releaseNotes);
    console.log('Release notes generated successfully');
  } catch (error) {
    console.error('Error generating release notes:', error);
    process.exit(1);
  }
}

// Run the initialization function
init().catch(err => {
  console.error("Initialization error:", err);
  process.exit(1);
});