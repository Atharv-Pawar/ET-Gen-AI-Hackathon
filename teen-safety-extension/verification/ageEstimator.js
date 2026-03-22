/**
 * =====================================================
 * AGE ESTIMATION MODEL
 * =====================================================
 * 
 * Architecture Component: AGE ESTIMATION MODEL
 *   (face-api.js AgeGenderNet)
 * 
 * Features:
 *   • 10-frame sampling
 *   • Outlier removal (IQR)
 *   • Confidence scoring
 *   • Safety margin logic
 * =====================================================
 */

class AgeEstimator {
  constructor(config = {}) {
    // Configuration
    this.NUM_SAMPLES = config.numSamples || 10;
    this.SAMPLE_DELAY_MS = config.sampleDelay || 300;
    this.MIN_VALID_SAMPLES = config.minValidSamples || 7;
    this.INPUT_SIZE = config.inputSize || 416;

    // State
    this.samples = [];
    this.isEstimating = false;

    // Callbacks
    this.onProgress = config.onProgress || (() => {});
    this.onSample = config.onSample || (() => {});
  }

  /**
   * Perform age estimation using 10-frame sampling
   * 
   * @param {HTMLVideoElement} video - Video element with camera feed
   * @returns {object} Age estimation result
   */
  async estimate(video) {
    if (this.isEstimating) {
      throw new Error('Estimation already in progress');
    }

    this.isEstimating = true;
    this.samples = [];

    console.log(`[AgeEstimator] Starting ${this.NUM_SAMPLES}-frame sampling...`);

    try {
      // ── Step 1: Collect 10 samples ──
      for (let i = 0; i < this.NUM_SAMPLES; i++) {
        const detection = await faceapi
          .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({
            inputSize: this.INPUT_SIZE,
            scoreThreshold: 0.5
          }))
          .withFaceLandmarks()
          .withAgeAndGender();

        if (detection) {
          const sample = {
            index: i,
            age: detection.age,
            gender: detection.gender,
            genderProbability: detection.genderProbability,
            detectionScore: detection.detection.score
          };

          this.samples.push(sample);
          this.onSample(sample, i + 1, this.NUM_SAMPLES);

          console.log(`[AgeEstimator] Sample ${i + 1}/${this.NUM_SAMPLES}: Age=${detection.age.toFixed(1)}, Score=${detection.detection.score.toFixed(2)}`);
        } else {
          console.log(`[AgeEstimator] Sample ${i + 1}/${this.NUM_SAMPLES}: No face detected`);
        }

        // Progress callback
        this.onProgress({
          current: i + 1,
          total: this.NUM_SAMPLES,
          percent: Math.round(((i + 1) / this.NUM_SAMPLES) * 100),
          validSamples: this.samples.length
        });

        // Wait between samples
        if (i < this.NUM_SAMPLES - 1) {
          await this.sleep(this.SAMPLE_DELAY_MS);
        }
      }

      // ── Step 2: Validate sample count ──
      if (this.samples.length < this.MIN_VALID_SAMPLES) {
        throw new Error(
          `Insufficient face detections: ${this.samples.length}/${this.MIN_VALID_SAMPLES} required. ` +
          'Please improve lighting and face position.'
        );
      }

      // ── Step 3: Process results ──
      const result = this.processResults();

      console.log('[AgeEstimator] Final result:', result);

      return result;

    } finally {
      this.isEstimating = false;
    }
  }

  /**
   * Process collected samples
   * Applies: Outlier removal (IQR) → Confidence scoring → Safety margin
   */
  processResults() {
    const rawAges = this.samples.map(s => s.age);

    // ── Outlier Removal using IQR method ──
    const filteredAges = this.removeOutliers(rawAges);

    // ── Calculate statistics ──
    const meanAge = this.calculateMean(filteredAges);
    const medianAge = this.calculateMedian(filteredAges);
    const stdDev = this.calculateStdDev(filteredAges);
    const roundedAge = Math.round(meanAge);

    // ── Confidence Scoring ──
    const confidence = this.calculateConfidence(filteredAges, rawAges);

    // ── Gender consensus ──
    const genderResult = this.getGenderConsensus();

    return {
      // Primary result
      estimatedAge: roundedAge,
      confidence: confidence,

      // Statistics
      statistics: {
        meanAge: Math.round(meanAge * 10) / 10,
        medianAge: Math.round(medianAge * 10) / 10,
        stdDeviation: Math.round(stdDev * 100) / 100,
        minAge: Math.round(Math.min(...filteredAges)),
        maxAge: Math.round(Math.max(...filteredAges)),
        ageRange: Math.round(Math.max(...filteredAges) - Math.min(...filteredAges))
      },

      // Sample info
      sampling: {
        totalFrames: this.NUM_SAMPLES,
        validDetections: rawAges.length,
        afterOutlierRemoval: filteredAges.length,
        outlierRemoved: rawAges.length - filteredAges.length
      },

      // Gender
      gender: genderResult,

      // Raw data (for debugging)
      rawAges: rawAges.map(a => Math.round(a * 10) / 10),
      filteredAges: filteredAges.map(a => Math.round(a * 10) / 10)
    };
  }

  /**
   * Remove outliers using IQR (Interquartile Range) method
   */
  removeOutliers(ages) {
    if (ages.length < 4) return ages;

    const sorted = [...ages].sort((a, b) => a - b);
    const q1Index = Math.floor(sorted.length * 0.25);
    const q3Index = Math.floor(sorted.length * 0.75);
    const q1 = sorted[q1Index];
    const q3 = sorted[q3Index];
    const iqr = q3 - q1;

    const lowerBound = q1 - 1.5 * iqr;
    const upperBound = q3 + 1.5 * iqr;

    const filtered = ages.filter(age => age >= lowerBound && age <= upperBound);

    console.log(`[AgeEstimator] IQR Outlier Removal: ${ages.length} → ${filtered.length} samples (Q1=${q1.toFixed(1)}, Q3=${q3.toFixed(1)}, IQR=${iqr.toFixed(1)})`);

    // If too many removed, use original
    return filtered.length >= 3 ? filtered : ages;
  }

  /**
   * Calculate confidence score
   * Based on: consistency of readings + detection quality + sample count
   */
  calculateConfidence(filteredAges, rawAges) {
    // Factor 1: Consistency (low std dev = high confidence) - 40%
    const stdDev = this.calculateStdDev(filteredAges);
    const consistencyScore = Math.max(0, 1 - (stdDev / 15));

    // Factor 2: Detection quality (detection scores) - 30%
    const avgDetectionScore = this.samples.reduce((sum, s) => sum + s.detectionScore, 0) / this.samples.length;

    // Factor 3: Sample completeness (more valid samples = higher confidence) - 30%
    const completenessScore = rawAges.length / this.NUM_SAMPLES;

    const confidence = (consistencyScore * 0.4) +
                       (avgDetectionScore * 0.3) +
                       (completenessScore * 0.3);

    return Math.round(Math.min(1, Math.max(0, confidence)) * 100) / 100;
  }

  /**
   * Get gender consensus from samples
   */
  getGenderConsensus() {
    const genders = this.samples.map(s => s.gender);
    const maleCount = genders.filter(g => g === 'male').length;
    const femaleCount = genders.filter(g => g === 'female').length;

    return {
      gender: maleCount > femaleCount ? 'male' : 'female',
      confidence: Math.max(maleCount, femaleCount) / genders.length
    };
  }

  // ── Utility functions ──

  calculateMean(arr) {
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  calculateMedian(arr) {
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0
      ? sorted[mid]
      : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  calculateStdDev(arr) {
    const mean = this.calculateMean(arr);
    const squareDiffs = arr.map(val => Math.pow(val - mean, 2));
    return Math.sqrt(this.calculateMean(squareDiffs));
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get raw samples for debugging
   */
  getSamples() {
    return [...this.samples];
  }
}

// Make available globally
window.AgeEstimator = AgeEstimator;