variable "project_id" {
  description = "Existing Google Cloud project ID; this configuration never creates projects or billing accounts."
  type        = string

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{4,28}[a-z0-9]$", var.project_id))
    error_message = "Use an existing, 6-30 character Google Cloud project ID."
  }
}

variable "github_repository" {
  description = "Exact, case-sensitive GitHub owner/repository allowed to deploy."
  type        = string

  validation {
    condition     = can(regex("^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$", var.github_repository))
    error_message = "Use owner/repository without a URL or trailing slash."
  }
}

variable "github_branch" {
  description = "Trusted deployment branch. Set the GitHub DEPLOY_BRANCH variable to the same value if not main."
  type        = string
  default     = "main"

  validation {
    condition     = can(regex("^[A-Za-z0-9][A-Za-z0-9._/-]*$", var.github_branch))
    error_message = "Use a branch name containing only letters, numbers, dots, underscores, slashes, and hyphens."
  }
}
