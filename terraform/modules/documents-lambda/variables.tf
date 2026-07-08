variable "project_name" {
  type = string
}

variable "environment" {
  type = string
}

variable "aws_region" {
  type = string
}

variable "lambda_source_dir" {
  description = "Path to built Lambda zip (function.zip) — used when lambda_package_type = Zip"
  type        = string
  default     = ""
}

variable "lambda_package_type" {
  description = "Zip or Image (Docker container on ECR)"
  type        = string
  default     = "Image"

  validation {
    condition     = contains(["Zip", "Image"], var.lambda_package_type)
    error_message = "lambda_package_type must be Zip or Image"
  }
}

variable "lambda_image_uri" {
  description = "Full ECR image URI with tag when lambda_package_type = Image"
  type        = string
  default     = ""
}

variable "lambda_image_tag" {
  description = "Docker image tag for ECR push"
  type        = string
  default     = "latest"
}

variable "bucket_name" {
  description = "Optional custom S3 bucket name (must be globally unique)"
  type        = string
  default     = ""
}

variable "max_upload_bytes" {
  type    = number
  default = 10485760
}

variable "presign_expires_seconds" {
  type    = number
  default = 900
}

variable "allowed_content_types" {
  type    = string
  default = "application/pdf,image/png,image/jpeg,text/plain,application/json"
}

variable "enable_api_gateway" {
  type    = bool
  default = true
}

variable "docker_build_context" {
  description = "Path to lambda/document-upload directory"
  type        = string
  default     = ""
}

variable "docker_build_script" {
  description = "Script that builds and pushes the Lambda Docker image to ECR"
  type        = string
  default     = ""
}
