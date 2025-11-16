// ================================
// JOB TITLE MATCHING UTILITIES
// ================================

/**
 * Extract job title from SERP result
 */
export function extractJobTitleFromSerp(serpResult) {
  const title = serpResult.title || "";
  
  // SERP titles are usually: "Job Title - Company | Platform" or "Job Title at Company"
  // Remove common suffixes
  let cleanTitle = title
    .replace(/\s*\|\s*.*$/, '')           // Remove "| Greenhouse Job Board" etc
    .replace(/\s*-\s*Greenhouse.*$/i, '')
    .replace(/\s*-\s*Ashby.*$/i, '')
    .replace(/\s*-\s*Workable.*$/i, '')
    .replace(/\s*-\s*Lever.*$/i, '')
    .replace(/\s+at\s+[^-]+$/i, '');      // Remove "at CompanyName" suffix
  
  // Try to extract before the last " - Company"
  const parts = cleanTitle.split('-').map(p => p.trim());
  const extractedTitle = parts.length > 1 ? parts[0] : cleanTitle;
  
  return extractedTitle.trim();
}

/**
 * Fuzzy match two job titles
 * Returns score 0-100 and match type
 */
export function fuzzyMatchTitle(serpTitle, jobTitle) {
  const normalize = (str) => str.toLowerCase()
    .replace(/[^\w\s]/g, '') // Remove punctuation
    .replace(/\s+/g, ' ')     // Normalize whitespace
    .trim();
  
  const serpNorm = normalize(serpTitle);
  const jobNorm = normalize(jobTitle);
  
  // Exact match
  if (serpNorm === jobNorm) {
    return { score: 100, type: 'exact' };
  }
  
  // Contains match
  if (jobNorm.includes(serpNorm) || serpNorm.includes(jobNorm)) {
    return { score: 85, type: 'contains' };
  }
  
  // Calculate similarity score (simple word overlap)
  const serpWords = new Set(serpNorm.split(' ').filter(w => w.length > 2));
  const jobWords = new Set(jobNorm.split(' ').filter(w => w.length > 2));
  const intersection = new Set([...serpWords].filter(x => jobWords.has(x)));
  const union = new Set([...serpWords, ...jobWords]);
  
  if (union.size === 0) {
    return { score: 0, type: 'no-match' };
  }
  
  const similarity = (intersection.size / union.size) * 100;
  
  if (similarity > 50) {
    return { score: similarity, type: 'partial' };
  }
  
  return { score: 0, type: 'no-match' };
}

/**
 * Find best matching job for a SERP title/snippet in a list of jobs
 * Tries multiple strategies in order of priority:
 * 1. Match by title (priority)
 * 2. Match by description if title match is weak
 * Returns null if no good match found
 */
export function findMatchingJob(serpTitle, jobs, serpSnippet = '') {
  let bestTitleMatch = null;
  let bestTitleScore = 0;
  let bestDescMatch = null;
  let bestDescScore = 0;
  
  // Strategy 1: Try title matching (PRIORITY)
  for (const job of jobs) {
    const match = fuzzyMatchTitle(serpTitle, job.title);
    if (match.score > bestTitleScore) {
      bestTitleScore = match.score;
      bestTitleMatch = job;
    }
  }
  
  // If we got a strong title match (70%+), return it immediately
  if (bestTitleScore >= 70) {
    return { 
      job: bestTitleMatch, 
      score: bestTitleScore,
      matchType: 'title'
    };
  }
  
  // Strategy 2: Try description matching as fallback
  if (serpSnippet && serpSnippet.length > 20) {
    for (const job of jobs) {
      if (job.description) {
        const descMatch = fuzzyMatchTitle(serpSnippet, job.description);
        if (descMatch.score > bestDescScore) {
          bestDescScore = descMatch.score;
          bestDescMatch = job;
        }
      }
    }
    
    // If description match is strong (60%+ for descriptions since they're longer)
    if (bestDescScore >= 60) {
      return { 
        job: bestDescMatch, 
        score: bestDescScore,
        matchType: 'description'
      };
    }
  }
  
  // Strategy 3: Return weak title match if it's at least 60%
  if (bestTitleScore >= 60) {
    return { 
      job: bestTitleMatch, 
      score: bestTitleScore,
      matchType: 'title-weak'
    };
  }
  
  // No good match found
  return null;
}

/**
 * Enhanced matching that tries multiple SERP results for the same org
 * Useful when SERP returns multiple snippets about the same job
 */
export function findMatchingJobMultiple(serpResults, jobs) {
  const matches = [];
  
  for (const serpResult of serpResults) {
    const match = findMatchingJob(serpResult.title, jobs, serpResult.snippet);
    if (match) {
      matches.push({
        ...match,
        serpTitle: serpResult.title,
        serpSnippet: serpResult.snippet
      });
    }
  }
  
  // Deduplicate - if multiple SERP results matched the same job, keep the best one
  const uniqueMatches = new Map();
  for (const match of matches) {
    const jobId = match.job.id;
    if (!uniqueMatches.has(jobId) || uniqueMatches.get(jobId).score < match.score) {
      uniqueMatches.set(jobId, match);
    }
  }
  
  return Array.from(uniqueMatches.values());
}

