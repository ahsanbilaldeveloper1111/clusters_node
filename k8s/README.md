# Kubernetes manifests

Deploy with **Kustomize**:

| Overlay | Use case |
|---------|----------|
| `overlays/local` | Minikube, kind, Docker Desktop — local images `enterprise-*:local` |
| `overlays/production` | GHCR images, TLS Ingress, higher replicas |
| `overlays/blue-green` | Optional blue/green app slots (local) |
| `overlays/blue-green-production` | Optional blue/green for CD / GHCR |
| `overlays/blue-green-aws` | Optional blue/green for AWS EKS (ECR + RDS/ElastiCache) |
| `overlays/aws-production` | Rolling deploy on AWS EKS |

**Guides:**

- [KUBERNETES.md](../docs/KUBERNETES.md) — setup, commands, troubleshooting  
- [KUBERNETES_DEPLOYMENT_FLOW.md](../docs/KUBERNETES_DEPLOYMENT_FLOW.md) — deploy order, every manifest file  
- [BLUE_GREEN.md](../docs/BLUE_GREEN.md) — blue/green deploy, switch, rollback, CI/CD  
- [ARGOCD.md](../docs/ARGOCD.md) — GitOps with Argo CD

```bash
npm run k8s:build
npm run k8s:deploy

# Optional blue/green instead of rolling:
# npm run k8s:blue-green:bootstrap
# npm run k8s:blue-green:deploy -- local-v2 local-v2
# npm run k8s:blue-green:switch
```
