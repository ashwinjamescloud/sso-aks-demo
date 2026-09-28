const { DefaultAzureCredential } = require('@azure/identity');
const { SecretClient } = require('@azure/keyvault-secrets');

// DefaultAzureCredential tries, in order: environment vars, workload identity
// (federated token in AKS), managed identity, Azure CLI login, etc.
// This is the key piece that means NO secret/connection-string is ever put
// in code or config to reach Key Vault - the pod's identity does the work.
const credential = new DefaultAzureCredential();

let secretClient = null;
function getSecretClient() {
  if (!secretClient) {
    const vaultUrl = process.env.KEYVAULT_URL;
    if (!vaultUrl) {
      throw new Error('KEYVAULT_URL is not set');
    }
    secretClient = new SecretClient(vaultUrl, credential);
  }
  return secretClient;
}

async function readDemoSecret() {
  const client = getSecretClient();
  const name = process.env.KEYVAULT_SECRET_NAME || 'demo-secret';
  const secret = await client.getSecret(name);
  return { name, value: secret.value, updatedOn: secret.properties.updatedOn };
}

module.exports = { readDemoSecret };
