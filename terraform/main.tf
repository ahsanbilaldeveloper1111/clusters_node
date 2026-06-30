locals {
  name_prefix = "${var.project_name}-${var.environment}"
  azs         = slice(data.aws_availability_zones.available.names, 0, 2)

  common_tags = {
    Project     = var.project_name
    Environment = var.environment
  }
}

# ------------------------------------------------------------------------------
# Networking — VPC with public (ALB/NLB, NAT) and private (EKS, RDS, Redis) subnets
# ------------------------------------------------------------------------------
module "vpc" {
source  = "terraform-aws-modules/vpc/aws"
version = "~> 5.0"

  name = local.name_prefix
  cidr = var.vpc_cidr
  azs  = local.azs

  private_subnets = [for i, az in local.azs : cidrsubnet(var.vpc_cidr, 4, i)]
  public_subnets  = [for i, az in local.azs : cidrsubnet(var.vpc_cidr, 4, i + length(local.azs))]

  enable_nat_gateway = true
  single_nat_gateway = var.single_nat_gateway

  # Required tags for EKS to discover subnets for load balancers
  public_subnet_tags = {
    "kubernetes.io/role/elb" = "1"
  }
  private_subnet_tags = {
    "kubernetes.io/role/internal-elb" = "1"
  }
}

# ------------------------------------------------------------------------------
# EKS — runs backend, frontend, migrate/seed Jobs from k8s/overlays/production
# ------------------------------------------------------------------------------
module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 20.0"

  cluster_name    = local.name_prefix
  cluster_version = var.eks_cluster_version

  vpc_id     = module.vpc.vpc_id
  subnet_ids = module.vpc.private_subnets

  cluster_endpoint_public_access = true

  eks_managed_node_groups = {
    app = {
      name           = "${local.name_prefix}-nodes"
      instance_types = var.eks_node_instance_types
      desired_size   = var.eks_node_desired_size
      min_size       = var.eks_node_min_size
      max_size       = var.eks_node_max_size

      labels = {
        role = "application"
      }
    }
  }

  enable_cluster_creator_admin_permissions = true
}

# ------------------------------------------------------------------------------
# ECR — container registry for backend and frontend-k8s images
# ------------------------------------------------------------------------------
module "ecr" {
  source = "./modules/ecr"

  project_name          = var.project_name
  environment           = var.environment
  image_retention_count = var.ecr_image_retention_count
  eks_node_role_name    = module.eks.eks_managed_node_groups["app"].iam_role_name
}

# ------------------------------------------------------------------------------
# RDS PostgreSQL — replaces in-cluster postgres Deployment for production
# ------------------------------------------------------------------------------
resource "random_password" "db_password" {
  length  = 32
  special = false
}

locals {
  db_password = random_password.db_password.result
  database_url = format(
    "postgresql://%s:%s@%s:%s/%s?sslmode=require",
    var.db_username,
    local.db_password,
    module.rds.endpoint,
    module.rds.port,
    var.db_name,
  )
}

module "rds" {
  source = "./modules/rds"

  project_name       = var.project_name
  environment        = var.environment
  vpc_id             = module.vpc.vpc_id
  private_subnet_ids = module.vpc.private_subnets
  allowed_security_group_ids = [
    module.eks.cluster_security_group_id,
    module.eks.node_security_group_id,
  ]

  db_name           = var.db_name
  db_username       = var.db_username
  db_password       = local.db_password
  instance_class    = var.db_instance_class
  allocated_storage = var.db_allocated_storage
}

# ------------------------------------------------------------------------------
# ElastiCache Redis — replaces in-cluster redis Deployment
# ------------------------------------------------------------------------------
resource "random_password" "redis_auth" {
  length  = 32
  special = false
}

module "elasticache" {
  source = "./modules/elasticache"

  project_name       = var.project_name
  environment        = var.environment
  vpc_id             = module.vpc.vpc_id
  private_subnet_ids = module.vpc.private_subnets
  allowed_security_group_ids = [
    module.eks.cluster_security_group_id,
    module.eks.node_security_group_id,
  ]

  node_type   = var.redis_node_type
  auth_token  = random_password.redis_auth.result
}

locals {
  redis_url = "rediss://:${random_password.redis_auth.result}@${module.elasticache.primary_endpoint}:${module.elasticache.port}"
}

# ------------------------------------------------------------------------------
# Secrets Manager — DATABASE_URL, REDIS_URL, JWT_SECRET for the app
# ------------------------------------------------------------------------------
resource "random_password" "jwt_secret" {
  length  = 48
  special = false
}

locals {
  jwt_secret = var.jwt_secret != "" ? var.jwt_secret : random_password.jwt_secret.result
}

resource "aws_secretsmanager_secret" "app" {
  name        = "${local.name_prefix}/app-secrets"
  description = "Runtime secrets for ${var.project_name} (DATABASE_URL, REDIS_URL, JWT_SECRET)"
}

resource "aws_secretsmanager_secret_version" "app" {
  secret_id = aws_secretsmanager_secret.app.id
  secret_string = jsonencode({
    DATABASE_URL = local.database_url
    REDIS_URL    = local.redis_url
    JWT_SECRET   = local.jwt_secret
  })
}

# Allow EKS nodes to read app secrets (for External Secrets Operator or manual sync)
resource "aws_iam_policy" "app_secrets_read" {
  name        = "${local.name_prefix}-app-secrets-read"
  description = "Read app secrets from Secrets Manager"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret"]
      Resource = [aws_secretsmanager_secret.app.arn]
    }]
  })
}

resource "aws_iam_role_policy_attachment" "eks_nodes_secrets" {
  role       = module.eks.eks_managed_node_groups["app"].iam_role_name
  policy_arn = aws_iam_policy.app_secrets_read.arn
}

# ------------------------------------------------------------------------------
# NGINX Ingress Controller — exposes frontend via AWS Network Load Balancer
# Compatible with k8s/base/ingress.yaml (ingressClassName: nginx)
# ------------------------------------------------------------------------------
resource "helm_release" "ingress_nginx" {
  count = var.install_ingress_nginx ? 1 : 0

  name             = "ingress-nginx"
  repository       = "https://kubernetes.github.io/ingress-nginx"
  chart            = "ingress-nginx"
  namespace        = "ingress-nginx"
  create_namespace = true
  version          = "4.10.1"

  set {
    name  = "controller.service.annotations.service\\.beta\\.kubernetes\\.io/aws-load-balancer-type"
    value = "nlb"
  }

  set {
    name  = "controller.service.annotations.service\\.beta\\.kubernetes\\.io/aws-load-balancer-scheme"
    value = "internet-facing"
  }

  depends_on = [module.eks]
}
