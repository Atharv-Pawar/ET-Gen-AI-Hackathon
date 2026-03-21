// Teen Safety Shield - Background Service Worker

// ============================================
// CONFIGURATION
// ============================================

const CONFIG = {
  ageThreshold: 18,
  verificationValidMinutes: 30,
  enabledByDefault: true
};

// ============================================
// BLOCKLIST CATEGORIES
// ============================================

const BLOCKED_PATTERNS = {
  adult: [
    '*://*.pornhub.com/*',
    '*://*.xvideos.com/*',
    '*://*.xnxx.com/*',
    '*://*.xhamster.com/*',
    '*://*.redtube.com/*',
    '*://*.youporn.com/*',
    '*://*.brazzers.com/*',
    '*://*.onlyfans.com/*',
    '*://*.chaturbate.com/*',
    '*://*.stripchat.com/*'
  ],
  gambling: [
    '*://*.bet365.com/*',
    '*://*.betway.com/*',
    '*://*.pokerstars.com/*',
    '*://*.888casino.com/*',
    '*://*.casumo.com/*',
    '*://*.betfair.com/*',
    '*://*.williamhill.com/*',
    '*://*.ladbrokes.com/*',
    '*://*.unibet.com/*',
    '*://*.paddypower.com/*'
  ],
  betting: [
    '*://*.dream11.com/*',
    '*://*.my11circle.com/*',
    '*://*.mpl.live/*',
    '*://*.winzo.com/*',
    '*://*.jungleerummy.com/*',
    '*://*.rummycircle.com/*',
    '*://*.pokerbaazi.com/*',
    '*://*.adda52.com/*',
    '*://*.paytmfirstgames.com/*',
    '*://*.fantain.com/*'
  ],
  darkweb: [
    '*://*.onion/*',
    '*://*.onion.to/*',
    '*://*.onion.ws/*',
    '*://*.tor2web.org/*'
  ]
};

// Simplified keyword-based detection for unknown sites
const BLOCKED_KEYWORDS = [
  'porn', 'xxx', 'adult', 'sex', 'nude', 'naked',
  'casino', 'gambling', 'betting', 'poker', 'rummy',
  'escort', 'hookup', 'webcam', 'livecam'
];

// ============================================
// STATE MANAGEMENT
// ============================================

let extensionState = {
  enabled: true,
  lastVerification: null,
  verifiedAge: null,
  cameraBlocked: false
};

// Initialize state from storage
chrome.storage.local.get(['extensionState'], (result) => {
  if (result.extensionState) {
    extensionState = { ...extensionState, ...result.extensionState };
  }
});

// ============================================
// URL CHECKING FUNCTIONS
// ============================================

function urlMatchesPattern(url, pattern) {
  // Convert pattern to regex
  const regexPattern = pattern
    .replace(/\./g, '\\.')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '\\?');
  
  const regex = new RegExp(regexPattern, 'i');
  return regex.test(url);
}

function containsBlockedKeyword(url) {
  const urlLower = url.toLowerCase();
  return BLOCKED_KEYWORDS.some(keyword => urlLower.includes(keyword));
}

function isRestrictedSite(url) {
  // Check against all blocked patterns
  for (const category of Object.values(BLOCKED_PATTERNS)) {
    for (const pattern of category) {
      if (urlMatchesPattern(url, pattern)) {
        return { blocked: true, reason: 'pattern_match' };
      }
    }
  }
  
  // Check for blocked keywords in URL
  if (containsBlockedKeyword(url)) {
    return { blocked: true, reason: 'keyword_match' };
  }
  
  return { blocked: false, reason: null };
}

function getBlockedCategory(url) {
  for (const [category, patterns] of Object.entries(BLOCKED_PATTERNS)) {
    for (const pattern of patterns) {
      if (urlMatchesPattern(url, pattern)) {
        return category;
      }
    }
  }
  
  if (containsBlockedKeyword(url)) {
    return 'suspicious';
  }
  
  return 'unknown';
}

// ============================================
// VERIFICATION LOGIC
// ============================================

function isVerificationValid() {
  if (!extensionState.lastVerification || !extensionState.verifiedAge) {
    return false;
  }
  
  // Check if verification is still within valid time window
  const now = Date.now();
  const validUntil = extensionState.lastVerification + (CONFIG.verificationValidMinutes * 60 * 1000);
  
  if (now > validUntil) {
    return false;
  }
  
  // Check if verified age is above threshold
  return extensionState.verifiedAge >= CONFIG.ageThreshold;
}

function shouldBlockAccess() {
  // If extension is disabled, don't block
  if (!extensionState.enabled) {
    return false;
  }
  
  // If camera is blocked, always block restricted sites
  if (extensionState.cameraBlocked) {
    return true;
  }
  
  // Check if we have valid adult verification
  if (isVerificationValid()) {
    return false;
  }
  
  // No valid verification, need to verify
  return true;
}

// ============================================
// NAVIGATION HANDLER
// ============================================

chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
  // Only check main frame navigations
  if (details.frameId !== 0) {
    return;
  }
  
  const url = details.url;
  const tabId = details.tabId;
  
  // Skip extension pages and browser internal pages
  if (url.startsWith('chrome://') || 
      url.startsWith('chrome-extension://') ||
      url.startsWith('about:') ||
      url.startsWith('edge://')) {
    return;
  }
  
  // Check if this is a restricted site
  const restrictionCheck = isRestrictedSite(url);
  
  if (restrictionCheck.blocked) {
    console.log(`[Teen Safety] Restricted site detected: ${url}`);
    
    // Check if we should block access
    if (shouldBlockAccess()) {
      console.log('[Teen Safety] Blocking access - verification required');
      
      // Store the original URL for potential redirect after verification
      chrome.storage.session.set({ 
        pendingUrl: url,
        pendingTabId: tabId,
        blockCategory: getBlockedCategory(url)
      });
      
      // Redirect to verification page
      const verifyUrl = chrome.runtime.getURL('verification/verify.html');
      chrome.tabs.update(tabId, { url: verifyUrl });
    } else {
      console.log('[Teen Safety] Access allowed - valid verification exists');
    }
  }
});

// ============================================
// MESSAGE HANDLERS
// ============================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Teen Safety] Message received:', message);
  
  switch (message.type) {
    case 'VERIFICATION_COMPLETE':
      handleVerificationComplete(message.data, sendResponse);
      break;
      
    case 'CAMERA_BLOCKED':
      handleCameraBlocked(sendResponse);
      break;
      
    case 'GET_STATE':
      sendResponse({ state: extensionState });
      break;
      
    case 'TOGGLE_EXTENSION':
      extensionState.enabled = message.enabled;
      saveState();
      sendResponse({ success: true });
      break;
      
    case 'RESET_VERIFICATION':
      extensionState.lastVerification = null;
      extensionState.verifiedAge = null;
      saveState();
      sendResponse({ success: true });
      break;
      
    default:
      sendResponse({ error: 'Unknown message type' });
  }
  
  return true; // Keep channel open for async response
});

function handleVerificationComplete(data, sendResponse) {
  const { age, confidence } = data;
  
  console.log(`[Teen Safety] Verification complete: Age=${age}, Confidence=${confidence}`);
  
  extensionState.lastVerification = Date.now();
  extensionState.verifiedAge = age;
  extensionState.cameraBlocked = false;
  
  saveState();
  
  if (age >= CONFIG.ageThreshold) {
    // Adult verified - allow access to pending URL
    chrome.storage.session.get(['pendingUrl', 'pendingTabId'], (result) => {
      if (result.pendingUrl && result.pendingTabId) {
        chrome.tabs.update(result.pendingTabId, { url: result.pendingUrl });
        chrome.storage.session.remove(['pendingUrl', 'pendingTabId', 'blockCategory']);
      }
    });
    sendResponse({ allowed: true, age: age });
  } else {
    // Minor detected - show block page
    chrome.storage.session.get(['pendingTabId', 'blockCategory'], (result) => {
      const blockUrl = chrome.runtime.getURL('blocked/blocked.html') + 
                       `?category=${result.blockCategory || 'restricted'}`;
      chrome.tabs.update(result.pendingTabId, { url: blockUrl });
    });
    sendResponse({ allowed: false, age: age });
  }
}

function handleCameraBlocked(sendResponse) {
  console.log('[Teen Safety] Camera blocked detected');
  
  extensionState.cameraBlocked = true;
  extensionState.lastVerification = null;
  extensionState.verifiedAge = null;
  
  saveState();
  
  // Show block page
  chrome.storage.session.get(['pendingTabId'], (result) => {
    const blockUrl = chrome.runtime.getURL('blocked/blocked.html') + '?reason=camera_blocked';
    if (result.pendingTabId) {
      chrome.tabs.update(result.pendingTabId, { url: blockUrl });
    }
  });
  
  sendResponse({ blocked: true });
}

function saveState() {
  chrome.storage.local.set({ extensionState: extensionState });
}

// ============================================
// INSTALLATION HANDLER
// ============================================

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('[Teen Safety] Extension installed');
    
    // Set default state
    extensionState = {
      enabled: true,
      lastVerification: null,
      verifiedAge: null,
      cameraBlocked: false
    };
    
    saveState();
    
    // Open welcome page
    chrome.tabs.create({
      url: chrome.runtime.getURL('popup/popup.html')
    });
  }
});

console.log('[Teen Safety] Background service worker loaded');