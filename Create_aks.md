In PowerShell, set variables you'll reuse for every command below (adjust names/region as you like; reusing devops-rg from earlier keeps everything in one place):
$RG="devops-rg"; 
$LOCATION="canadacentral";
$ACR_NAME="ssoaksacr$(Get-Random -Maximum 9999)";
$AKS_NAME="sso-aks-cluster" ACR names must be globally unique and alphanumeric only, hence the random suffix.

------------- Create the Container Registry
az acr create --resource-group $RG --name $ACR_NAME --sku Basic

This is where your Docker image (built with the Dockerfile from Part 3 earlier) will live before AKS pulls it.

--------Create the AKS cluster with OIDC issuer and Workload Identity enabled
az aks create --resource-group $RG --name $AKS_NAME --node-count 1 --node-vm-size Standard_B2s --enable-oidc-issuer --enable-workload-identity --generate-ssh-keys --attach-acr $ACR_NAME

az aks create --resource-group $RG --name $AKS_NAME --node-count 1 --node-vm-size Standard_D2s_v3 --enable-oidc-issuer --enable-workload-identity --generate-ssh-keys --attach-acr $ACR_NAME

This single command does three important things: creates the cluster, turns on the OIDC issuer (required for federated credentials), and turns on the Workload Identity feature. --attach-acr wires up AKS to pull images from your registry without extra credentials. This step takes several minutes.

------------Get cluster credentials for kubectl
az aks get-credentials --resource-group $RG --name $AKS_NAME

-------------Capture the OIDC issuer URL
$AKS_OIDC_ISSUER = az aks show -g $RG -n $AKS_NAME --query "oidcIssuerProfile.issuerUrl" -o tsv

echo $AKS_OIDC_ISSUER

-------------Create the Managed Identity and federate it

az identity create -g $RG -n sso-demo-identity

$UAMI_CLIENT_ID = az identity show -g $RG -n sso-demo-identity --query clientId -o tsv

$UAMI_PRINCIPAL_ID = az identity show -g $RG -n sso-demo-identity --query principalId -o tsv

az identity federated-credential create --name sso-demo-fic --identity-name sso-demo-identity --resource-group $RG --issuer $AKS_OIDC_ISSUER --subject "system:serviceaccount:sso-demo:sso-demo-sa" --audience api://AzureADTokenExchange

echo $UAMI_CLIENT_ID
echo $UAMI_PRINCIPAL_ID

------------------Grant the identity Key Vault access

az role assignment create --assignee-object-id $UAMI_PRINCIPAL_ID --assignee-principal-type ServicePrincipal --role "Key Vault Secrets User" --scope $(az keyvault show --name devops-kv-1 --query id -o tsv)

----------------Build and push your image, then deploy

az acr build --registry $ACR_NAME --image sso-demo:latest .

------------------- Fill the k8 file with values
