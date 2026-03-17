/**
 * Segment Time Model
 * 
 * Stores tracked travel times for road segments.
 * Used by StopwatchService to record real-world travel data.
 * A* algorithm uses this data for time-based routing.
 * 
 * Part of Phase 3: A* Pathfinder implementation.
 * 
 * @module models/SegmentTime
 * @version 1.0.0
 */

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Time of day bucket schema (for rush hour awareness)
const TimeOfDayBucketSchema = new Schema({
  avgSeconds: { type: Number, default: 0 },
  minSeconds: { type: Number, default: Infinity },
  maxSeconds: { type: Number, default: 0 },
  count: { type: Number, default: 0 }
}, { _id: false });

const SegmentTimeSchema = new Schema({
  // Segment identification
  routeId: {
    type: String,
    required: true,
    index: true
  },
  fromNodeId: {
    type: String,
    required: true
  },
  toNodeId: {
    type: String,
    required: true
  },
  vehicleType: {
    type: String,
    enum: ['jeep', 'jeepney', 'bus', 'bus_aircon', 'uv', 'tricycle', 'cab'],
    default: 'jeep'
  },
  
  // Aggregated statistics
  avgTimeSeconds: {
    type: Number,
    default: 0
  },
  minTimeSeconds: {
    type: Number,
    default: Infinity
  },
  maxTimeSeconds: {
    type: Number,
    default: 0
  },
  sampleCount: {
    type: Number,
    default: 0
  },
  
  // Time of day buckets
  timeOfDay: {
    morning: { type: TimeOfDayBucketSchema, default: () => ({}) },   // 6am - 9am
    midday: { type: TimeOfDayBucketSchema, default: () => ({}) },    // 9am - 4pm
    evening: { type: TimeOfDayBucketSchema, default: () => ({}) },   // 4pm - 8pm
    night: { type: TimeOfDayBucketSchema, default: () => ({}) }      // 8pm - 6am
  },
  
  // Distance for this segment (cached)
  distanceKm: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Compound index for efficient lookups
SegmentTimeSchema.index({ routeId: 1, fromNodeId: 1, toNodeId: 1 }, { unique: true });

/**
 * Get time of day bucket name based on hour
 * @param {number} hour - Hour (0-23)
 * @returns {string} Bucket name
 */
SegmentTimeSchema.statics.getTimeOfDayBucket = function(hour) {
  if (hour >= 6 && hour < 9) return 'morning';
  if (hour >= 9 && hour < 16) return 'midday';
  if (hour >= 16 && hour < 20) return 'evening';
  return 'night';
};

/**
 * Record a new time sample and update aggregates
 * @param {Object} data - Segment data
 * @returns {Promise<SegmentTime>}
 */
SegmentTimeSchema.statics.recordSample = async function(data) {
  const { routeId, fromNodeId, toNodeId, timeSeconds, vehicleType, distanceKm } = data;
  const hour = new Date().getHours();
  const bucket = this.getTimeOfDayBucket(hour);
  
  let segment = await this.findOne({ routeId, fromNodeId, toNodeId });
  
  if (!segment) {
    // Create new segment
    segment = new this({
      routeId,
      fromNodeId,
      toNodeId,
      vehicleType,
      distanceKm,
      avgTimeSeconds: timeSeconds,
      minTimeSeconds: timeSeconds,
      maxTimeSeconds: timeSeconds,
      sampleCount: 1
    });
    segment.timeOfDay[bucket] = {
      avgSeconds: timeSeconds,
      minSeconds: timeSeconds,
      maxSeconds: timeSeconds,
      count: 1
    };
  } else {
    // Update existing segment with running average
    const newCount = segment.sampleCount + 1;
    segment.avgTimeSeconds = 
      (segment.avgTimeSeconds * segment.sampleCount + timeSeconds) / newCount;
    segment.minTimeSeconds = Math.min(segment.minTimeSeconds, timeSeconds);
    segment.maxTimeSeconds = Math.max(segment.maxTimeSeconds, timeSeconds);
    segment.sampleCount = newCount;
    
    // Update time of day bucket
    const bucketData = segment.timeOfDay[bucket];
    const newBucketCount = bucketData.count + 1;
    bucketData.avgSeconds = 
      (bucketData.avgSeconds * bucketData.count + timeSeconds) / newBucketCount;
    bucketData.minSeconds = Math.min(bucketData.minSeconds || Infinity, timeSeconds);
    bucketData.maxSeconds = Math.max(bucketData.maxSeconds || 0, timeSeconds);
    bucketData.count = newBucketCount;
  }
  
  await segment.save();
  return segment;
};

const SegmentTime = mongoose.model('SegmentTime', SegmentTimeSchema);

module.exports = SegmentTime;

console.log('[SegmentTime] Model loaded');
