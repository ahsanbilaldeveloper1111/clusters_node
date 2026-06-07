# Argo CD GitOps

**Repo:** `git@github.com:ahsanbilaldeveloper1111/clusters_node.git`  
**Sync path:** `k8s/overlays/gitops`  
**Images:** `ghcr.io/ahsanbilaldeveloper1111/clusters_node/{backend,frontend-k8s}`

```bash
bash scripts/argocd-install.sh   # exposes UI at https://localhost:8082
bash scripts/argocd-bootstrap.sh
```

Full guide: [docs/ARGOCD.md](../docs/ARGOCD.md)
