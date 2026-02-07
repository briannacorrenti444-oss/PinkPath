// ========================================
// AUTH CONTROLLER
// Handles authentication API calls and state
// ========================================

import { API_BASE_URL } from '../config.js';

// Auth state
let currentUser = null;
let authToken = null;

// Storage keys
const TOKEN_KEY = 'pinkpath_token';
const USER_KEY = 'pinkpath_user';

// ========================================
// NETWORK UTILITIES
// ========================================

/** Default timeout for API requests (30 seconds) */
const DEFAULT_TIMEOUT_MS = 30000;

/** Max retry attempts for failed requests */
const MAX_RETRIES = 3;

/** Base delay for exponential backoff (1 second) */
const RETRY_BASE_DELAY_MS = 1000;

/**
 * Error code to user-friendly message mapping
 * Backend error codes are mapped to actionable messages
 */
const ERROR_CODE_MESSAGES = {
    // Auth errors
    'AUTH_001': 'Your session has expired. Please sign in again.',
    'AUTH_002': 'Invalid or expired authentication. Please sign in again.',
    'AUTH_003': 'Invalid credentials. Check your email and password.',
    'AUTH_004': 'This email is already registered. Try signing in instead.',
    // User errors
    'USER_001': 'User not found. Please check your details.',
    'USER_002': 'You\'ve reached your contact limit. Upgrade to add more.',
    'USER_003': 'Invalid phone number format.',
    // Rate limit errors
    'RATE_001': 'Too many requests. Please wait a moment and try again.',
    // Validation errors
    'VALIDATION_001': 'Please check your input and try again.',
    // Trip errors
    'TRIP_001': 'Trip not found.',
    'TRIP_002': 'You already have an active trip. End it first.',
    // Generic errors
    'SERVER_ERROR': 'Something went wrong. Please try again later.',
    'NETWORK_ERROR': 'Network error. Check your connection and try again.',
    'TIMEOUT_ERROR': 'Request timed out. Please try again.',
};

/**
 * Get user-friendly message for an error code
 * @param {string} code - Error code from backend
 * @param {string} fallback - Fallback message if code not found
 * @returns {string} User-friendly error message
 */
export function getErrorMessage(code, fallback = 'An error occurred. Please try again.') {
    return ERROR_CODE_MESSAGES[code] || fallback;
}

/**
 * Fetch with timeout using AbortController
 * @param {string} url - Request URL
 * @param {object} options - Fetch options
 * @param {number} timeoutMs - Timeout in milliseconds
 * @returns {Promise<Response>}
 */
async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal,
        });
        return response;
    } catch (error) {
        if (error.name === 'AbortError') {
            const timeoutError = new Error('Request timed out');
            timeoutError.code = 'TIMEOUT_ERROR';
            timeoutError.isTimeout = true;
            throw timeoutError;
        }
        throw error;
    } finally {
        clearTimeout(timeoutId);
    }
}

/**
 * Fetch with retry logic and exponential backoff
 * Only retries on network errors and 5xx server errors
 * @param {string} url - Request URL
 * @param {object} options - Fetch options
 * @param {number} maxRetries - Maximum retry attempts
 * @returns {Promise<Response>}
 */
async function fetchWithRetry(url, options = {}, maxRetries = MAX_RETRIES) {
    let lastError;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const response = await fetchWithTimeout(url, options);

            // Don't retry on client errors (4xx) - only on server errors (5xx)
            if (response.status >= 500 && attempt < maxRetries) {
                const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
                console.log(`[authController] Server error ${response.status}, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
                await sleep(delay);
                continue;
            }

            return response;
        } catch (error) {
            lastError = error;

            // Don't retry on timeout or if we've exhausted retries
            if (error.isTimeout || attempt >= maxRetries) {
                throw error;
            }

            // Retry on network errors with exponential backoff
            const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
            console.log(`[authController] Network error, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries}):`, error.message);
            await sleep(delay);
        }
    }

    // Should not reach here, but throw last error just in case
    throw lastError;
}

/**
 * Sleep utility for retry delays
 * @param {number} ms - Milliseconds to sleep
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Initialize auth state from localStorage
 * Also checks for OAuth callback parameters in URL
 */
export function initAuth() {
    // Check for OAuth callback first
    const oauthResult = handleOAuthCallback();
    if (oauthResult.handled) {
        return { user: currentUser, token: authToken, oauthResult };
    }

    // Restore from localStorage
    const storedToken = localStorage.getItem(TOKEN_KEY);
    const storedUser = localStorage.getItem(USER_KEY);

    if (storedToken && storedUser) {
        authToken = storedToken;
        try {
            currentUser = JSON.parse(storedUser);
            console.log('[authController] Restored auth state for:', currentUser.email);
        } catch (e) {
            console.error('[authController] Failed to parse stored user:', e);
            clearAuth();
        }
    }

    return { user: currentUser, token: authToken };
}

/**
 * Handle OAuth callback - check URL for token or error
 * @returns {{handled: boolean, success?: boolean, error?: string}}
 */
function handleOAuthCallback() {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    const error = urlParams.get('error');

    // Not an OAuth callback
    if (!token && !error) {
        return { handled: false };
    }

    // Clean up URL (remove token/error from address bar)
    // Redirect to home page - safer than staying on /auth/callback
    // Also handles edge case of double slashes in pathname
    window.history.replaceState({}, document.title, '/');

    // Handle error
    if (error) {
        console.error('[authController] OAuth error:', error);
        return {
            handled: true,
            success: false,
            error: getOAuthErrorMessage(error)
        };
    }

    // Handle success - store token and fetch user info
    if (token) {
        authToken = token;
        localStorage.setItem(TOKEN_KEY, token);
        console.log('[authController] OAuth token received, fetching user info...');

        // Fetch user info async (will update UI when complete)
        fetchAndStoreUser();

        return { handled: true, success: true };
    }

    return { handled: false };
}

/**
 * Fetch user info from token and store it
 */
async function fetchAndStoreUser() {
    try {
        const response = await authFetch('/api/auth/me');
        if (response.ok) {
            const data = await response.json();
            currentUser = data.user;
            localStorage.setItem(USER_KEY, JSON.stringify(currentUser));
            console.log('[authController] OAuth login successful:', currentUser.email);

            // Dispatch event so UI can update
            window.dispatchEvent(new CustomEvent('auth-login', {
                detail: { user: currentUser }
            }));
        } else {
            console.error('[authController] Failed to fetch user info');
            clearAuth();
        }
    } catch (error) {
        console.error('[authController] Error fetching user:', error);
        clearAuth();
    }
}

/**
 * Get user-friendly error message for OAuth errors
 */
function getOAuthErrorMessage(error) {
    const errorMessages = {
        'access_denied': 'You cancelled the sign-in process',
        'invalid_state': 'Security check failed. Please try again.',
        'oauth_failed': 'Google sign-in failed. Please try again.',
        'server_error': 'Server error. Please try again later.',
    };
    return errorMessages[error] || 'Sign-in failed. Please try again.';
}

/**
 * Initiate Google OAuth flow
 */
export function startGoogleSignIn() {
    // Redirect to backend OAuth endpoint
    window.location.href = `${API_BASE_URL}/api/auth/google`;
}

/**
 * Get current auth state
 */
export function getAuthState() {
    return {
        isLoggedIn: !!authToken && !!currentUser,
        user: currentUser,
        token: authToken
    };
}

/**
 * Register a new user
 * @param {string} email
 * @param {string} password
 * @param {string} username - Optional
 * @returns {Promise<{success: boolean, user?: object, error?: string, code?: string}>}
 */
export async function register(email, password, username = null) {
    try {
        const body = { email, password };
        if (username && username.trim()) {
            body.username = username.trim();
        }

        const response = await fetchWithTimeout(`${API_BASE_URL}/api/auth/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        const data = await response.json();

        if (!response.ok) {
            const errorCode = data.code || 'AUTH_004';
            return {
                success: false,
                error: getErrorMessage(errorCode, data.message || 'Registration failed'),
                code: errorCode
            };
        }

        // Store auth data
        authToken = data.token;
        currentUser = data.user;
        localStorage.setItem(TOKEN_KEY, authToken);
        localStorage.setItem(USER_KEY, JSON.stringify(currentUser));

        console.log('[authController] Registration successful:', currentUser.email);

        return {
            success: true,
            user: currentUser
        };

    } catch (error) {
        console.error('[authController] Registration error:', error);
        const errorCode = error.isTimeout ? 'TIMEOUT_ERROR' : 'NETWORK_ERROR';
        return {
            success: false,
            error: getErrorMessage(errorCode),
            code: errorCode
        };
    }
}

/**
 * Login with email and password
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{success: boolean, user?: object, error?: string, code?: string}>}
 */
export async function login(email, password) {
    try {
        const response = await fetchWithTimeout(`${API_BASE_URL}/api/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (!response.ok) {
            const errorCode = data.code || 'AUTH_003';
            return {
                success: false,
                error: getErrorMessage(errorCode, data.message || 'Login failed'),
                code: errorCode
            };
        }

        // Store auth data
        authToken = data.token;
        currentUser = data.user;
        localStorage.setItem(TOKEN_KEY, authToken);
        localStorage.setItem(USER_KEY, JSON.stringify(currentUser));

        console.log('[authController] Login successful:', currentUser.email);

        return {
            success: true,
            user: currentUser
        };

    } catch (error) {
        console.error('[authController] Login error:', error);
        const errorCode = error.isTimeout ? 'TIMEOUT_ERROR' : 'NETWORK_ERROR';
        return {
            success: false,
            error: getErrorMessage(errorCode),
            code: errorCode
        };
    }
}

/**
 * Logout - clear auth state
 */
export function logout() {
    clearAuth();
    console.log('[authController] Logged out');
}

/**
 * Clear auth state from memory and storage
 */
function clearAuth() {
    authToken = null;
    currentUser = null;
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
}

/**
 * Get the current auth token for API calls
 */
export function getToken() {
    return authToken;
}

/**
 * Get current user
 */
export function getCurrentUser() {
    return currentUser;
}

/**
 * Make an authenticated API request with timeout and retry
 * @param {string} endpoint - API endpoint (without base URL)
 * @param {object} options - Fetch options
 * @param {object} config - Additional config (timeout, retries)
 * @returns {Promise<Response>}
 */
export async function authFetch(endpoint, options = {}, config = {}) {
    if (!authToken) {
        const error = new Error('Not authenticated');
        error.code = 'AUTH_001';
        throw error;
    }

    const headers = {
        ...options.headers,
        'Authorization': `Bearer ${authToken}`
    };

    const fetchOptions = {
        ...options,
        headers
    };

    try {
        // Use retry for GET requests, single attempt for mutations
        const isIdempotent = !options.method || options.method === 'GET';
        const maxRetries = config.retries ?? (isIdempotent ? MAX_RETRIES : 0);

        const response = await fetchWithRetry(
            `${API_BASE_URL}${endpoint}`,
            fetchOptions,
            maxRetries
        );

        // Handle 401 (token expired or invalid)
        if (response.status === 401) {
            clearAuth();
            window.dispatchEvent(new CustomEvent('auth-expired'));
        }

        return response;
    } catch (error) {
        // Enhance error with code if it's a network/timeout error
        if (error.isTimeout) {
            error.code = 'TIMEOUT_ERROR';
            error.userMessage = getErrorMessage('TIMEOUT_ERROR');
        } else if (!error.code) {
            error.code = 'NETWORK_ERROR';
            error.userMessage = getErrorMessage('NETWORK_ERROR');
        }
        throw error;
    }
}

/**
 * Verify current token is still valid
 */
export async function verifyToken() {
    if (!authToken) {
        return false;
    }

    try {
        const response = await authFetch('/api/auth/me');
        if (response.ok) {
            const data = await response.json();
            currentUser = data.user;
            localStorage.setItem(USER_KEY, JSON.stringify(currentUser));
            return true;
        }
        return false;
    } catch (error) {
        console.error('[authController] Token verification failed:', error);
        return false;
    }
}
