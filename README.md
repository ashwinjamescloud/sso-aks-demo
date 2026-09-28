# SSO + Managed Identity + AKS Learning App

A minimal Node.js/Express app built to teach three things end to end:

1. **SSO** - users sign in once via **Microsoft Entra ID** (OAuth2/OIDC Authorization Code flow, via MSAL Node).
2. **Managed Identity** - the _app itself_ (not the user) reads a secret from **Azure Key Vault** using `DefaultAzureCredential`, with zero secrets/connection strings in code.
3. **AKS deployment** - the app runs in Kubernetes, and the Managed Identity is delivered to the pod via **Azure AD Workload Identity** (federated credentials), not by minting/rotating keys.

## Architecture

```
Browser --(1. login)--> Entra ID --(2. redirect w/ code)--> App (Express)
                                                               |
                                                               | (3. app's own identity,
                                                               |    NOT the user's)
                                                               v
                                                        Azure Key Vault
```

The two identities are intentionally separate:

- The **user's** identity proves who is allowed to use the app (SSO).
- The **workload's** identity (Managed Identity) proves the app itself is allowed to call Key Vault. These never mix - a compromised user session can't leak the app's Key Vault permissions, and vice versa.

## Repo layout

```
src/
  server.js          Express app, sessions, routes
  authConfig.js       MSAL / Entra ID config
  keyvault.js         DefaultAzureCredential -> Key Vault
  routes/auth.js       /auth/signin, /auth/redirect, /auth/signout
  routes/secret.js     protected route that reads the Key Vault secret
  views/*.ejs          minimal HTML
Dockerfile
k8s/                    Kubernetes manifests (namespace, SA, deployment, etc.)
```

## Part 1 - Set up Entra ID (SSO)

1. Azure Portal -> **Microsoft Entra ID -> App registrations -> New registration**.
2. Redirect URI (Web): `http://localhost:3000/auth/redirect` for local dev; add your production URL (e.g. `https://sso-demo.example.com/auth/redirect`) later.
3. **Certificates & secrets -> New client secret** - copy the value immediately.
4. Note the **Application (client) ID** and **Directory (tenant) ID** from the Overview page.
5. Copy `.env.example` to `.env` and fill in `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`, `ENTRA_CLIENT_SECRET`.

Run locally:

```bash
npm install
npm start
# visit http://localhost:3000 and click "Sign in with Entra ID"
```

At this point `/secret` will fail (no Key Vault access yet) - that's expected until Part 2.

## Part 2 - Set up Key Vault + Managed Identity (local dev)

For local development, the simplest identity is your own `az login` session:

```bash
az login
# az login --tenant e2f70176-8b8b-4b57-8ec9-9b3dc32a232e
az keyvault create --name <kv-name> --resource-group <rg> --location <region>
az keyvault secret set --vault-name <kv-name> --name demo-secret --value "hello from key vault"
az role assignment create \
  --assignee "$(az ad signed-in-user show --query id -o tsv)" \
  --role "Key Vault Secrets User" \
  --scope "$(az keyvault show --name <kv-name> --query id -o tsv)"
```

Set `KEYVAULT_URL` and `KEYVAULT_SECRET_NAME` in `.env`, restart the app, and `/secret` should now work - `DefaultAzureCredential` falls back to your Azure CLI login when no managed identity is present.

## Part 3 - Deploy to AKS with Workload Identity

### 3.1 Enable the prerequisites on your AKS cluster

```bash
az aks update -g <rg> -n <aks-name> --enable-oidc-issuer --enable-workload-identity
export AKS_OIDC_ISSUER=$(az aks show -g <rg> -n <aks-name> --query "oidcIssuerProfile.issuerUrl" -o tsv)
```

### 3.2 Create the User-Assigned Managed Identity and federate it

```bash
az identity create -g <rg> -n sso-demo-identity
export UAMI_CLIENT_ID=$(az identity show -g <rg> -n sso-demo-identity --query clientId -o tsv)
export UAMI_PRINCIPAL_ID=$(az identity show -g <rg> -n sso-demo-identity --query principalId -o tsv)

az identity federated-credential create \
  --name sso-demo-fic \
  --identity-name sso-demo-identity \
  --resource-group <rg> \
  --issuer "$AKS_OIDC_ISSUER" \
  --subject "system:serviceaccount:sso-demo:sso-demo-sa" \
  --audience api://AzureADTokenExchange
```

### 3.3 Grant the identity access to Key Vault

```bash
az role assignment create \
  --assignee-object-id "$UAMI_PRINCIPAL_ID" --assignee-principal-type ServicePrincipal \
  --role "Key Vault Secrets User" \
  --scope "$(az keyvault show --name <kv-name> --query id -o tsv)"
```

### 3.4 Build and push the image

```bash
az acr build --registry <your-acr-name> --image sso-demo:latest .
```

### 3.5 Fill in and apply the manifests

Edit the placeholders in `k8s/01-serviceaccount.yaml` (`UAMI_CLIENT_ID`), `k8s/02-configmap.yaml` (tenant/client IDs, URLs), and `k8s/04-deployment.yaml` (ACR image). Then:

```bash
kubectl apply -f k8s/00-namespace.yaml
kubectl apply -f k8s/01-serviceaccount.yaml
kubectl apply -f k8s/02-configmap.yaml
kubectl create secret generic sso-demo-secrets -n sso-demo \
  --from-literal=ENTRA_CLIENT_SECRET='<value>' \
  --from-literal=SESSION_SECRET="$(openssl rand -hex 32)"
kubectl apply -f k8s/04-deployment.yaml
kubectl apply -f k8s/05-service.yaml
kubectl apply -f k8s/06-ingress.yaml   # if you have an ingress controller + DNS ready
```

Update the Entra ID app registration's redirect URI to match your real ingress hostname before testing SSO end to end.

### 3.6 Verify

```bash
kubectl get pods -n sso-demo
kubectl logs -n sso-demo deploy/sso-demo
```

Visit the app, sign in, then hit "Read a Key Vault secret" - no keys or connection strings were ever configured for Key Vault access; the pod authenticated purely through its federated Managed Identity.

## Key concepts recap

| Concept                                             | Where it shows up in this repo                                                                                             |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| SSO (OIDC Authorization Code flow)                  | `src/authConfig.js`, `src/routes/auth.js`                                                                                  |
| Managed Identity                                    | `src/keyvault.js` (`DefaultAzureCredential`)                                                                               |
| Workload Identity federation (how MI reaches a pod) | `k8s/01-serviceaccount.yaml`, the `azure.workload.identity/*` labels/annotations, and the federated credential in step 3.2 |
| AKS deployment                                      | `Dockerfile`, `k8s/04-deployment.yaml`, `k8s/05-service.yaml`, `k8s/06-ingress.yaml`                                       |

## Notes / production hardening ideas (not included here, to keep this a learning app)

- Use a **certificate** instead of a client secret for the confidential client.
- Put `ENTRA_CLIENT_SECRET` in Key Vault and sync it into the cluster with the **Secrets Store CSI Driver**, rather than `kubectl create secret`.
- Add token validation middleware if you expose APIs (not just the browser login flow) - e.g. validate bearer tokens with `passport-azure-ad` or `jose`.
- Turn on `cookie.secure = true` and sit the app behind TLS-terminating ingress in production.
