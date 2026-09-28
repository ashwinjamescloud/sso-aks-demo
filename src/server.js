require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');

const authRoutes = require('./routes/auth');
const secretRoutes = require('./routes/secret');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'dev-only-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, httpOnly: true, maxAge: 1000 * 60 * 30 },
  })
);

app.use('/auth', authRoutes);
app.use('/secret', secretRoutes);

app.get('/', (req, res) => {
  res.render('home', { user: req.session.account || null });
});

// Kubernetes liveness/readiness probe target - deliberately unauthenticated.
app.get('/healthz', (req, res) => res.status(200).send('ok'));

app.listen(PORT, () => {
  console.log(`sso-aks-demo listening on port ${PORT}`);
});
