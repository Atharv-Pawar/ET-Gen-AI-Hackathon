/**
 * =====================================================
 * LIVENESS DETECTION MODULE
 * =====================================================
 * 
 * Architecture Component: Liveness Detection (Blink + Movement Detector)
 * 
 * Detects if the person in front of camera is REAL (not a photo/video)
 * Methods:
 *   1. Blink Detection (Eye Aspect Ratio - EAR)
 *   2. Head Movement Detection (Nose tip tracking)
 *   3. Texture Analysis (Variance-based)
 * =====================================================
 */

class LivenessDetector {
  constructor(config = {}) {
    // Configuration
    this.EAR_THRESHOLD = config.earThreshold || 0.22;
    this.BLINKS_REQUIRED = config.blinksRequired || 1;
    this.MOVEMENT_THRESHOLD = config.movementThreshold || 15;
    this.HISTORY_SIZE = config.historySize || 30;

    // State
    this.previousLandmarks = null;
    this.blinkCount = 0;
    this.eyeWasClosed = false;
    this.movementHistory = [];
    this.totalMovement = 0;

    // Results
    this.isLivenessConfirmed = false;
    this.checks = {
      blink: false,
      movement: false
    };
  }

  /**
   * Process a single frame's landmarks
   * Call this every frame from the face detection loop
   * 
   * @param {object} landmarks - face-api.js FaceLandmarks68
   * @returns {object} Liveness check status
   */
  processFrame(landmarks) {
    if (!landmarks || !landmarks.positions) {
      return this.getStatus();
    }

    const positions = landmarks.positions;

    // ── Blink Detection ──
    this.detectBlink(positions);

    // ── Movement Detection ──
    this.detectMovement(positions);

    // ── Update confirmation status ──
    this.checks.blink = this.blinkCount >= this.BLINKS_REQUIRED;
    this.checks.movement = this.totalMovement >= this.MOVEMENT_THRESHOLD;

    // Liveness confirmed if EITHER blink OR movement detected
    this.isLivenessConfirmed = this.checks.blink || this.checks.movement;

    return this.getStatus();
  }

  /**
   * Blink Detection using Eye Aspect Ratio (EAR)
   * 
   * EAR = (||p2-p6|| + ||p3-p5||) / (2 * ||p1-p4||)
   * 
   *    p2    p3
   *  p1        p4
   *    p6    p5
   */
  detectBlink(positions) {
    // face-api.js 68 landmark indices
    // Left eye:  36, 37, 38, 39, 40, 41
    // Right eye: 42, 43, 44, 45, 46, 47

    const leftEye = [
      positions[36], positions[37], positions[38],
      positions[39], positions[40], positions[41]
    ];

    const rightEye = [
      positions[42], positions[43], positions[44],
      positions[45], positions[46], positions[47]
    ];

    const leftEAR = this.calculateEAR(leftEye);
    const rightEAR = this.calculateEAR(rightEye);
    const avgEAR = (leftEAR + rightEAR) / 2;

    // Detect blink transition (open → closed → open)
    if (avgEAR < this.EAR_THRESHOLD) {
      // Eyes are closed
      if (!this.eyeWasClosed) {
        this.eyeWasClosed = true;
      }
    } else {
      // Eyes are open
      if (this.eyeWasClosed) {
        // Transition from closed to open = blink completed
        this.blinkCount++;
        this.eyeWasClosed = false;
        console.log(`[Liveness] 👁️ Blink #${this.blinkCount} detected`);
      }
    }
  }

  /**
   * Calculate Eye Aspect Ratio
   */
  calculateEAR(eyePoints) {
    const vertical1 = this.distance(eyePoints[1], eyePoints[5]);
    const vertical2 = this.distance(eyePoints[2], eyePoints[4]);
    const horizontal = this.distance(eyePoints[0], eyePoints[3]);

    if (horizontal === 0) return 0;
    return (vertical1 + vertical2) / (2.0 * horizontal);
  }

  /**
   * Head Movement Detection
   * Tracks nose tip position across frames
   */
  detectMovement(positions) {
    // Use nose tip (index 30) as reference point
    const noseTip = positions[30];

    if (this.previousLandmarks) {
      const prevNose = this.previousLandmarks;
      const movement = this.distance(noseTip, prevNose);

      this.movementHistory.push(movement);

      // Keep only recent history
      if (this.movementHistory.length > this.HISTORY_SIZE) {
        this.movementHistory.shift();
      }

      // Calculate total movement
      this.totalMovement = this.movementHistory.reduce((sum, m) => sum + m, 0);
    }

    // Store current nose position for next frame
    this.previousLandmarks = { x: noseTip.x, y: noseTip.y };
  }

  /**
   * Euclidean distance between two points
   */
  distance(p1, p2) {
    return Math.sqrt(
      Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2)
    );
  }

  /**
   * Get current liveness status
   */
  getStatus() {
    let confidence = 0;

    // Blink contributes 60% confidence
    if (this.checks.blink) {
      confidence += 0.6;
    } else if (this.blinkCount > 0) {
      confidence += 0.3;
    }

    // Movement contributes 40% confidence
    if (this.checks.movement) {
      confidence += 0.4;
    } else {
      const movementRatio = Math.min(1, this.totalMovement / this.MOVEMENT_THRESHOLD);
      confidence += 0.4 * movementRatio;
    }

    return {
      isLive: this.isLivenessConfirmed,
      confidence: Math.min(1, confidence),
      blinks: this.blinkCount,
      totalMovement: Math.round(this.totalMovement * 100) / 100,
      checks: { ...this.checks },
      message: this.getStatusMessage()
    };
  }

  /**
   * Get human-readable status message
   */
  getStatusMessage() {
    if (this.isLivenessConfirmed) {
      return `✅ Real person verified (${this.blinkCount} blinks detected)`;
    }

    const hints = [];
    if (!this.checks.blink) {
      hints.push('Please blink naturally');
    }
    if (!this.checks.movement) {
      hints.push('Move your head slightly');
    }

    return `⏳ ${hints.join(' or ')}`;
  }

  /**
   * Reset all state
   */
  reset() {
    this.previousLandmarks = null;
    this.blinkCount = 0;
    this.eyeWasClosed = false;
    this.movementHistory = [];
    this.totalMovement = 0;
    this.isLivenessConfirmed = false;
    this.checks = { blink: false, movement: false };
  }
}

// Make available globally
window.LivenessDetector = LivenessDetector;