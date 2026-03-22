/**
 * =====================================================
 * TEEN SAFETY SHIELD - Background Service Worker
 * =====================================================
 * 
 * Architecture Component: URL Monitor Tab API
 * 
 * Flow:
 * 1. Monitor all URL navigations via Tabs API
 * 2. Send URL to Content Classification Engine
 * 3. If restricted → Redirect to AI Verification Engine
 * 4. Handle verification results → Allow or Block
 * 
 * =====================================================
 */

// ============================================
// CONFIGURATION
// ============================================

const CONFIG = {
  ageThreshold: 18,
  verificationValidMinutes: 30,
  enabledByDefault: true,
  debug: true
};

// ============================================
// BLOCKLIST DATA (Loaded from blocklist.json)
// ============================================

let BLOCKLIST = null;

async function loadBlocklist() {
  try {
    const response = await fetch(chrome.runtime.getURL('data/blocklist.json'));
    BLOCKLIST = await response.json();
    log(`Blocklist loaded: ${BLOCKLIST.statistics.totalDomainsBlocked} domains across ${Object.keys(BLOCKLIST.categories).length} categories`);
  } catch (error) {
    console.error('[Teen Safety] Failed to load blocklist:', error);
    // Fallback minimal blocklist
    BLOCKLIST = getFallbackBlocklist();
  }
}

function getFallbackBlocklist() {
  return {
    categories: {
      adult: {
        enabled: true,
        domains: ['pornhub.com', 'xvideos.com', 'xnxx.com', 'xhamster.com'],
        urlPatterns: ['*://*.pornhub.com/*', '*://*.xvideos.com/*']
      },
      gambling: {
        enabled: true,
        domains: ['bet365.com', 'pokerstars.com'],
        urlPatterns: ['*://*.bet365.com/*']
      },
      betting: {
        enabled: true,
        domains: ['dream11.com', 'my11circle.com', 'jungleerummy.com'],
        urlPatterns: ['*://*.dream11.com/*', '*://*.my11circle.com/*']
      }
    },
    keywords: {
      adult: ['porn', 'xxx', 'nude', 'naked'],
      gambling: ['casino', 'gambling', 'poker'],
      betting: ['rummy', 'teenpatti', 'fantasy-cricket']
    },
    whitelist: {
      domains: ['google.com', 'youtube.com', 'wikipedia.org', 'github.com']
    },
    settings: {
      enableKeywordDetection: true,
      enablePatternMatching: true,
      enableWhitelist: true
    },
    statistics: { totalDomainsBlocked: 10 }
  };
}

// ============================================
// STATE MANAGEMENT
// ============================================

let extensionState = {
  enabled: true,
  lastVerification: null,
  verifiedAge: null,
  verifiedDecision: null,
  cameraBlocked: false,
  blockedCount: 0,
  sessionLog: []
};

// Initialize state
async function initState() {
  const result = await chrome.storage.local.get(['extensionState']);
  if (result.extensionState) {
    extensionState = { ...extensionState, ...result.extensionState };
  }
  log('State initialized:', extensionState);
}

function saveState() {
  chrome.storage.local.set({ extensionState: extensionState });
}

// ============================================
// CONTENT CLASSIFICATION ENGINE
// ============================================
// Architecture: Matching (blocklist) + Pattern Detection (NLP) + Keywords

/**
 * Main classification function
 * Checks URL against: 1) Whitelist  2) Blocklist domains  3) URL patterns  4) Keywords
 * 
 * @param {string} url - The URL to classify
 * @returns {object} Classification result
 */
function classifyContent(url) {
  if (!BLOCKLIST) {
    log('Blocklist not loaded yet');
    return { restricted: false, reason: null };
  }

  const urlLower = url.toLowerCase();

  // ── Step 1: Whitelist Check ──
  if (BLOCKLIST.settings.enableWhitelist) {
    const isWhitelisted = BLOCKLIST.whitelist.domains.some(domain =>
      urlLower.includes(domain)
    );
    if (isWhitelisted) {
      return {
        restricted: false,
        reason: 'whitelisted',
        category: null
      };
    }
  }

  // ── Step 2: Matching (Blocklist Domain Check) ──
  for (const [categoryName, category] of Object.entries(BLOCKLIST.categories)) {
    if (!category.enabled) continue;

    for (const domain of category.domains) {
      if (urlLower.includes(domain)) {
        log(`BLOCKED [Domain Match]: ${url} → Category: ${categoryName}`);
        return {
          restricted: true,
          reason: 'domain_match',
          category: categoryName,
          categoryLabel: category.label || categoryName,
          categoryIcon: category.icon || '⚠️',
          matchedRule: domain
        };
      }
    }
  }

  // ── Step 3: Pattern Detection (URL Pattern Matching) ──
  if (BLOCKLIST.settings.enablePatternMatching) {
    for (const [categoryName, category] of Object.entries(BLOCKLIST.categories)) {
      if (!category.enabled || !category.urlPatterns) continue;

      for (const pattern of category.urlPatterns) {
        if (urlMatchesPattern(url, pattern)) {
          log(`BLOCKED [Pattern Match]: ${url} → Pattern: ${pattern}`);
          return {
            restricted: true,
            reason: 'pattern_match',
            category: categoryName,
            categoryLabel: category.label || categoryName,
            categoryIcon: category.icon || '⚠️',
            matchedRule: pattern
          };
        }
      }
    }
  }

  // ── Step 4: Keyword Detection ──
  if (BLOCKLIST.settings.enableKeywordDetection && BLOCKLIST.keywords) {
    for (const [categoryName, keywords] of Object.entries(BLOCKLIST.keywords)) {
      for (const keyword of keywords) {
        if (urlLower.includes(keyword)) {
          log(`BLOCKED [Keyword Match]: ${url} → Keyword: "${keyword}"`);
          return {
            restricted: true,
            reason: 'keyword_match',
            category: categoryName,
            categoryLabel: categoryName,
            categoryIcon: '⚠️',
            matchedRule: keyword
          };
        }
      }
    }
  }

  // ── Not Restricted ──
  return {
    restricted: false,
    reason: 'clean',
    category: null
  };
}

/**
 * URL Pattern Matcher
 * Converts wildcard patterns to regex for matching
 */
function urlMatchesPattern(url, pattern) {
  try {
    const regexPattern = pattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\\\*/g, '.*');
    const regex = new RegExp(regexPattern, 'i');
    return regex.test(url);
  } catch (e) {
    return false;
  }
}

// ============================================
// VERIFICATION STATE CHECKER
// ============================================

/**
 * Determines if current verification is still valid
 * Used to avoid re-verification within the time window
 */
function isVerificationValid() {
  if (!extensionState.lastVerification || !extensionState.verifiedAge) {
    return false;
  }

  // Check time validity
  const now = Date.now();
  const validUntil = extensionState.lastVerification +
    (CONFIG.verificationValidMinutes * 60 * 1000);

  if (now > validUntil) {
    log('Verification expired');
    return false;
  }

  // Check if decision was ALLOW
  return extensionState.verifiedDecision === 'ADULT_CONFIRMED' ||
         extensionState.verifiedDecision === 'ADULT_PROBABLE';
}

/**
 * Main access decision function
 * Determines whether to block, allow, or require verification
 */
function getAccessDecision() {
  // Extension disabled → allow everything
  if (!extensionState.enabled) {
    return { action: 'ALLOW', reason: 'extension_disabled' };
  }

  // Camera is blocked → block all restricted sites
  if (extensionState.cameraBlocked) {
    return { action: 'BLOCK', reason: 'camera_blocked' };
  }

  // Valid adult verification exists → allow
  if (isVerificationValid()) {
    return { action: 'ALLOW', reason: 'verified_adult' };
  }

  // No valid verification → need verification
  return { action: 'VERIFY', reason: 'verification_needed' };
}

// ============================================
// URL MONITOR (Tab API - webNavigation)
// ============================================

/**
 * Architecture Component: URL Monitor Tab API
 * Intercepts every navigation and sends to Content Classification Engine
 */
chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
  // Only check main frame (not iframes, subframes)
  if (details.frameId !== 0) return;

  const url = details.url;
  const tabId = details.tabId;

  // Skip internal browser pages
  if (isInternalUrl(url)) return;

  log(`Navigation detected: ${url}`);

  // ── Send to Content Classification Engine ──
  const classification = classifyContent(url);

  if (classification.restricted) {
    log(`Restricted site detected: ${url} [${classification.category}]`);

    // ── Check if verification needed ──
    const accessDecision = getAccessDecision();

    switch (accessDecision.action) {
      case 'ALLOW':
        log(`Access ALLOWED (${accessDecision.reason})`);
        // Do nothing - let navigation proceed
        break;

      case 'BLOCK':
        log(`Access BLOCKED (${accessDecision.reason})`);
        // Redirect to block page
        redirectToBlockPage(tabId, classification, accessDecision.reason);
        break;

      case 'VERIFY':
        log(`Verification REQUIRED for: ${url}`);
        // Store pending URL and redirect to verification
        await storePendingNavigation(tabId, url, classification);
        redirectToVerification(tabId);
        break;
    }

    // Log the blocked attempt
    logBlockedAttempt(url, classification, accessDecision);
  } else {
    // Not restricted → Allow access (NO path in architecture)
    log(`Site allowed: ${url} (${classification.reason})`);
  }
});

/**
 * Check if URL is internal browser page
 */
function isInternalUrl(url) {
  return url.startsWith('chrome://') ||
    url.startsWith('chrome-extension://') ||
    url.startsWith('about:') ||
    url.startsWith('edge://') ||
    url.startsWith('moz-extension://') ||
    url.startsWith('opera://');
}

/**
 * Store pending navigation for post-verification redirect
 */
async function storePendingNavigation(tabId, url, classification) {
  await chrome.storage.session.set({
    pendingUrl: url,
    pendingTabId: tabId,
    pendingClassification: {
      category: classification.category,
      categoryLabel: classification.categoryLabel,
      categoryIcon: classification.categoryIcon,
      reason: classification.reason
    }
  });
}

/**
 * Redirect to AI Verification Engine
 */
function redirectToVerification(tabId) {
  const verifyUrl = chrome.runtime.getURL('verification/verify.html');
  chrome.tabs.update(tabId, { url: verifyUrl });
}

/**
 * Redirect to Block Page
 */
function redirectToBlockPage(tabId, classification, blockReason) {
  const params = new URLSearchParams({
    category: classification.category || 'restricted',
    categoryLabel: classification.categoryLabel || 'Restricted Content',
    categoryIcon: classification.categoryIcon || '⚠️',
    reason: blockReason || 'age_restricted'
  });

  const blockUrl = chrome.runtime.getURL('blocked/blocked.html') + '?' + params.toString();
  chrome.tabs.update(tabId, { url: blockUrl });

  // Increment blocked count
  extensionState.blockedCount++;
  saveState();
}

/**
 * Log blocked attempt for statistics
 */
function logBlockedAttempt(url, classification, decision) {
  const logEntry = {
    timestamp: Date.now(),
    url: url,
    category: classification.category,
    reason: classification.reason,
    decision: decision.action,
    decisionReason: decision.reason
  };

  extensionState.sessionLog.push(logEntry);

  // Keep only last 100 entries
  if (extensionState.sessionLog.length > 100) {
    extensionState.sessionLog = extensionState.sessionLog.slice(-100);
  }

  saveState();
}

// ============================================
// MESSAGE HANDLER
// ============================================
// Handles messages from verification page, popup, and content scripts

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  log('Message received:', message.type);

  switch (message.type) {

    // ── AI Verification Engine Results ──
    case 'VERIFICATION_RESULT':
      handleVerificationResult(message.data, sendResponse);
      break;

    // ── Camera Blocked Detection ──
    case 'CAMERA_BLOCKED':
      handleCameraBlocked(sendResponse);
      break;

    // ── Popup: Get current state ──
    case 'GET_STATE':
      sendResponse({
        state: extensionState,
        config: CONFIG
      });
      break;

    // ── Popup: Toggle extension ──
    case 'TOGGLE_EXTENSION':
      extensionState.enabled = message.enabled;
      saveState();
      log(`Extension ${message.enabled ? 'ENABLED' : 'DISABLED'}`);
      sendResponse({ success: true });
      break;

    // ── Popup: Reset verification ──
    case 'RESET_VERIFICATION':
      extensionState.lastVerification = null;
      extensionState.verifiedAge = null;
      extensionState.verifiedDecision = null;
      extensionState.cameraBlocked = false;
      saveState();
      log('Verification reset');
      sendResponse({ success: true });
      break;

    // ── Popup: Get statistics ──
    case 'GET_STATS':
      sendResponse({
        blockedCount: extensionState.blockedCount,
        sessionLog: extensionState.sessionLog,
        lastVerification: extensionState.lastVerification,
        verifiedAge: extensionState.verifiedAge
      });
      break;

    default:
      sendResponse({ error: 'Unknown message type' });
  }

  return true; // Keep channel open for async
});

/**
 * Handle verification result from AI Verification Engine
 * 
 * Architecture: Decision Engine results come here
 * - ADULT_CONFIRMED → Allow accessing site data
 * - ADULT_PROBABLE → Allow with note
 * - MINOR_CONFIRMED → Block all restricted sites
 * - MINOR_ASSUMED → Block all restricted sites
 */
function handleVerificationResult(data, sendResponse) {
  const { age, confidence, decision, details } = data;

  log(`Verification result: Age=${age}, Confidence=${confidence}, Decision=${decision}`);

  // Update state
  extensionState.lastVerification = Date.now();
  extensionState.verifiedAge = age;
  extensionState.verifiedDecision = decision;
  extensionState.cameraBlocked = false;
  saveState();

  if (decision === 'ADULT_CONFIRMED' || decision === 'ADULT_PROBABLE') {
    // ── Architecture: "Allow accessing Site Data" path ──
    log('Adult verified → Allowing access to pending URL');

    chrome.storage.session.get(['pendingUrl', 'pendingTabId'], (result) => {
      if (result.pendingUrl && result.pendingTabId) {
        chrome.tabs.update(result.pendingTabId, { url: result.pendingUrl });
        chrome.storage.session.remove(['pendingUrl', 'pendingTabId', 'pendingClassification']);
      }
    });

    sendResponse({
      allowed: true,
      age: age,
      decision: decision,
      message: 'Age verified. Redirecting to requested site...'
    });

  } else {
    // ── Architecture: "BLOCK ALL RESTRICTED SITES" path ──
    log('Minor detected → Blocking access');

    extensionState.blockedCount++;
    saveState();

    chrome.storage.session.get(['pendingTabId', 'pendingClassification'], (result) => {
      const params = new URLSearchParams({
        category: result.pendingClassification?.category || 'restricted',
        categoryLabel: result.pendingClassification?.categoryLabel || 'Restricted Content',
        reason: 'age_restricted',
        estimatedAge: age.toString()
      });

      const blockUrl = chrome.runtime.getURL('blocked/blocked.html') + '?' + params.toString();

      if (result.pendingTabId) {
        chrome.tabs.update(result.pendingTabId, { url: blockUrl });
      }
    });

    sendResponse({
      allowed: false,
      age: age,
      decision: decision,
      message: 'Access denied. Age requirement not met.'
    });
  }
}

/**
 * Handle camera blocked
 * Architecture: Camera Access = NO → BLOCK ALL RESTRICTED SITES
 */
function handleCameraBlocked(sendResponse) {
  log('Camera access BLOCKED → Blocking all restricted sites');

  extensionState.cameraBlocked = true;
  extensionState.lastVerification = null;
  extensionState.verifiedAge = null;
  extensionState.verifiedDecision = null;
  saveState();

  // Redirect to block page with camera reason
  chrome.storage.session.get(['pendingTabId'], (result) => {
    const params = new URLSearchParams({
      category: 'camera_blocked',
      categoryLabel: 'Camera Access Required',
      reason: 'camera_blocked'
    });

    const blockUrl = chrome.runtime.getURL('blocked/blocked.html') + '?' + params.toString();

    if (result.pendingTabId) {
      chrome.tabs.update(result.pendingTabId, { url: blockUrl });
    }
  });

  sendResponse({ blocked: true, reason: 'camera_blocked' });
}

// ============================================
// LOGGER
// ============================================

function log(...args) {
  if (CONFIG.debug) {
    console.log('[Teen Safety]', ...args);
  }
}

// ============================================
// INSTALLATION & STARTUP
// ============================================

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    log('Extension installed for the first time');
    extensionState = {
      enabled: true,
      lastVerification: null,
      verifiedAge: null,
      verifiedDecision: null,
      cameraBlocked: false,
      blockedCount: 0,
      sessionLog: []
    };
    saveState();
  }
});

// Load blocklist and initialize state on startup
loadBlocklist();
initState();

log('Background service worker started');