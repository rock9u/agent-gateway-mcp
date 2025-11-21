/**
 * Timestamp Utilities for MCP Unified Gateway
 *
 * Code pattern enforcement requires all operations to include timestamps
 * and completion messages to follow the "desu" format.
 *
 * @module timestamp-utils
 */

/**
 * Get current timestamp in ISO 8601 format
 * @returns {string} ISO timestamp string
 * @example
 * const timestamp = getTimestamp();
 * // Returns: "2024-01-15T10:30:00.000Z"
 */
export const getTimestamp = (): string => {
  return new Date().toISOString();
};

/**
 * Create completion message with timestamp in "desu" format
 * This is the required pattern for all completion messages.
 *
 * @param {string} message - The message to append timestamp to
 * @returns {string} Message with " desu: [timestamp]" suffix
 * @example
 * const msg = createCompletionMessage("Operation complete");
 * // Returns: "Operation complete desu: 2024-01-15T10:30:00.000Z"
 */
export const createCompletionMessage = (message: string): string => {
  return `${message} desu: ${getTimestamp()}`;
};

/**
 * Log message with timestamp prefix
 * Ensures all console logs include timestamps for debugging.
 *
 * @param {string} message - Message to log
 * @returns {void}
 * @example
 * logWithTimestamp("Request received");
 * // Logs: "[2024-01-15T10:30:00.000Z] Request received"
 */
export const logWithTimestamp = (message: string): void => {
  console.log(`[${getTimestamp()}] ${message}`);
};

/**
 * Log error with timestamp prefix
 * @param {string} message - Error message to log
 * @returns {void}
 */
export const logErrorWithTimestamp = (message: string): void => {
  console.error(`[${getTimestamp()}] ERROR: ${message}`);
};

/**
 * Log warning with timestamp prefix
 * @param {string} message - Warning message to log
 * @returns {void}
 */
export const logWarningWithTimestamp = (message: string): void => {
  console.warn(`[${getTimestamp()}] WARNING: ${message}`);
};

/**
 * Create timestamped JSON response
 * Adds timestamp field to any JSON object.
 *
 * @param {object} data - Data object to timestamp
 * @returns {object} Data with timestamp field added
 * @example
 * const response = createTimestampedResponse({ status: "ok" });
 * // Returns: { status: "ok", timestamp: "2024-01-15T10:30:00.000Z" }
 */
export const createTimestampedResponse = <T extends object>(data: T): T & { timestamp: string } => {
  return {
    ...data,
    timestamp: getTimestamp()
  };
};

/**
 * Calculate duration between two timestamps
 * @param {string} startTime - ISO timestamp string
 * @param {string} endTime - ISO timestamp string (optional, defaults to now)
 * @returns {number} Duration in milliseconds
 */
export const calculateDuration = (startTime: string, endTime?: string): number => {
  const start = new Date(startTime).getTime();
  const end = endTime ? new Date(endTime).getTime() : Date.now();
  return end - start;
};

/**
 * Format duration for display
 * @param {number} milliseconds - Duration in milliseconds
 * @returns {string} Formatted duration string
 * @example
 * formatDuration(1500);
 * // Returns: "1.50s"
 */
export const formatDuration = (milliseconds: number): string => {
  if (milliseconds < 1000) {
    return `${milliseconds}ms`;
  } else if (milliseconds < 60000) {
    return `${(milliseconds / 1000).toFixed(2)}s`;
  } else {
    const minutes = Math.floor(milliseconds / 60000);
    const seconds = ((milliseconds % 60000) / 1000).toFixed(0);
    return `${minutes}m ${seconds}s`;
  }
};

/**
 * Create a performance tracker
 * Returns start timestamp and a finish function that logs duration.
 *
 * @param {string} operationName - Name of operation being tracked
 * @returns {object} Object with startTime and finish function
 * @example
 * const perf = trackPerformance("database query");
 * // ... do work ...
 * perf.finish(); // Logs: "[timestamp] database query completed in 150ms"
 */
export const trackPerformance = (operationName: string) => {
  const startTime = getTimestamp();
  const startMs = Date.now();

  logWithTimestamp(`${operationName} started`);

  return {
    startTime,
    finish: () => {
      const duration = Date.now() - startMs;
      logWithTimestamp(`${operationName} completed in ${formatDuration(duration)}`);
      return {
        startTime,
        endTime: getTimestamp(),
        durationMs: duration,
        durationFormatted: formatDuration(duration)
      };
    }
  };
};

/**
 * Create timestamped error object
 * @param {string} message - Error message
 * @param {number} code - Error code
 * @returns {object} Error object with timestamp
 */
export const createTimestampedError = (message: string, code: number = -32603) => {
  return {
    jsonrpc: '2.0',
    error: {
      code,
      message: createCompletionMessage(message)
    },
    id: null,
    timestamp: getTimestamp()
  };
};

/**
 * Timestamp validator
 * Checks if a string is a valid ISO timestamp.
 *
 * @param {string} timestamp - Timestamp string to validate
 * @returns {boolean} True if valid ISO timestamp
 */
export const isValidTimestamp = (timestamp: string): boolean => {
  const parsed = new Date(timestamp);
  return !isNaN(parsed.getTime()) && parsed.toISOString() === timestamp;
};

/**
 * Get age of timestamp in milliseconds
 * @param {string} timestamp - ISO timestamp string
 * @returns {number} Age in milliseconds
 */
export const getTimestampAge = (timestamp: string): number => {
  return Date.now() - new Date(timestamp).getTime();
};

/**
 * Check if timestamp is stale (older than threshold)
 * @param {string} timestamp - ISO timestamp string
 * @param {number} thresholdMs - Threshold in milliseconds (default: 30000ms = 30s)
 * @returns {boolean} True if timestamp is older than threshold
 */
export const isTimestampStale = (timestamp: string, thresholdMs: number = 30000): boolean => {
  return getTimestampAge(timestamp) > thresholdMs;
};

// Default export for convenience
export default {
  getTimestamp,
  createCompletionMessage,
  logWithTimestamp,
  logErrorWithTimestamp,
  logWarningWithTimestamp,
  createTimestampedResponse,
  calculateDuration,
  formatDuration,
  trackPerformance,
  createTimestampedError,
  isValidTimestamp,
  getTimestampAge,
  isTimestampStale
};

/**
 * Usage Examples:
 *
 * // Basic timestamp
 * const now = getTimestamp();
 *
 * // Completion message
 * const msg = createCompletionMessage("Task complete");
 *
 * // Logging
 * logWithTimestamp("Processing request");
 *
 * // Performance tracking
 * const perf = trackPerformance("API call");
 * await fetch(...);
 * const result = perf.finish();
 *
 * // Timestamped response
 * const response = createTimestampedResponse({ status: "ok", data: [...] });
 *
 * // Error with timestamp
 * const error = createTimestampedError("Invalid request", -32600);
 */
