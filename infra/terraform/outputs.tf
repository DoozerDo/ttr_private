output "droplet_ipv4" {
  description = "Public IPv4 for the application droplet."
  value       = digitalocean_droplet.app.ipv4_address
}

output "postgres_host" {
  description = "Managed PostgreSQL host."
  value       = digitalocean_database_cluster.postgres.host
}

output "postgres_port" {
  description = "Managed PostgreSQL port."
  value       = digitalocean_database_cluster.postgres.port
}
