const express = require('express');
const msal = require('@azure/msal-node');
const {
  msalConfig,
  REDIRECT_URI,
  POST_LOGOUT_REDIRECT_URI,
  LOGIN_SCOPES,
} = require('../authConfig');

const router = express.Router();
const cca = new msal.ConfidentialClientApplication(msalConfig);

// Step 1: kick off the OIDC authorization code flow -> redirects to Entra ID login.
router.get('/signin', async (req, res, next) => {
  const authCodeUrlParameters = {
    scopes: LOGIN_SCOPES,
    redirectUri: REDIRECT_URI,
  };
  try {
    const authUrl = await cca.getAuthCodeUrl(authCodeUrlParameters);
    res.redirect(authUrl);
  } catch (err) {
    next(err);
  }
});

// Step 2: Entra ID redirects back here with an auth code; exchange it for tokens.
router.get('/redirect', async (req, res, next) => {
  const tokenRequest = {
    code: req.query.code,
    scopes: LOGIN_SCOPES,
    redirectUri: REDIRECT_URI,
  };
  try {
    const response = await cca.acquireTokenByCode(tokenRequest);
    // Store just what we need in the session (server-side), not the raw tokens
    // in a cookie, to keep this simple and reasonably safe for a demo.
    req.session.account = {
      name: response.account.name,
      username: response.account.username,
      idTokenClaims: response.idTokenClaims,
    };
    res.redirect('/');
  } catch (err) {
    next(err);
  }
});

router.get('/signout', (req, res) => {
  const logoutUri =
    `https://login.microsoftonline.com/${process.env.ENTRA_TENANT_ID}/oauth2/v2.0/logout?` +
    `post_logout_redirect_uri=${encodeURIComponent(POST_LOGOUT_REDIRECT_URI)}`;
  req.session.destroy(() => {
    res.redirect(logoutUri);
  });
});

module.exports = router;
