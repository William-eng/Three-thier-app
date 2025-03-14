(async () => {
  const { Octokit } = await import('@octokit/rest');
  const fs = await import('fs');

  async function init() {
    const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
    const [owner, repo] = process.env.GITHUB_REPOSITORY.split('/');
    let tagName = '';
    let previousTag = process.env.PREVIOUS_TAG || '';

    if (process.env.GITHUB_REF && process.env.GITHUB_REF.startsWith('refs/tags/')) {
      tagName = process.env.GITHUB_REF.replace('refs/tags/', '');
    } else {
      tagName = process.env.GITHUB_REF ? 
        process.env.GITHUB_REF.replace('refs/heads/', '') : 
        new Date().toISOString().slice(0, 10);
    }

    async function getPreviousTag() {
      if (previousTag) return previousTag;
      try {
        const { data: tags } = await octokit.repos.listTags({ owner, repo, per_page: 10 });
        for (let i = 0; i < tags.length; i++) {
          if (tags[i].name === tagName && i + 1 < tags.length) {
            return tags[i + 1].name;
          }
        }
        return '';
      } catch (error) {
        console.error('Error getting previous tag:', error);
        return '';
      }
    }

    async function getMergedPRs(fromTag, toTag) {
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
        const { data } = await octokit.pulls.get({ owner, repo, pull_number: prNumber });
        return {
          title: data.title,
          body: data.body || '',
          author: data.user.login,
          prNumber,
          mergedAt: data.merged_at
        };
      } catch (error) {
        console.error(`Error getting details for PR #${prNumber}:`, error);
        return null;
      }
    }

    function generateComprehensiveReleaseNotes(prMessages) {
      const categorizedChanges = { features: [], bugfixes: [], improvements: [], docs: [], other: [] };
      prMessages.forEach(pr => {
        const { title, body, author, prNumber, mergedAt } = pr;
        let category = 'other';
        const lowerTitle = title.toLowerCase();
        if (lowerTitle.includes('feat') || lowerTitle.includes('feature') || lowerTitle.includes('add')) category = 'features';
        else if (lowerTitle.includes('fix') || lowerTitle.includes('bug') || lowerTitle.includes('issue')) category = 'bugfixes';
        else if (lowerTitle.includes('improve') || lowerTitle.includes('enhance') || lowerTitle.includes('update') || lowerTitle.includes('refactor')) category = 'improvements';
        else if (lowerTitle.includes('doc') || lowerTitle.includes('readme')) category = 'docs';

        const mergedDate = mergedAt ? `Merged on: ${new Date(mergedAt).toLocaleDateString()}` : '';
        const completeContent = `${title}\n\n${mergedDate}\n\n${body || ''}`;
        categorizedChanges[category].push({ completeContent, prNumber, author });
      });
      
      let releaseNotes = `# Release Notes for ${tagName}\n\n**Release Date:** ${new Date().toISOString().split('T')[0]}\n\n`;
      for (const [category, changes] of Object.entries(categorizedChanges)) {
        if (changes.length > 0) {
          releaseNotes += `## ${category.charAt(0).toUpperCase() + category.slice(1)}\n\n`;
          changes.forEach(change => {
            releaseNotes += `### PR #${change.prNumber} by @${change.author}\n\n${change.completeContent}\n\n---\n\n`;
          });
        }
      }
      return releaseNotes;
    }

    try {
      const fromTag = await getPreviousTag();
      console.log(`Generating release notes from ${fromTag || 'last 30 days'} to ${tagName}`);
      const mergedPRs = await getMergedPRs(fromTag, tagName);
      console.log(`Found ${mergedPRs.length} merged PRs`);
      const prDetails = [];
      for (const pr of mergedPRs) {
        const details = await getPRDetails(pr.number);
        if (details) prDetails.push(details);
      }
      const releaseNotes = generateComprehensiveReleaseNotes(prDetails);
      fs.writeFileSync('release-notes.md', releaseNotes);
      console.log('Release notes generated successfully');
    } catch (error) {
      console.error('Error generating release notes:', error);
      process.exit(1);
    }
  }

  await init();
})().catch(err => {
  console.error('Initialization error:', err);
  process.exit(1);
});