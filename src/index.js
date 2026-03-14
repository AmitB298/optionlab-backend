require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const authRoutes  = require('./routes/auth.routes');
const adminRoutes = require('./routes/admin.routes');
const angelRoutes = require('./routes/angel.routes');

const app  = express();
const PORT = process.env.PORT || 5000;

app.use(helmet({ contentSecurityPolicy: false }));

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : ['http://localhost:3000','https://optionlab.in','https://www.optionlab.in','https://web-production-8a8e1.up.railway.app'];

app.use(cors({ origin: (o, cb) => (!o || allowedOrigins.includes(o)) ? cb(null,true) : cb(new Error('CORS')), credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/api', rateLimit({ windowMs: 15*60*1000, max: 100, message: { success:false, message:'Too many requests' } }));
app.use('/api/auth', rateLimit({ windowMs: 15*60*1000, max: 20, message: { success:false, message:'Too many auth attempts' } }));

app.get('/health', (req, res) => res.json({ status:'ok', service:'OptionLab API', version:'2.0.0', timestamp: new Date().toISOString() }));

app.use('/api/auth',  authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/angel', angelRoutes);

app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ success:false, message:'Route not found' });
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});
app.use((err, req, res, next) => res.status(500).json({ success:false, message:'Internal server error' }));

app.listen(PORT, () => {
  console.log(`OptionLab API running on port ${PORT}`);
});
