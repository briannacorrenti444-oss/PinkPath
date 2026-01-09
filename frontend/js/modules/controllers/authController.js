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

/**
 * Initialize auth state from localStorage
 */
export function initAuth() {
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
 * @returns {Promise<{success: boolean, user?: object, error?: string}>}
 */
export async function register(email, password, username = null) {
    try {
        const body = { email, password };
        if (username && username.trim()) {
            body.username = username.trim();
        }

        const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        const data = await response.json();

        if (!response.ok) {
            return {
                success: false,
                error: data.message || data.error || 'Registration failed'
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
        return {
            success: false,
            error: 'Network error. Please check your connection.'
        };
    }
}

/**
 * Login with email and password
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{success: boolean, user?: object, error?: string}>}
 */
export async function login(email, password) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (!response.ok) {
            return {
                success: false,
                error: data.message || data.error || 'Login failed'
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
        return {
            success: false,
            error: 'Network error. Please check your connection.'
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
 * Make an authenticated API request
 * @param {string} endpoint - API endpoint (without base URL)
 * @param {object} options - Fetch options
 */
export async function authFetch(endpoint, options = {}) {
    if (!authToken) {
        throw new Error('Not authenticated');
    }

    const headers = {
        ...options.headers,
        'Authorization': `Bearer ${authToken}`
    };

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers
    });

    // Handle 401 (token expired or invalid)
    if (response.status === 401) {
        clearAuth();
        window.dispatchEvent(new CustomEvent('auth-expired'));
    }

    return response;
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
