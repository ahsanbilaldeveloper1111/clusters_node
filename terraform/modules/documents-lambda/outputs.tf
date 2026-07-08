output "lambda_ecr_repository_url" {
  value = var.lambda_package_type == "Image" ? aws_ecr_repository.lambda_document_upload[0].repository_url : null
}

output "lambda_image_uri" {
  value = local.lambda_image_uri
}

output "bucket_name" {
  value = aws_s3_bucket.documents.bucket
}

output "bucket_arn" {
  value = aws_s3_bucket.documents.arn
}

output "lambda_function_name" {
  value = aws_lambda_function.document_upload.function_name
}

output "lambda_function_arn" {
  value = aws_lambda_function.document_upload.arn
}

output "api_gateway_url" {
  value = var.enable_api_gateway ? aws_apigatewayv2_api.documents[0].api_endpoint : null
}

output "presign_endpoint" {
  value = var.enable_api_gateway ? "${aws_apigatewayv2_api.documents[0].api_endpoint}/presign" : null
}

output "upload_endpoint" {
  value = var.enable_api_gateway ? "${aws_apigatewayv2_api.documents[0].api_endpoint}/upload" : null
}

output "list_endpoint" {
  value = var.enable_api_gateway ? "${aws_apigatewayv2_api.documents[0].api_endpoint}/documents" : null
}
