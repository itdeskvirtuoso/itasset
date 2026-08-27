const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Database Connection
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://itdeskvirtuoso_db_user:vpel@cluster0.mq1qghc.mongodb.net/assetdata';

const Role = require('./models/Role');

mongoose.connect(MONGODB_URI)
  .then(async () => {
    console.log('✅ Connected to MongoDB successfully');
    try {
      const roleCount = await Role.countDocuments();
      if (roleCount === 0) {
        const defaultRoles = [
          { name: 'Super Admin', permissions: ['*'] },
          { name: 'User 1', permissions: ['index.html', 'assets.html', 'returns.html', 'warranty.html', 'reports.html'] },
          { name: 'User 2', permissions: ['index.html', 'allocations.html', 'reports.html'] },
          { name: 'Employee', permissions: ['index.html'] }
        ];
        await Role.insertMany(defaultRoles);
      }
    } catch (err) {
      console.error('Error seeding roles:', err);
    }
  })
  .catch((err) => console.error('❌ MongoDB connection error:', err));

// Routes
const authRoutes = require('./routes/auth');
const assetRoutes = require('./routes/assets');
const allocationRoutes = require('./routes/allocations');
const returnRoutes = require('./routes/returns');
const roleRoutes = require('./routes/roles');
const userRoutes = require('./routes/users');
const profileRoutes = require('./routes/profile');

app.use('/api/auth', authRoutes);
app.use('/api/assets', assetRoutes);
app.use('/api/allocations', allocationRoutes);
app.use('/api/returns', returnRoutes);
app.use('/api/roles', roleRoutes);
app.use('/api/users', userRoutes);
app.use('/api/profile', profileRoutes);

// Basic health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'IT Asset Manager API is running' });
});

// Serve frontend static files
app.use(express.static(path.join(__dirname, '../frontend')));

// Catch-all route to serve index.html for SPA routing (for any non-API routes)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Start Server
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
}

module.exports = app;
