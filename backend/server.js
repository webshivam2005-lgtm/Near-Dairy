const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '.env') });
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const authRoutes = require('./src/routes/auth.routes');
const dairiesRoutes = require('./src/routes/dairies.routes');
const productsRoutes = require('./src/routes/products.routes');
const subscriptionsRoutes = require('./src/routes/subscriptions.routes');
const ordersRoutes = require('./src/routes/orders.routes');
const paymentsRoutes = require('./src/routes/payments.routes');
const adminRoutes = require('./src/routes/admin.routes');
const complaintsRoutes = require('./src/routes/complaints.routes');
const reviewsRoutes = require('./src/routes/reviews.routes');
const uploadRoutes = require('./src/routes/upload.routes');
const notificationsRoutes = require('./src/routes/notifications.routes');
const supportRoutes = require('./src/routes/support.routes');
const { errorHandler, notFoundHandler } = require('./src/middleware/error.middleware');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for all origins (supports Vercel frontend, custom domains, and local dev)
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin']
}));

app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve local uploaded files
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));

// Serve static assets from frontend/ directory (for local dev / monolithic mode)
const frontendPath = path.join(__dirname, '..', 'frontend');
if (fs.existsSync(frontendPath)) {
  app.use(express.static(frontendPath));
}

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/dairies', dairiesRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/subscriptions', subscriptionsRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/complaints', complaintsRoutes);
app.use('/api/reviews', reviewsRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/support', supportRoutes);

// Health Check Endpoint (used by Render health check)
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    platform: 'Near Dairy Backend',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
  });
});

// Root API Status Endpoint
app.get('/', (req, res) => {
  const indexHtml = path.join(frontendPath, 'index.html');
  if (fs.existsSync(indexHtml)) {
    return res.sendFile(indexHtml);
  }
  res.json({
    status: 'online',
    platform: 'Near Dairy API Server',
    version: '1.0.0',
    health: '/api/health',
    timestamp: new Date().toISOString()
  });
});

// HTML Page Route Fallbacks (for local monolithic execution)
app.get('/partner', (req, res) => {
  res.sendFile(path.join(frontendPath, 'partner-dashboard.html'));
});

app.get('/customer', (req, res) => {
  res.sendFile(path.join(frontendPath, 'customer-dashboard.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(frontendPath, 'admin-dashboard.html'));
});

app.get('/auth', (req, res) => {
  res.sendFile(path.join(frontendPath, 'auth.html'));
});

app.get('/dairy/:id', (req, res) => {
  res.sendFile(path.join(frontendPath, 'dairy.html'));
});

// Error handling middleware
app.use(errorHandler);

// Start server on Render, standard Node hosts, or local development
if (!process.env.VERCEL) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`====================================================`);
    console.log(`🥛 Near Dairy Platform Server running on port ${PORT}`);
    console.log(`🚀 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`⚡ Health check: http://localhost:${PORT}/api/health`);
    console.log(`====================================================`);
  });
}

module.exports = app;
