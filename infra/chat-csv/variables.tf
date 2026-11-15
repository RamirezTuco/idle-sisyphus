variable "project_id" {
  description = "Existing Firebase-enabled GCP project; this module never creates or links billing."
  type        = string
  default     = "idle-sisyphus"
}

variable "region" {
  description = "Explicit regional location for Cloud Run, Artifact Registry, and the immutable Firestore database location."
  type        = string
  validation {
    condition     = can(regex("^[a-z]+-[a-z]+[0-9]+$", var.region))
    error_message = "Choose an actual GCP region supported by all three services; no location is selected by default."
  }
}

variable "global_daily_limit" {
  description = "Required positive integer daily AI-request cap shared across all users. Not a monetary billing budget."
  type        = number
  validation {
    condition     = var.global_daily_limit > 0 && var.global_daily_limit <= 100000 && floor(var.global_daily_limit) == var.global_daily_limit
    error_message = "Explicitly choose an integer global daily limit between 1 and 100000."
  }
}

variable "daily_limit" {
  description = "Server-authoritative per-user daily AI-request limit."
  type        = number
  default     = 5
  validation {
    condition     = var.daily_limit > 0 && var.daily_limit <= 1000 && floor(var.daily_limit) == var.daily_limit
    error_message = "The daily limit must be an integer between 1 and 1000."
  }
}

variable "model_provider" {
  description = "Vertex uses runtime identity and Cloud Billing; developer uses the stored Gemini API key and may require prepaid credits."
  type        = string
  default     = "vertex"
  validation {
    condition     = contains(["vertex", "developer"], var.model_provider)
    error_message = "Select vertex or developer."
  }
}

variable "enable_runtime" {
  description = "Create the public UI only after approval, Google auth setup, bootstrap image publication, and secret setup if using Developer mode."
  type        = bool
  default     = false
}

variable "seed_image" {
  description = "Bootstrap image from this app repository with immutable sha256 digest; required when enable_runtime is true."
  type        = string
  default     = ""
  validation {
    condition     = !var.enable_runtime || can(regex("^${var.region}-docker\\.pkg\\.dev/${var.project_id}/chat-csv/app@sha256:[a-f0-9]{64}$", var.seed_image))
    error_message = "Enabled runtime requires its own Artifact Registry app image pinned to a real sha256 digest."
  }
}

variable "access_mode" {
  description = "allowlist is the restricted default; authenticated explicitly admits all authenticated users and requires production approval before release."
  type        = string
  default     = "allowlist"
  validation {
    condition     = contains(["allowlist", "authenticated"], var.access_mode)
    error_message = "Use allowlist or explicitly choose authenticated."
  }
}

variable "allowed_uids" {
  description = "Firebase UIDs required before enabling allowlist runtime; no email addresses or credentials."
  type        = list(string)
  default     = []
  validation {
    condition     = alltrue([for uid in var.allowed_uids : length(trimspace(uid)) > 0 && length(uid) <= 128 && !can(regex("[,\\s]", uid))])
    error_message = "UIDs must be nonempty, at most 128 characters, and contain no whitespace or commas."
  }
  validation {
    condition     = !var.enable_runtime || var.access_mode == "authenticated" || length(var.allowed_uids) > 0
    error_message = "Specify allowed_uids before enabling runtime, unless authenticated access is explicitly selected."
  }
}
