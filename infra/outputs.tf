output "GCP_PROJECT_ID" {
  description = "GitHub Actions repository variable GCP_PROJECT_ID."
  value       = var.project_id
}

output "WIF_PROVIDER" {
  description = "GitHub Actions repository variable WIF_PROVIDER."
  value       = google_iam_workload_identity_pool_provider.github.name
}

output "DEPLOY_SERVICE_ACCOUNT" {
  description = "GitHub Actions repository variable DEPLOY_SERVICE_ACCOUNT."
  value       = google_service_account.deploy.email
}

output "SITE_URL" {
  description = "Default Firebase Hosting URL (available after the first content deployment)."
  value       = google_firebase_hosting_site.this.default_url
}
