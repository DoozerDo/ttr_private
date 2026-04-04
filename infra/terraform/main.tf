provider "digitalocean" {
  token = var.do_token
}

resource "digitalocean_database_cluster" "postgres" {
  name       = var.db_cluster_name
  engine     = "pg"
  version    = var.db_version
  size       = var.db_size
  region     = var.region
  node_count = 1
  lifecycle {
    prevent_destroy = true
  }
}

resource "digitalocean_database_db" "app" {
  cluster_id = digitalocean_database_cluster.postgres.id
  name       = var.db_name
}

resource "digitalocean_database_user" "api_user" {
  cluster_id = digitalocean_database_cluster.postgres.id
  name       = var.db_user_name
}

resource "digitalocean_droplet" "app" {
  name       = var.droplet_name
  region     = var.region
  size       = var.droplet_size
  image      = "ubuntu-22-04-x64"
  tags       = ["targetthisrole", "dev"]
  monitoring = true

  ssh_keys  = var.ssh_key_fingerprints
  user_data = file("${path.module}/cloud-init.yaml")
}

resource "digitalocean_reserved_ip_assignment" "app_ip" {
  ip_address = var.reserved_ip
  droplet_id = digitalocean_droplet.app.id
}

resource "digitalocean_database_firewall" "postgres" {
  cluster_id = digitalocean_database_cluster.postgres.id

  rule {
    type  = "droplet"
    value = digitalocean_droplet.app.id
  }
}

resource "digitalocean_firewall" "app" {
  name = "${var.droplet_name}-fw"

  droplet_ids = [digitalocean_droplet.app.id]

  inbound_rule {
    protocol         = "tcp"
    port_range       = "22"
    source_addresses = var.allowed_ssh_cidrs
  }

  inbound_rule {
    protocol         = "tcp"
    port_range       = "80"
    source_addresses = ["0.0.0.0/0", "::/0"]
  }

  inbound_rule {
    protocol         = "tcp"
    port_range       = "443"
    source_addresses = ["0.0.0.0/0", "::/0"]
  }

  outbound_rule {
    protocol              = "tcp"
    port_range            = "1-65535"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }

  outbound_rule {
    protocol              = "udp"
    port_range            = "1-65535"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }

  outbound_rule {
    protocol              = "icmp"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }
}

resource "null_resource" "app_bootstrap" {
  depends_on = [
    digitalocean_droplet.app,
    digitalocean_reserved_ip_assignment.app_ip
  ]

  # Re-run if these inputs change
  triggers = {
    droplet_id    = digitalocean_droplet.app.id
    app_domain    = var.app_domain
    caddy_email   = var.caddy_email
    postgres_host = digitalocean_database_cluster.postgres.host
    postgres_port = tostring(digitalocean_database_cluster.postgres.port)
  }

  connection {
    type        = "ssh"
    user        = "root"
    host        = var.reserved_ip
    private_key = file(var.ssh_private_key_path)
  }

  provisioner "file" {
    source      = "${path.root}/../docker/docker-compose.dev.yml"
    destination = "/opt/targetthisrole/docker-compose.yml"
  }

  provisioner "file" {
    content = templatefile("${path.module}/app.env.tftpl", {
      app_domain    = var.app_domain
      caddy_email   = var.caddy_email
      postgres_host = digitalocean_database_cluster.postgres.host
      postgres_port = digitalocean_database_cluster.postgres.port
      db_password   = var.db_password
    })
    destination = "/opt/targetthisrole/.env"
  }

  provisioner "remote-exec" {
    inline = [
      "cd /opt/targetthisrole",
      "docker login ghcr.io -u ${var.ghcr_username} -p ${var.ghcr_token}",
      "docker compose --env-file .env -f docker-compose.yml pull",
      "docker compose --env-file .env -f docker-compose.yml up -d",
      "docker ps"
    ]
  }
}
