variable "do_token" {
  description = "DigitalOcean API token."
  type        = string
  sensitive   = true
}

variable "region" {
  description = "DigitalOcean region for resources."
  type        = string
  default     = "nyc3"
}

variable "droplet_name" {
  description = "Name for the application droplet."
  type        = string
  default     = "targetthisrole-dev"
}

variable "droplet_size" {
  description = "Droplet size slug."
  type        = string
  default     = "s-1vcpu-1gb"
}

variable "ssh_key_fingerprints" {
  description = "SSH key fingerprints allowed to access the droplet."
  type        = list(string)
}

variable "allowed_ssh_cidrs" {
  description = "CIDR blocks allowed to access SSH."
  type        = list(string)
}


variable "db_cluster_name" {
  description = "Name for the DigitalOcean PostgreSQL cluster."
  type        = string
  default     = "targetthisrole-dev-db"
}

variable "db_name" {
  description = "Database name for the API."
  type        = string
  default     = "targetthisrole"
}

variable "db_user_name" {
  description = "Database user name for the API."
  type        = string
  default     = "targetthisrole_api"
}

variable "db_size" {
  description = "Database size slug."
  type        = string
  default     = "db-s-1vcpu-1gb"
}

variable "db_version" {
  description = "PostgreSQL major version."
  type        = string
  default     = "15"
}

variable "reserved_ip" {
  type        = string
  description = "Reserved IPv4 address to assign to the droplet"
}

variable "app_domain" {
  description = "Public domain for the app (e.g. app.dev.targetthisrole.ai)"
  type        = string
}

variable "caddy_email" {
  description = "Email used by Caddy/Let's Encrypt"
  type        = string
}

variable "ghcr_username" {
  description = "GHCR username for docker login"
  type        = string
}

variable "ghcr_token" {
  description = "GHCR token (PAT) for docker login"
  type        = string
  sensitive   = true
}

variable "git_sha" {
  description = "Commit SHA for the deployed web bundle."
  type        = string

  validation {
    condition     = trimspace(var.git_sha) != "" && lower(trimspace(var.git_sha)) != "unknown"
    error_message = "git_sha is required and must not be unknown."
  }
}

variable "ssh_private_key_path" {
  description = "Path to private key used by Terraform provisioners (local machine path)"
  type        = string
}

variable "db_password" {
  description = "DigitalOcean managed Postgres password for user doadmin"
  type        = string
  sensitive   = true
}
