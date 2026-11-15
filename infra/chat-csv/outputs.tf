output "image_base" {
  value = local.image_base
}

output "region" {
  value = var.region
}

output "wif_provider" {
  value = google_iam_workload_identity_pool_provider.app.name
}

output "deploy_service_account" {
  value = google_service_account.deploy.email
}

output "runtime_service_account" {
  value = google_service_account.runtime.email
}

output "firestore_database_id" {
  value = google_firestore_database.app.name
}

output "gemini_secret_id" {
  value = google_secret_manager_secret.gemini.secret_id
}

output "firebase_public_config" {
  description = "Public web SDK build configuration, not Gemini credentials."
  value = {
    NEXT_PUBLIC_FIREBASE_API_KEY     = data.google_firebase_web_app_config.app.api_key
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN = data.google_firebase_web_app_config.app.auth_domain
    NEXT_PUBLIC_FIREBASE_PROJECT_ID  = var.project_id
    NEXT_PUBLIC_FIREBASE_APP_ID      = google_firebase_web_app.app.app_id
  }
}

output "service_url" {
  value = try(google_cloud_run_v2_service.app[0].uri, null)
}
