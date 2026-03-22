/**
 * =====================================================
 * CONTENT CLASSIFICATION ENGINE
 * =====================================================
 * 
 * Architecture Component: Content Classification Engine
 * Sub-components:
 *   1. Matching (blocklist)
 *   2. Pattern Detection (NLP Based)
 *   3. Keywords
 * 
 * This module is used by background.js but also exported
 * for potential use in content scripts or popup
 * =====================================================
 */

class ContentClassifier {
  constructor(blocklist) {
    this.blocklist = blocklist;
    this.nlpPatterns = this.buildNLPPatterns();
    this.stats = {
      totalChecks: 0,
      totalBlocked: 0,
      totalAllowed: 0,
      categoryHits: {}
    };
  }

  /**
   * Main classification method
   * Runs all three sub-engines in sequence
   */
  classify(url) {
    this.stats.totalChecks++;
    const urlLower = url.toLowerCase();

    // ── Sub-engine 1: Whitelist (fast exit) ──
    if (this.isWhitelisted(urlLower)) {
      this.stats.totalAllowed++;
      return this.createResult(false, 'whitelisted', null);
    }

    // ── Sub-engine 2: Matching (Blocklist) ──
    const blocklistResult = this.checkBlocklist(urlLower);
    if (blocklistResult.restricted) {
      this.stats.totalBlocked++;
      this.incrementCategoryHit(blocklistResult.category);
      return blocklistResult;
    }

    // ── Sub-engine 3: Pattern Detection (NLP Based) ──
    const nlpResult = this.checkNLPPatterns(urlLower);
    if (nlpResult.restricted) {
      this.stats.totalBlocked++;
      this.incrementCategoryHit(nlpResult.category);
      return nlpResult;
    }

    // ── Sub-engine 4: Keyword Detection ──
    const keywordResult = this.checkKeywords(urlLower);
    if (keywordResult.restricted) {
      this.stats.totalBlocked++;
      this.incrementCategoryHit(keywordResult.category);
      return keywordResult;
    }

    // ── Not restricted ──
    this.stats.totalAllowed++;
    return this.createResult(false, 'clean', null);
  }

  /**
   * Sub-engine 1: Whitelist Check
   */
  isWhitelisted(urlLower) {
    if (!this.blocklist.whitelist || !this.blocklist.settings.enableWhitelist) {
      return false;
    }
    return this.blocklist.whitelist.domains.some(domain =>
      urlLower.includes(domain)
    );
  }

  /**
   * Sub-engine 2: Matching (Blocklist Domain Check)
   */
  checkBlocklist(urlLower) {
    for (const [categoryName, category] of Object.entries(this.blocklist.categories)) {
      if (!category.enabled) continue;

      // Check exact domain matches
      for (const domain of category.domains) {
        if (urlLower.includes(domain.toLowerCase())) {
          return this.createResult(true, 'blocklist_match', categoryName, {
            label: category.label,
            icon: category.icon,
            matchedDomain: domain
          });
        }
      }

      // Check URL patterns
      if (category.urlPatterns) {
        for (const pattern of category.urlPatterns) {
          if (this.matchPattern(urlLower, pattern)) {
            return this.createResult(true, 'pattern_match', categoryName, {
              label: category.label,
              icon: category.icon,
              matchedPattern: pattern
            });
          }
        }
      }
    }

    return this.createResult(false, null, null);
  }

  /**
   * Sub-engine 3: Pattern Detection (NLP Based)
   * Uses regex patterns to detect harmful URL structures
   */
  checkNLPPatterns(urlLower) {
    for (const pattern of this.nlpPatterns) {
      if (pattern.regex.test(urlLower)) {
        return this.createResult(true, 'nlp_pattern', pattern.category, {
          label: pattern.label,
          icon: pattern.icon,
          matchedPattern: pattern.name
        });
      }
    }
    return this.createResult(false, null, null);
  }

  /**
   * Sub-engine 4: Keyword Detection
   */
  checkKeywords(urlLower) {
    if (!this.blocklist.keywords || !this.blocklist.settings.enableKeywordDetection) {
      return this.createResult(false, null, null);
    }

    for (const [categoryName, keywords] of Object.entries(this.blocklist.keywords)) {
      for (const keyword of keywords) {
        if (urlLower.includes(keyword.toLowerCase())) {
          return this.createResult(true, 'keyword_match', categoryName, {
            matchedKeyword: keyword
          });
        }
      }
    }

    return this.createResult(false, null, null);
  }

  /**
   * Build NLP-based detection patterns
   * These catch URLs that aren't in the blocklist but follow harmful patterns
   */
  buildNLPPatterns() {
    return [
      {
        name: 'adult_url_structure',
        category: 'adult',
        label: 'Adult Content',
        icon: '🔞',
        regex: /\b(xxx|porn|adult|nude|naked|erotic|nsfw)\b/i
      },
      {
        name: 'adult_domain_pattern',
        category: 'adult',
        label: 'Adult Content',
        icon: '🔞',
        regex: /(sex|xxx|porn|adult)(tube|hub|video|cam|chat|live|stream)/i
      },
      {
        name: 'gambling_structure',
        category: 'gambling',
        label: 'Gambling',
        icon: '🎰',
        regex: /\b(casino|gambl|slots|roulette|blackjack|baccarat)\b/i
      },
      {
        name: 'betting_structure',
        category: 'betting',
        label: 'Betting',
        icon: '🏏',
        regex: /\b(bet|wager|odds|sportsbook|fantasy.?sport|daily.?fantasy)\b/i
      },
      {
        name: 'betting_indian',
        category: 'betting',
        label: 'Betting (India)',
        icon: '🏏',
        regex: /\b(rummy|teenpatti|teen.?patti|matka|satta|cricket.?bet)\b/i
      },
      {
        name: 'darkweb_access',
        category: 'darkweb',
        label: 'Dark Web',
        icon: '👤',
        regex: /\.(onion|i2p)(\.|\/)|\b(tor2web|darkweb|darknet|deepweb)\b/i
      },
      {
        name: 'proxy_bypass',
        category: 'darkweb',
        label: 'Proxy/Bypass',
        icon: '🔓',
        regex: /\b(proxy|unblock|bypass|mirror)\b.*(porn|adult|casino|bet)/i
      }
    ];
  }

  /**
   * URL pattern matcher (wildcard to regex)
   */
  matchPattern(url, pattern) {
    try {
      const regexStr = pattern
        .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\\\*/g, '.*');
      return new RegExp(regexStr, 'i').test(url);
    } catch {
      return false;
    }
  }

  /**
   * Create standardized result object
   */
  createResult(restricted, reason, category, details = {}) {
    return {
      restricted,
      reason,
      category,
      categoryLabel: details.label || category || 'Unknown',
      categoryIcon: details.icon || '⚠️',
      details,
      timestamp: Date.now()
    };
  }

  /**
   * Track category statistics
   */
  incrementCategoryHit(category) {
    if (!this.stats.categoryHits[category]) {
      this.stats.categoryHits[category] = 0;
    }
    this.stats.categoryHits[category]++;
  }

  /**
   * Get classification statistics
   */
  getStats() {
    return { ...this.stats };
  }
}

// Export for use
if (typeof module !== 'undefined') {
  module.exports = ContentClassifier;
}