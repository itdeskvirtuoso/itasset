const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const { getJwtSecret } = require('./utils/security');

// Load environment variables
dotenv.config();

const app = express();

// Secrets only come from the environment (backend/.env locally, Project Settings on Vercel)
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) console.error('❌ MONGODB_URI is not set. Add it to backend/.env or the Vercel environment variables.');
if (!getJwtSecret()) console.error('❌ JWT_SECRET is missing or shorter than 32 characters. Sign-in will be refused until it is set.');

// Middleware
app.disable('x-powered-by');
// "simple" parsing keeps every query value a plain string: ?status[$ne]=x can't become a Mongo operator
app.set('query parser', 'simple');

// Same-origin requests need no CORS headers. Other origins must be listed in CORS_ORIGINS
// (comma separated); during local development any localhost port is allowed.
const allowedOrigins = (process.env.CORS_ORIGINS || '').split(',').map((o) => o.trim()).filter(Boolean);
const isLocalOrigin = (origin) => /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
app.use(cors({
  origin(origin, callback) {
    const allowed = !origin || allowedOrigins.includes(origin) || (process.env.NODE_ENV !== 'production' && isLocalOrigin(origin));
    callback(null, allowed);
  }
}));
app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

const Role = require('./models/Role');
const User = require('./models/User');

async function seedDefaults() {
  const roleCount = await Role.countDocuments();
  if (roleCount === 0) {
    await Role.insertMany([
      { name: 'Super Admin', permissions: ['*'] },
      { name: 'Employee', permissions: ['index.html'] }
    ]);
  }

  // A first Super Admin is only created when the database has none and an initial password
  // is supplied through the environment. No password is ever written in the code.
  const initialPassword = process.env.ADMIN_INITIAL_PASSWORD || '';
  if (await User.exists({ role: 'Super Admin' })) return;
  if (initialPassword.length < 12) {
    console.warn('⚠️  No Super Admin exists. Set ADMIN_INITIAL_PASSWORD (12+ characters) to create the "admin" account.');
    return;
  }
  const bcrypt = require('bcryptjs');
  await User.create({
    username: 'admin',
    password: await bcrypt.hash(initialPassword, await bcrypt.genSalt(10)),
    role: 'Super Admin'
  });
  console.log('✅ Super Admin account "admin" seeded. Remove ADMIN_INITIAL_PASSWORD from the environment now.');
}

// One shared connection per server instance. On Vercel an instance can outlive a failed
// connect, so a failure clears the cached promise and the next request tries again.
let dbPromise = null;
function connectDB() {
  if (mongoose.connection.readyState === 1) return Promise.resolve();
  if (!dbPromise) {
    dbPromise = mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 8000 })
      .then(async () => {
        console.log('✅ Connected to MongoDB successfully');
        try {
          await seedDefaults();
        } catch (err) {
          console.error('Error seeding data:', err);
        }
      })
      .catch((err) => {
        dbPromise = null;
        throw err;
      });
  }
  return dbPromise;
}

if (MONGODB_URI) connectDB().catch((err) => console.error('❌ MongoDB connection error:', err.message));

// Basic health check endpoint (also reports the database state, without any secrets)
app.get('/api/health', async (req, res) => {
  let database = 'not-configured';
  if (MONGODB_URI) {
    try {
      await connectDB();
      database = 'connected';
    } catch (err) {
      database = 'unreachable';
    }
  }
  res.json({ status: 'ok', message: 'IT Asset Manager API is running', database });
});

// Every other API route needs the database: wait for it instead of letting queries hang,
// and say clearly what is wrong when it can't be reached.
app.use('/api', async (req, res, next) => {
  if (!MONGODB_URI) {
    return res.status(503).json({ message: 'Database is not configured on the server (MONGODB_URI missing). Contact the administrator.' });
  }
  try {
    await connectDB();
    next();
  } catch (err) {
    console.error('❌ MongoDB connection error:', err.message);
    res.status(503).json({ message: 'Cannot reach the database right now. Please try again in a minute.' });
  }
});

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

// Unknown API paths get a JSON 404 instead of the SPA's index.html
app.use('/api', (req, res) => {
  res.status(404).json({ message: 'API route not found' });
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
