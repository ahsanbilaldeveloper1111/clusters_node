output "aws_region" {
  description = "AWS region"
  value       = var.aws_region
}

output "vpc_id" {
  description = "VPC ID"
  value       = module.vpc.vpc_id
}

output "eks_cluster_name" {
  description = "EKS cluster name — use with aws eks update-kubeconfig"
  value       = module.eks.cluster_name
}

output "eks_cluster_endpoint" {
  description = "EKS API server endpoint"
  value       = module.eks.cluster_endpoint
}

output "configure_kubectl" {
  description = "Command to configure kubectl for this cluster"
  value       = "aws eks update-kubeconfig --region ${var.aws_region} --name ${module.eks.cluster_name}"
}

output "ecr_backend_repository_url" {
  description = "Push backend images here (or mirror from GHCR)"
  value       = module.ecr.backend_repository_url
}

output "ecr_frontend_repository_url" {
  description = "Push frontend-k8s images here"
  value       = module.ecr.frontend_repository_url
}

output "rds_endpoint" {
  description = "RDS PostgreSQL hostname (sensitive — prefer Secrets Manager)"
  value       = module.rds.endpoint
}

output "redis_endpoint" {
  description = "ElastiCache Redis primary endpoint"
  value       = module.elasticache.primary_endpoint
}

output "app_secrets_arn" {
  description = "Secrets Manager ARN containing DATABASE_URL, REDIS_URL, JWT_SECRET"
  value       = aws_secretsmanager_secret.app.arn
}

output "ingress_nlb_hostname" {
  description = "NLB hostname for NGINX Ingress (point app_domain DNS CNAME here)"
  value       = var.install_ingress_nginx ? try(data.kubernetes_service.ingress_nginx[0].status[0].load_balancer[0].ingress[0].hostname, "pending — run terraform apply again after NLB provisions") : "ingress-nginx not installed"
}

output "deploy_next_steps" {
  description = "High-level steps after terraform apply"
  value       = <<-EOT
    1. Configure kubectl: aws eks update-kubeconfig --region ${var.aws_region} --name ${module.eks.cluster_name}
    2. Push images to ECR (or update k8s image refs to ECR URLs)
    3. Sync secrets: bash scripts/k8s-aws-sync-secrets.sh
    4. Push images to ECR (see docs/AWS_DEPLOYMENT.md)
    5. Deploy: bash scripts/k8s-aws-deploy.sh  (or kubectl apply -k k8s/overlays/aws-production)
    6. Update ingress host to ${var.app_domain} and point DNS to ingress NLB
  EOT
}

data "kubernetes_service" "ingress_nginx" {
  count = var.install_ingress_nginx ? 1 : 0

  metadata {
    name      = "ingress-nginx-controller"
    namespace = "ingress-nginx"
  }

  depends_on = [helm_release.ingress_nginx]
}
