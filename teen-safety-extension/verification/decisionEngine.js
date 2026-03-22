/**
 * =====================================================
 * DECISION ENGINE
 * =====================================================
 * 
 * Architecture Component: DECISION ENGINE
 * 
 * Rules:
 *   • Age ≥ 20:       ALLOW (ADULT_CONFIRMED)
 *   • Age ≤ 15:       BLOCK (MINOR_CONFIRMED)
 *   • Age 16-19:
 *       High Conf:    CHECK → Allow (ADULT_PROBABLE)
 *       Low Conf:     BLOCK (MINOR_ASSUMED)
 * 
 * Also checks:
 *   • Liveness verification status
 *   • Camera access status
 * =====================================================
 */

class DecisionEngine {
  constructor(config = {}) {
    // Thresholds
    this.ADULT_AGE = config.adultAge || 20;
    this.MINOR_AGE = config.minorAge || 15;
    this.HIGH_CONFIDENCE = config.highConfidence || 0.65;
    this.BORDERLINE_AGE_MIN = config.borderlineMin || 16;
    this.BORDERLINE_AGE_MAX = config.borderlineMax || 19;
    this.AGE_THRESHOLD = config.ageThreshold || 18;
  }

  /**
   * Make access decision based on age estimation and liveness results
   * 
   * @param {object} ageResult - Result from AgeEstimator
   * @param {object} livenessResult - Result from LivenessDetector
   * @returns {object} Decision result
   */
  decide(ageResult, livenessResult) {
    console.log('[DecisionEngine] Processing decision...');
    console.log('[DecisionEngine] Age:', ageResult.estimatedAge, 'Confidence:', ageResult.confidence);
    console.log('[DecisionEngine] Liveness:', livenessResult.isLive);

    // ── Pre-check: Liveness verification ──
    if (!livenessResult.isLive) {
      return this.createDecision(
        'BLOCK',
        'LIVENESS_FAILED',
        'Liveness verification failed. Please show your real face to the camera.',
        ageResult,
        livenessResult
      );
    }

    const age = ageResult.estimatedAge;
    const confidence = ageResult.confidence;

    // ── Rule 1: Age ≥ 20 → ALLOW (ADULT_CONFIRMED) ──
    if (age >= this.ADULT_AGE) {
      console.log(`[DecisionEngine] Age ${age} ≥ ${this.ADULT_AGE} → ADULT_CONFIRMED`);
      return this.createDecision(
        'ALLOW',
        'ADULT_CONFIRMED',
        `Age verified as ${age}. Access granted.`,
        ageResult,
        livenessResult
      );
    }

    // ── Rule 2: Age ≤ 15 → BLOCK (MINOR_CONFIRMED) ──
    if (age <= this.MINOR_AGE) {
      console.log(`[DecisionEngine] Age ${age} ≤ ${this.MINOR_AGE} → MINOR_CONFIRMED`);
      return this.createDecision(
        'BLOCK',
        'MINOR_CONFIRMED',
        `Estimated age is ${age}. You must be ${this.AGE_THRESHOLD}+ to access this content.`,
        ageResult,
        livenessResult
      );
    }

    // ── Rule 3: Age 16-19 (Borderline Zone) ──
    if (age >= this.BORDERLINE_AGE_MIN && age <= this.BORDERLINE_AGE_MAX) {
      console.log(`[DecisionEngine] Age ${age} in borderline zone (${this.BORDERLINE_AGE_MIN}-${this.BORDERLINE_AGE_MAX})`);

      // ── CHECK: High Confidence + Age ≥ 18 → ALLOW ──
      if (confidence >= this.HIGH_CONFIDENCE && age >= this.AGE_THRESHOLD) {
        console.log(`[DecisionEngine] High confidence (${confidence}) + Age ${age} ≥ ${this.AGE_THRESHOLD} → ADULT_PROBABLE`);
        return this.createDecision(
          'ALLOW',
          'ADULT_PROBABLE',
          `Age estimated as ${age} with ${Math.round(confidence * 100)}% confidence. Access granted with caution.`,
          ageResult,
          livenessResult
        );
      }

      // ── Low Confidence OR Age < 18 → BLOCK ──
      console.log(`[DecisionEngine] Low confidence (${confidence}) or Age ${age} < ${this.AGE_THRESHOLD} → MINOR_ASSUMED`);
      return this.createDecision(
        'BLOCK',
        'MINOR_ASSUMED',
        `Estimated age is ${age} (confidence: ${Math.round(confidence * 100)}%). ` +
        `For safety, access is restricted. You must be ${this.AGE_THRESHOLD}+ to access this content.`,
        ageResult,
        livenessResult
      );
    }

    // ── Fallback: Default to BLOCK (safety-first) ──
    console.log(`[DecisionEngine] Fallback → BLOCK`);
    return this.createDecision(
      'BLOCK',
      'UNCERTAIN',
      `Could not reliably determine age. For safety, access is restricted.`,
      ageResult,
      livenessResult
    );
  }

  /**
   * Create standardized decision object
   */
  createDecision(action, decision, message, ageResult, livenessResult) {
    const result = {
      // Primary decision
      action: action,           // 'ALLOW' or 'BLOCK'
      decision: decision,       // Detailed decision code
      message: message,         // Human-readable message
      timestamp: Date.now(),

      // Age details
      age: ageResult.estimatedAge,
      confidence: ageResult.confidence,
      ageStatistics: ageResult.statistics,
      ageSampling: ageResult.sampling,
      gender: ageResult.gender,

      // Liveness details
      liveness: {
        isLive: livenessResult.isLive,
        confidence: livenessResult.confidence,
        blinks: livenessResult.blinks,
        movement: livenessResult.totalMovement
      },

      // Decision reasoning
      reasoning: this.getReasoningSteps(ageResult, livenessResult, decision)
    };

    console.log('[DecisionEngine] Final Decision:', result);
    return result;
  }

  /**
   * Get step-by-step reasoning for transparency
   */
  getReasoningSteps(ageResult, livenessResult, decision) {
    const steps = [];

    steps.push({
      step: 1,
      check: 'Face Detection',
      result: `${ageResult.sampling.validDetections}/${ageResult.sampling.totalFrames} frames detected`,
      passed: ageResult.sampling.validDetections >= 7
    });

    steps.push({
      step: 2,
      check: 'Liveness Verification',
      result: livenessResult.isLive
        ? `Passed (${livenessResult.blinks} blinks)`
        : 'Failed - No blinks or movement detected',
      passed: livenessResult.isLive
    });

    steps.push({
      step: 3,
      check: 'Age Sampling',
      result: `${ageResult.sampling.afterOutlierRemoval} valid samples (${ageResult.sampling.outlierRemoved} outliers removed)`,
      passed: ageResult.sampling.afterOutlierRemoval >= 5
    });

    steps.push({
      step: 4,
      check: 'Age Estimation',
      result: `Estimated: ${ageResult.estimatedAge} years (range: ${ageResult.statistics.minAge}-${ageResult.statistics.maxAge})`,
      passed: true
    });

    steps.push({
      step: 5,
      check: 'Confidence Check',
      result: `${Math.round(ageResult.confidence * 100)}% confidence (StdDev: ${ageResult.statistics.stdDeviation})`,
      passed: ageResult.confidence >= this.HIGH_CONFIDENCE
    });

    steps.push({
      step: 6,
      check: 'Decision',
      result: `${decision} → ${decision.includes('ADULT') ? 'ALLOW' : 'BLOCK'}`,
      passed: decision.includes('ADULT')
    });

    return steps;
  }
}

// Make available globally
window.DecisionEngine = DecisionEngine;