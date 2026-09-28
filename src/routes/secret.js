const express = require('express');
const { readDemoSecret } = require('../keyvault');

const router = express.Router();

function requireAuth(req, res, next) {
  if (!req.session.account) {
    return res.redirect('/auth/signin');
  }
  next();
}

// This route is only reachable once the user has signed in via Entra ID (SSO).
// It then uses the *workload's own identity* (Managed Identity / Workload
// Identity in AKS) - completely separate from the user's identity - to read
// a secret from Key Vault. No secret/connection string lives in this app.
router.get('/', requireAuth, async (req, res) => {
  try {
    const secret = await readDemoSecret();
    res.render('secret', {
      user: req.session.account,
      secretName: secret.name,
      secretValue: secret.value,
      updatedOn: secret.updatedOn,
      error: null,
    });
  } catch (err) {
    res.render('secret', {
      user: req.session.account,
      secretName: process.env.KEYVAULT_SECRET_NAME,
      secretValue: null,
      updatedOn: null,
      error: err.message,
    });
  }
});

module.exports = router;
