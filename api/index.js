// Vercel serverless function entry point
// TypeScript compiles 'export default app' to 'module.exports.default = app'
const serverModule = require('../dist/server.js');
const app = serverModule.default || serverModule;

// Export the Express app for Vercel
module.exports = app;

