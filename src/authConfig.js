require('dotenv').config();

// Configuration for MSAL Node confidential client (Authorization Code flow).
// This is what implements "Single Sign-On" against Entra ID.
const msalConfig = {
  auth: {
    clientId: process.env.ENTRA_CLIENT_ID,
    authority: `https://login.microsoftonline.com/${process.env.ENTRA_TENANT_ID}`,
    clientSecret: process.env.ENTRA_CLIENT_SECRET,
  },
  system: {
    loggerOptions: {
      loggerCallback(loglevel, message) {
        if (process.env.MSAL_DEBUG) console.log(message);
      },
      piiLoggingEnabled: false,
      logLevel: 'Warning',
    },
  },
};

const REDIRECT_URI = process.env.REDIRECT_URI || 'http://localhost:3000/auth/redirect';
const POST_LOGOUT_REDIRECT_URI =
  process.env.POST_LOGOUT_REDIRECT_URI || 'http://localhost:3000';

// Minimal scope: sign the user in and read their basic profile.
const LOGIN_SCOPES = ['openid', 'profile', 'User.Read'];

module.exports = { msalConfig, REDIRECT_URI, POST_LOGOUT_REDIRECT_URI, LOGIN_SCOPES };
