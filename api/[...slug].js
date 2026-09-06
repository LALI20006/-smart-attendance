// Vercel Serverless Catch-All Entry Point
// Routes all /api/* subpaths to the Express server
const app = require('../server');

module.exports = (req, res) => {
  return app(req, res);
};
