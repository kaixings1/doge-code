const path = require('path');

module.exports = {
  apps: [{
    name: 'heartflow',
    script: path.join(__dirname, 'src', 'mcp-server.js'),
    args: '--port 8099',
    cwd: __dirname,
    instances: 1,
    autorestart: true,
    max_restarts: 100,
    restart_delay: 3000,
    exp_backoff_restart_delay: 100,
    max_memory_restart: '512M',
    env: {
      NODE_ENV: 'production',
      HEARTFLOW_MCP_TOKEN: (() => {
        try {
          const dotenv = require('dotenv');
          const parsed = dotenv.config({ path: path.join(__dirname, '.env') }).parsed;
          return process.env.HEARTFLOW_MCP_TOKEN || parsed?.MCP_HEARTFLOW_KEY;
        } catch (_) { return process.env.HEARTFLOW_MCP_TOKEN; }
      })()
    },
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    error_file: path.join(__dirname, 'data', 'logs', 'heartflow-error.log'),
    out_file: path.join(__dirname, 'data', 'logs', 'heartflow-out.log'),
  }]
};
