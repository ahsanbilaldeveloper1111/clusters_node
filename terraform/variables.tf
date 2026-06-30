variable "aws_region" {
  description = "AWS region for all resources"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Short name used in resource naming and tags"
  type        = string
  default     = "enterprise-app"
}

variable "environment" {
  description = "Deployment environment (dev, staging, production)"
  type        = string
  default     = "production"
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "single_nat_gateway" {
  description = "Use one NAT gateway instead of one per AZ (lower cost, less HA)"
  type        = bool
  default     = true
}

variable "eks_cluster_version" {
  description = "Kubernetes version for the EKS control plane"
  type        = string
  default     = "1.29"
}

variable "eks_node_instance_types" {
  description = "EC2 instance types for the EKS managed node group"
  type        = list(string)
  default     = ["t3.medium"]
}

variable "eks_node_desired_size" {
  description = "Desired number of worker nodes"
  type        = number
  default     = 2
}

variable "eks_node_min_size" {
  description = "Minimum number of worker nodes"
  type        = number
  default     = 1
}

variable "eks_node_max_size" {
  description = "Maximum number of worker nodes (HPA can add pods; nodes must exist)"
  type        = number
  default     = 4
}

variable "db_name" {
  description = "PostgreSQL database name (matches app config)"
  type        = string
  default     = "enterprise_db"
}

variable "db_username" {
  description = "PostgreSQL master username"
  type        = string
  default     = "app_user"
}

variable "db_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t3.micro"
}

variable "db_allocated_storage" {
  description = "RDS storage in GB"
  type        = number
  default     = 20
}

variable "redis_node_type" {
  description = "ElastiCache node type"
  type        = string
  default     = "cache.t3.micro"
}

variable "app_domain" {
  description = "Public hostname for the app Ingress (e.g. app.example.com)"
  type        = string
  default     = "app.example.com"
}

variable "jwt_secret" {
  description = "JWT signing secret (min 16 chars). Leave empty to auto-generate."
  type        = string
  default     = ""
  sensitive   = true
}

variable "install_ingress_nginx" {
  description = "Install NGINX Ingress Controller via Helm (works with existing k8s Ingress manifests)"
  type        = bool
  default     = true
}

variable "ecr_image_retention_count" {
  description = "Number of images to keep per ECR repository"
  type        = number
  default     = 10
}
