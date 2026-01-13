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
