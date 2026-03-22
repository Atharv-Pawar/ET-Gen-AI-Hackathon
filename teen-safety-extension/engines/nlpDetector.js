/**
 * =====================================================
 * NLP-BASED PATTERN DETECTOR
 * =====================================================
 * 
 * Architecture Component: Pattern Detection (NLP Based)
 * 
 * Advanced URL analysis using NLP techniques:
 * - URL tokenization
 * - N-gram analysis
 * - TLD (Top Level Domain) risk scoring
 * - Path segment analysis
 * - Query parameter detection
 * =====================================================
 */

class NLPDetector {
  constructor() {
    this.riskScoreThreshold = 0.6;
    this.suspiciousTLDs = [
      '.xxx', '.adult', '.sex', '.porn', '.casino',
      '.bet', '.poker', '.game', '.live', '.cam',
      '.onion', '.i2p', '.to', '.cc', '.ws'
    ];

    this.highRiskTokens = {
      adult: {
        tokens: ['porn', 'xxx', 'sex', 'nude', 'naked', 'erotic',
                 'hentai', 'nsfw', 'adult', 'escort', 'hookup',
                 'webcam', 'camgirl', 'livecam', 'fetish', 'bdsm'],
        weight: 1.0
      },
      gambling: {
        tokens: ['casino', 'gamble', 'gambling', 'slot', 'slots',
                 'roulette', 'blackjack', 'poker', 'baccarat',
                 'jackpot', 'lottery', 'sportsbetting'],
        weight: 0.9
      },
      betting: {
        tokens: ['bet', 'betting', 'odds', 'wager', 'fantasy',
                 'dream11', 'rummy', 'teenpatti', 'matka', 'satta',
                 'cricket-bet', 'ipl-bet'],
        weight: 0.85
      },
      darkweb: {
        tokens: ['darkweb', 'darknet', 'deepweb', 'tor', 'onion',
                 'hidden-wiki', 'silk-road', 'anonymous'],
        weight: 1.0
      }
    };
  }

  /**
   * Analyze a URL using NLP techniques
   * @param {string} url - URL to analyze
   * @returns {object} Analysis result with risk score
   */
  analyze(url) {
    const urlLower = url.toLowerCase();

    // Tokenize URL
    const tokens = this.tokenizeUrl(urlLower);

    // Calculate risk scores
    const scores = {};
    let maxCategory = null;
    let maxScore = 0;

    for (const [category, config] of Object.entries(this.highRiskTokens)) {
      const score = this.calculateCategoryScore(tokens, config);
      scores[category] = score;

      if (score > maxScore) {
        maxScore = score;
        maxCategory = category;
      }
    }

    // Check TLD risk
    const tldRisk = this.checkTLDRisk(urlLower);
    if (tldRisk > 0) {
      maxScore += tldRisk;
    }

    // Check path segments
    const pathRisk = this.analyzePathSegments(urlLower);
    maxScore += pathRisk;

    // Normalize score
    const finalScore = Math.min(1.0, maxScore);

    return {
      isRisky: finalScore >= this.riskScoreThreshold,
      riskScore: finalScore,
      category: maxCategory,
      scores: scores,
      tokens: tokens,
      tldRisk: tldRisk,
      pathRisk: pathRisk
    };
  }

  /**
   * Tokenize URL into meaningful parts
   */
  tokenizeUrl(url) {
    // Remove protocol
    let cleaned = url.replace(/^https?:\/\//, '');

    // Split by common delimiters
    const tokens = cleaned.split(/[\/\.\-_?&=+#%@!~,;:]+/)
      .filter(t => t.length > 1);

    // Generate bigrams
    const bigrams = [];
    for (let i = 0; i < tokens.length - 1; i++) {
      bigrams.push(tokens[i] + '-' + tokens[i + 1]);
    }

    return [...tokens, ...bigrams];
  }

  /**
   * Calculate risk score for a specific category
   */
  calculateCategoryScore(tokens, categoryConfig) {
    let matchCount = 0;

    for (const token of tokens) {
      for (const riskToken of categoryConfig.tokens) {
        if (token.includes(riskToken) || riskToken.includes(token)) {
          matchCount++;
        }
      }
    }

    // Normalize by weight
    const rawScore = matchCount / Math.max(tokens.length, 1);
    return rawScore * categoryConfig.weight;
  }

  /**
   * Check if TLD is suspicious
   */
  checkTLDRisk(url) {
    for (const tld of this.suspiciousTLDs) {
      if (url.includes(tld)) {
        return 0.3; // Add 30% risk for suspicious TLD
      }
    }
    return 0;
  }

  /**
   * Analyze URL path segments for risk indicators
   */
  analyzePathSegments(url) {
    const pathMatch = url.match(/\/([^?#]*)/);
    if (!pathMatch) return 0;

    const path = pathMatch[1];
    const riskyPaths = [
      'adult', 'nsfw', 'xxx', 'casino', 'poker',
      'live-cam', 'webcam', 'chat-room', 'betting',
      'fantasy-sports', 'real-money', 'cash-game'
    ];

    let risk = 0;
    for (const riskyPath of riskyPaths) {
      if (path.includes(riskyPath)) {
        risk += 0.2;
      }
    }

    return Math.min(0.4, risk); // Cap at 40%
  }
}

// Export
if (typeof module !== 'undefined') {
  module.exports = NLPDetector;
}