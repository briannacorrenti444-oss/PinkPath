// ========================================
// JEST CONFIGURATION
// ========================================
// Run tests: npm test | npm run test:watch | npm run test:coverage
// Docs: https://jestjs.io/docs/configuration
// ========================================

export default {
    // Use Node.js environment (not browser/jsdom) for pure JS logic
    testEnvironment: 'node',

    // No transpilation needed - we use native ES6 modules
    transform: {},

    // Only look for .js files
    moduleFileExtensions: ['js'],

    // Find tests in: tests/**/*.test.js
    testMatch: ['**/tests/**/*.test.js'],

    // Show individual test names in output
    verbose: true,

    // Coverage includes all modules except config.js (just constants)
    collectCoverageFrom: [
        'js/modules/**/*.js',
        '!js/modules/config.js'
    ]
};
