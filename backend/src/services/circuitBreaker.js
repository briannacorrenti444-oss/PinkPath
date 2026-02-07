/**
 * @fileoverview Circuit Breaker Pattern Implementation
 * Prevents cascading failures when external services are unavailable
 *
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Service is failing, requests fail fast without calling service
 * - HALF_OPEN: Testing if service recovered, limited requests allowed
 */

// Circuit breaker states
const STATES = {
  CLOSED: 'CLOSED',
  OPEN: 'OPEN',
  HALF_OPEN: 'HALF_OPEN',
};

// Default configuration
const DEFAULT_CONFIG = {
  failureThreshold: 5,        // Failures before opening circuit
  successThreshold: 2,        // Successes in half-open to close
  timeout: 30000,             // Time in ms before trying half-open
  resetTimeout: 60000,        // Time in ms before resetting failure count
};

// Store for circuit breakers (keyed by service name)
const circuits = new Map();

/**
 * Circuit breaker class for managing service health
 */
class CircuitBreaker {
  constructor(name, config = {}) {
    this.name = name;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.state = STATES.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.lastStateChange = Date.now();
  }

  /**
   * Check if the circuit allows requests
   * @returns {boolean}
   */
  canRequest() {
    const now = Date.now();

    switch (this.state) {
      case STATES.CLOSED:
        return true;

      case STATES.OPEN:
        // Check if timeout has passed, transition to half-open
        if (now - this.lastStateChange >= this.config.timeout) {
          this.transitionTo(STATES.HALF_OPEN);
          return true;
        }
        return false;

      case STATES.HALF_OPEN:
        // Allow limited requests to test service
        return true;

      default:
        return true;
    }
  }

  /**
   * Record a successful request
   */
  recordSuccess() {
    this.failureCount = 0;

    if (this.state === STATES.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.config.successThreshold) {
        this.transitionTo(STATES.CLOSED);
      }
    }
  }

  /**
   * Record a failed request
   */
  recordFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    this.successCount = 0;

    if (this.state === STATES.HALF_OPEN) {
      // Immediately open on failure in half-open state
      this.transitionTo(STATES.OPEN);
    } else if (this.state === STATES.CLOSED) {
      if (this.failureCount >= this.config.failureThreshold) {
        this.transitionTo(STATES.OPEN);
      }
    }
  }

  /**
   * Transition to a new state
   * @param {string} newState
   */
  transitionTo(newState) {
    const oldState = this.state;
    this.state = newState;
    this.lastStateChange = Date.now();

    if (newState === STATES.CLOSED) {
      this.failureCount = 0;
      this.successCount = 0;
    } else if (newState === STATES.HALF_OPEN) {
      this.successCount = 0;
    }

    console.log(`[CircuitBreaker] ${this.name}: ${oldState} -> ${newState}`);
  }

  /**
   * Get circuit status for monitoring
   */
  getStatus() {
    return {
      name: this.name,
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      config: this.config,
    };
  }
}

/**
 * Get or create a circuit breaker for a service
 * @param {string} serviceName - Name of the service
 * @param {object} config - Circuit breaker configuration
 * @returns {CircuitBreaker}
 */
export function getCircuitBreaker(serviceName, config = {}) {
  if (!circuits.has(serviceName)) {
    circuits.set(serviceName, new CircuitBreaker(serviceName, config));
  }
  return circuits.get(serviceName);
}

/**
 * Execute a function with circuit breaker protection
 * @param {string} serviceName - Name of the service
 * @param {Function} fn - Async function to execute
 * @param {object} options - Options
 * @param {any} options.fallback - Fallback value if circuit is open
 * @param {object} options.config - Circuit breaker config overrides
 * @returns {Promise<any>}
 */
export async function withCircuitBreaker(serviceName, fn, options = {}) {
  const circuit = getCircuitBreaker(serviceName, options.config);

  if (!circuit.canRequest()) {
    console.warn(`[CircuitBreaker] ${serviceName}: Circuit OPEN, returning fallback`);

    if (options.fallback !== undefined) {
      return options.fallback;
    }

    const error = new Error(`Service ${serviceName} is temporarily unavailable`);
    error.code = 'CIRCUIT_OPEN';
    error.serviceName = serviceName;
    throw error;
  }

  try {
    const result = await fn();
    circuit.recordSuccess();
    return result;
  } catch (error) {
    circuit.recordFailure();

    // If we have a fallback and circuit just opened, use it
    if (options.fallback !== undefined && circuit.state === STATES.OPEN) {
      console.warn(`[CircuitBreaker] ${serviceName}: Using fallback due to failure`);
      return options.fallback;
    }

    throw error;
  }
}

/**
 * Get status of all circuit breakers
 * @returns {object[]}
 */
export function getAllCircuitStatus() {
  const statuses = [];
  for (const circuit of circuits.values()) {
    statuses.push(circuit.getStatus());
  }
  return statuses;
}

/**
 * Reset a circuit breaker (for testing/admin)
 * @param {string} serviceName
 */
export function resetCircuit(serviceName) {
  const circuit = circuits.get(serviceName);
  if (circuit) {
    circuit.transitionTo(STATES.CLOSED);
    console.log(`[CircuitBreaker] ${serviceName}: Manually reset to CLOSED`);
  }
}

export default {
  withCircuitBreaker,
  getCircuitBreaker,
  getAllCircuitStatus,
  resetCircuit,
  STATES,
};
