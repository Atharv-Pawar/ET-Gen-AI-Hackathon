// Load blocklist from JSON file
let BLOCKLIST = null;

async function loadBlocklist() {
  try {
    const response = await fetch(chrome.runtime.getURL('data/blocklist.json'));
    BLOCKLIST = await response.json();
    console.log('[Teen Safety] Blocklist loaded:', 
      BLOCKLIST.statistics.totalDomainsBlocked, 'domains');
  } catch (error) {
    console.error('[Teen Safety] Failed to load blocklist:', error);
  }
}

// Updated URL checking function
function isRestrictedSite(url) {
  if (!BLOCKLIST) return { blocked: false, reason: null };

  const urlLower = url.toLowerCase();

  // Check whitelist first
  if (BLOCKLIST.settings.enableWhitelist) {
    const isWhitelisted = BLOCKLIST.whitelist.domains.some(domain => 
      urlLower.includes(domain)
    );
    if (isWhitelisted) return { blocked: false, reason: 'whitelisted' };
  }

  // Check URL patterns
  if (BLOCKLIST.settings.enablePatternMatching) {
    for (const [categoryName, category] of Object.entries(BLOCKLIST.categories)) {
      if (!category.enabled) continue;
      
      for (const pattern of category.urlPatterns) {
        if (urlMatchesPattern(url, pattern)) {
          return { 
            blocked: true, 
            reason: 'pattern_match',
            category: categoryName,
            categoryLabel: category.label,
            categoryIcon: category.icon
          };
        }
      }

      // Check domain list
      for (const domain of category.domains) {
        if (urlLower.includes(domain)) {
          return {
            blocked: true,
            reason: 'domain_match',
            category: categoryName,
            categoryLabel: category.label,
            categoryIcon: category.icon
          };
        }
      }
    }
  }

  // Check keywords
  if (BLOCKLIST.settings.enableKeywordDetection) {
    for (const [categoryName, keywords] of Object.entries(BLOCKLIST.keywords)) {
      const matched = keywords.some(keyword => urlLower.includes(keyword));
      if (matched) {
        return {
          blocked: true,
          reason: 'keyword_match',
          category: categoryName
        };
      }
    }
  }

  return { blocked: false, reason: null };
}

// Call loadBlocklist when service worker starts
loadBlocklist();