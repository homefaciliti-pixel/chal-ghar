
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const errorHandler = require('./middleware/error');

const app = express();

// ================================
// SECURITY MIDDLEWARE
// ================================

app.use(helmet());

app.use(
  cors({
    origin:
      process.env.CORS_ORIGIN === '*'
        ? '*'
        : (process.env.CORS_ORIGIN || '*')
            .split(',')
            .map((origin) => origin.trim()),
  })
);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ================================
// AUTH RATE LIMITING
// ================================

app.use(
  '/api/auth',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      status: false,
      message: 'Too many requests. Please try again later.',
      code: 'RATE_LIMITED',
    },
  })
);

// ================================
// HEALTH CHECK - NO DATABASE
// ================================

app.get(['/api/health', '/health'], (req, res) => {
  return res.status(200).json({
    status: true,
    message: 'CAB User API is running',
    data: {
      server: 'running',
      database: 'not_configured',
      environment: process.env.NODE_ENV || 'development',
      timestamp: new Date().toISOString(),
    },
  });
});

// ================================
// API ROUTES (Supports both /api/* and /*)
// ================================

app.use(['/api/auth', '/auth'], require('./routes/auth'));

app.use(['/api/meta', '/meta'], require('./routes/meta'));

app.use(['/api/rides', '/rides'], require('./routes/rides'));

app.use(['/api/profile', '/profile'], require('./routes/profile'));

app.use(['/api/support', '/support'], require('./routes/support'));

app.use(['/api', '/'], require('./routes/home'));

app.use(['/api', '/'], require('./routes/wallet-payments'));

app.use(['/api', '/'], require('./routes/addresses-promos'));

// ================================
// 404 - ROUTE NOT FOUND
// ================================

app.use((req, res) => {
  return res.status(404).json({
    status: false,
    message: 'API route not found',
    code: 'NOT_FOUND',
    path: req.originalUrl,
  });
});

// ================================
// GLOBAL ERROR HANDLER
// ================================

app.use(errorHandler);

// ================================
// START SERVER
// ================================

const port = Number(process.env.PORT || 5001);

const server = app.listen(port, () => {
  console.log(`CAB User API listening on port ${port}`);
  console.log(`Health check: http://localhost:${port}/api/health`);
  console.log('Database mode: not required for health check');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  server.close(() => {
    console.log('CAB User API server stopped');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  server.close(() => {
    console.log('CAB User API server stopped');
    process.exit(0);
  });
});

module.exports = app;
