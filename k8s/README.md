# Kubernetes manifests

Deploy with **Kustomize**:

| Overlay | Use case |
|---------|----------|
| `overlays/local` | Minikube, kind, Docker Desktop — local images `enterprise-*:local` |
| `overlays/production` | GHCR images, TLS Ingress, higher replicas |

**Guides:**

- [KUBERNETES.md](../docs/KUBERNETES.md) — setup, commands, troubleshooting  
- [KUBERNETES_DEPLOYMENT_FLOW.md](../docs/KUBERNETES_DEPLOYMENT_FLOW.md) — deploy order, every manifest file  
- [ARGOCD.md](../docs/ARGOCD.md) — GitOps with Argo CD

```bash
npm run k8s:build
npm run k8s:deploy
```
