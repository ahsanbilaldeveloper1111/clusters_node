locals {
  name_prefix = "${var.project_name}-${var.environment}"
  bucket_name = var.bucket_name != "" ? var.bucket_name : "${local.name_prefix}-documents-${data.aws_caller_identity.current.account_id}"
}

data "aws_caller_identity" "current" {}

# ------------------------------------------------------------------------------
# ECR — Lambda container image repository (Docker deployment)
# ------------------------------------------------------------------------------
resource "aws_ecr_repository" "lambda_document_upload" {
  count = var.lambda_package_type == "Image" ? 1 : 0

  name                 = "${local.name_prefix}/document-upload-lambda"
  image_tag_mutability = "MUTABLE"
  force_delete         = true

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecr_lifecycle_policy" "lambda_document_upload" {
  count = var.lambda_package_type == "Image" ? 1 : 0

  repository = aws_ecr_repository.lambda_document_upload[0].name

  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep last 10 Lambda images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 10
      }
      action = { type = "expire" }
    }]
  })
}

resource "null_resource" "lambda_docker_build_push" {
  count = var.lambda_package_type == "Image" && var.docker_build_script != "" ? 1 : 0

  triggers = {
    dockerfile_hash = filemd5("${var.docker_build_context}/Dockerfile")
    handler_hash    = filemd5("${var.docker_build_context}/src/index.ts")
    package_hash    = filemd5("${var.docker_build_context}/package.json")
    image_tag       = var.lambda_image_tag
    ecr_url         = aws_ecr_repository.lambda_document_upload[0].repository_url
  }

  provisioner "local-exec" {
    command = "AWS_REGION=${var.aws_region} IMAGE_TAG=${var.lambda_image_tag} ECR_REPOSITORY_URL=${aws_ecr_repository.lambda_document_upload[0].repository_url} bash ${var.docker_build_script}"
  }

  depends_on = [aws_ecr_repository.lambda_document_upload]
}

locals {
  lambda_image_uri = var.lambda_package_type == "Image" ? (
    var.lambda_image_uri != "" ? var.lambda_image_uri : "${aws_ecr_repository.lambda_document_upload[0].repository_url}:${var.lambda_image_tag}"
  ) : null
}

# ------------------------------------------------------------------------------
# S3 — document storage (encrypted, private, versioned)
# ------------------------------------------------------------------------------
resource "aws_s3_bucket" "documents" {
  bucket = local.bucket_name
}

resource "aws_s3_bucket_versioning" "documents" {
  bucket = aws_s3_bucket.documents.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "documents" {
  bucket = aws_s3_bucket.documents.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "documents" {
  bucket = aws_s3_bucket.documents.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_cors_configuration" "documents" {
  bucket = aws_s3_bucket.documents.id

  cors_rule {
    allowed_methods = ["GET", "PUT", "HEAD"]
    allowed_origins = ["*"]
    allowed_headers = ["*"]
    expose_headers  = ["ETag"]
    max_age_seconds = 3600
  }
}

# ------------------------------------------------------------------------------
# IAM — Lambda execution role (S3 read/write on documents bucket only)
# ------------------------------------------------------------------------------
data "aws_iam_policy_document" "lambda_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "lambda" {
  name               = "${local.name_prefix}-document-upload"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

resource "aws_iam_role_policy_attachment" "lambda_basic" {
  role       = aws_iam_role.lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

data "aws_iam_policy_document" "lambda_s3" {
  statement {
    sid    = "DocumentsBucketAccess"
    effect = "Allow"
    actions = [
      "s3:PutObject",
      "s3:GetObject",
      "s3:DeleteObject",
      "s3:ListBucket",
    ]
    resources = [
      aws_s3_bucket.documents.arn,
      "${aws_s3_bucket.documents.arn}/*",
    ]
  }
}

resource "aws_iam_role_policy" "lambda_s3" {
  name   = "${local.name_prefix}-document-upload-s3"
  role   = aws_iam_role.lambda.id
  policy = data.aws_iam_policy_document.lambda_s3.json
}

# ------------------------------------------------------------------------------
# Lambda — document upload API handler
# ------------------------------------------------------------------------------
resource "aws_lambda_function" "document_upload" {
  function_name = "${local.name_prefix}-document-upload"
  role          = aws_iam_role.lambda.arn
  handler       = var.lambda_package_type == "Zip" ? "index.handler" : null
  runtime       = var.lambda_package_type == "Zip" ? "nodejs20.x" : null
  package_type  = var.lambda_package_type
  timeout       = 30
  memory_size   = 256

  filename  = var.lambda_package_type == "Zip" ? var.lambda_source_dir : null
  source_code_hash = var.lambda_package_type == "Zip" ? filebase64sha256(var.lambda_source_dir) : null

  image_uri = var.lambda_package_type == "Image" ? local.lambda_image_uri : null

  depends_on = null_resource.lambda_docker_build_push

  environment {
    variables = {
      DOCUMENTS_BUCKET_NAME   = aws_s3_bucket.documents.bucket
      MAX_UPLOAD_BYTES        = tostring(var.max_upload_bytes)
      PRESIGN_EXPIRES_SECONDS = tostring(var.presign_expires_seconds)
      ALLOWED_CONTENT_TYPES   = var.allowed_content_types
      UPLOAD_KEY_PREFIX       = "documents/"
    }
  }
}

resource "aws_cloudwatch_log_group" "lambda" {
  name              = "/aws/lambda/${aws_lambda_function.document_upload.function_name}"
  retention_in_days = 14
}

# ------------------------------------------------------------------------------
# API Gateway HTTP API — public HTTP endpoints for upload/list/download
# ------------------------------------------------------------------------------
resource "aws_apigatewayv2_api" "documents" {
  count = var.enable_api_gateway ? 1 : 0

  name          = "${local.name_prefix}-documents"
  protocol_type = "HTTP"

  cors_configuration {
    allow_origins = ["*"]
    allow_methods = ["GET", "POST", "DELETE", "OPTIONS"]
    allow_headers = ["content-type", "authorization"]
    max_age       = 3600
  }
}

resource "aws_apigatewayv2_integration" "lambda" {
  count = var.enable_api_gateway ? 1 : 0

  api_id                 = aws_apigatewayv2_api.documents[0].id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.document_upload.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "presign" {
  count = var.enable_api_gateway ? 1 : 0

  api_id    = aws_apigatewayv2_api.documents[0].id
  route_key = "POST /presign"
  target    = "integrations/${aws_apigatewayv2_integration.lambda[0].id}"
}

resource "aws_apigatewayv2_route" "upload" {
  count = var.enable_api_gateway ? 1 : 0

  api_id    = aws_apigatewayv2_api.documents[0].id
  route_key = "POST /upload"
  target    = "integrations/${aws_apigatewayv2_integration.lambda[0].id}"
}

resource "aws_apigatewayv2_route" "list" {
  count = var.enable_api_gateway ? 1 : 0

  api_id    = aws_apigatewayv2_api.documents[0].id
  route_key = "GET /documents"
  target    = "integrations/${aws_apigatewayv2_integration.lambda[0].id}"
}

resource "aws_apigatewayv2_route" "document_proxy" {
  count = var.enable_api_gateway ? 1 : 0

  api_id    = aws_apigatewayv2_api.documents[0].id
  route_key = "GET /documents/{proxy+}"
  target    = "integrations/${aws_apigatewayv2_integration.lambda[0].id}"
}

resource "aws_apigatewayv2_route" "delete_proxy" {
  count = var.enable_api_gateway ? 1 : 0

  api_id    = aws_apigatewayv2_api.documents[0].id
  route_key = "DELETE /documents/{proxy+}"
  target    = "integrations/${aws_apigatewayv2_integration.lambda[0].id}"
}

resource "aws_apigatewayv2_route" "options_catch" {
  count = var.enable_api_gateway ? 1 : 0

  api_id    = aws_apigatewayv2_api.documents[0].id
  route_key = "OPTIONS /{proxy+}"
  target    = "integrations/${aws_apigatewayv2_integration.lambda[0].id}"
}

resource "aws_apigatewayv2_stage" "default" {
  count = var.enable_api_gateway ? 1 : 0

  api_id      = aws_apigatewayv2_api.documents[0].id
  name        = "$default"
  auto_deploy = true
}

resource "aws_lambda_permission" "api_gateway" {
  count = var.enable_api_gateway ? 1 : 0

  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.document_upload.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.documents[0].execution_arn}/*/*"
}
