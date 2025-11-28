# Deployment Guide

This guide covers all deployment methods for IPAM-Firewall-SSI including Helm,
Docker, and Kubernetes.

## Deployment Methods

### Helm Chart (Recommended)

The recommended deployment method is using the Helm chart with Argo CD or
standard Helm.

**Quick Start:**

```bash
# Install using Helm
helm install ipam-firewall-ssi-high-prod ./charts/dcn-ipam-firewall-ssi \
  -f charts/dcn-ipam-firewall-ssi/env/prod.yaml \
  --set settings.priority="high" \
  --set credentials.namToken="your-nam-token" \
  --set credentials.splunkToken="your-splunk-token"
```

**Features:**

- Environment-specific configurations (prod, qa, test)
- CronJob-based deployment with configurable schedules
- Automatic resource management based on priority
- Argo CD compatible with automated sync
- See `charts/dcn-ipam-firewall-ssi/README.md` for complete documentation

**Argo CD Deployment:**

```bash
# Apply Argo CD Application manifest
kubectl apply -f examples/argo-ipam-firewall-ssi.yaml.example
```

For detailed Helm chart usage, configuration options, and examples, see:

- **Helm Chart README**: `charts/dcn-ipam-firewall-ssi/README.md`
- **Argo CD Example**: `examples/argo-ipam-firewall-ssi.yaml.example`

### Docker

Build and run using Docker:

```bash
# Copy example files and configure
cp examples/config.yaml.example config/config.yaml
cp examples/secrets.yaml.example secrets/secrets.yaml
# Edit config/config.yaml and secrets/secrets.yaml with your values

# Build the image
docker build -t ipam-firewall-ssi:latest .

# Prepare configuration files with correct permissions
mkdir -p config secrets
chmod 755 config secrets
chmod 644 config/config.yaml secrets/secrets.yaml

# Set ownership for deno user (UID:GID 1993:1993) if needed
sudo chown 1993:1993 config/config.yaml secrets/secrets.yaml

# Run with docker-compose
docker-compose up -d

# Run manually with custom config/secrets and volumes
docker run -d \
  --name ipam-firewall-ssi \
  --user 1993:1993 \
  -v $(pwd)/config/config.yaml:/app/config/config.yaml:ro \
  -v $(pwd)/secrets/secrets.yaml:/app/secrets/secrets.yaml:ro \
  ipam-firewall-ssi:latest
```

**Important: File Permissions**

The container runs as user `deno` (UID:GID 1993:1993) for security. Ensure
proper permissions:

```bash
# Required permissions for mounted volumes:
# - config.yaml: Must be readable by UID 1993 (644 or 444)
# - secrets.yaml: Must be readable by UID 1993 (644 or 400 recommended)

# Set ownership to deno user (recommended)
sudo chown 1993:1993 config/config.yaml secrets/secrets.yaml

# Or make readable by all (less secure for secrets)
chmod 644 config/config.yaml
chmod 644 secrets/secrets.yaml  # or 400 for more security
```

**Docker Compose Configuration:**

The `docker-compose.yml` includes:

- User specification: `user: "1993:1993"`
- Volume mounts:
  - `./config/config.yaml:/app/config/config.yaml:ro` - Config (read-only)
  - `./secrets/secrets.yaml:/app/secrets/secrets.yaml:ro` - Secrets (read-only)
- Environment variables for config paths

**Note:** Logs are written inside the container and not persisted to host. Use
`docker logs` to view output.

**Dockerfile Features:**

- Based on official Deno image
- Runs tests during build to validate configuration
- Includes NHN internal CA chain for SSL verification
- Runs as non-root user (deno:1993)
- Cleans up secrets after build for security
- Configurable paths via `CONFIG_PATH` and `SECRETS_PATH` environment variables

### Kubernetes (Basic Manifests)

For simple deployments without Helm, basic Kubernetes manifests are available:

```bash
# Create namespace
kubectl create namespace ssi

# Apply configuration
kubectl apply -f kubernetes/configmap.yaml
kubectl apply -f kubernetes/secret.yaml
kubectl apply -f kubernetes/ipam-firewall-ssi.yaml

# Check status
kubectl get pods -n ssi
kubectl logs -n ssi ipam-firewall-ssi

# Update configuration
kubectl edit configmap ipam-firewall-ssi-config -n ssi
kubectl delete pod ipam-firewall-ssi -n ssi  # Restart pod
```

**Note:** For production deployments, use the Helm chart instead for better
configuration management and multi-environment support.

**Deployment Options:**

1. **CronJob** (default): Set `CRON_MODE: "false"` or omit it in ConfigMap,
   deploy as a Kubernetes CronJob for scheduled one-shot executions
2. **Long-running Pod**: Set `CRON_MODE: "true"` in ConfigMap for continuous
   execution with interval-based scheduling

**Kubernetes Resources:**

- **ConfigMap** (`configmap.yaml`): Non-sensitive configuration
- **Secret** (`secret.yaml`): Sensitive credentials (NAM_TOKEN, SPLUNK_TOKEN)
- **Pod** (`ipam-firewall-ssi.yaml`): Main application deployment

**Security Features:**

- Read-only root filesystem
- Runs as non-root user (1993:1993)
- No privilege escalation
- Minimal capabilities (all dropped)
- Runtime security profile enabled
- Resource limits enforced (128-384Mi memory, 100-300m CPU)
- EmptyDir volume for logs (50Mi limit) - logs stored in container, not
  persisted

### Configuration Paths

The application looks for configuration files at:

- **Default Local**: `./config/config.yaml` and `./secrets/secrets.yaml`
- **Docker/Kubernetes**:
  - Config: `/app/config/config.yaml` (via `CONFIG_PATH` env var)
  - Secrets: `/app/secrets/secrets.yaml` (via `SECRETS_PATH` env var)

**Quick Start:**

```bash
# Copy example templates
cp examples/config.yaml.example config/config.yaml
cp examples/secrets.yaml.example secrets/secrets.yaml

# Edit with your actual values
nano config/config.yaml
nano secrets/secrets.yaml
```

Set custom paths using environment variables:

```bash
export CONFIG_PATH="/custom/path/config.yaml"
export SECRETS_PATH="/custom/path/secrets.yaml"
```

## Troubleshooting

### Permission Denied Errors

If you encounter permission errors when running with Docker:

```bash
# Error: Cannot read config.yaml or secrets.yaml
# Solution: Ensure files are readable
chmod 644 config/config.yaml secrets/secrets.yaml
# OR set ownership
sudo chown 1993:1993 config/config.yaml secrets/secrets.yaml

# Verify permissions
ls -la config/ secrets/
# Expected output:
# -rw-r--r-- 1 1993 1993 ... config.yaml
# -rw-r--r-- 1 1993 1993 ... secrets.yaml

# Check container user
docker exec ipam-firewall-ssi id
# Should output: uid=1993(deno) gid=1993(deno)

# View logs (logs are stored inside container)
docker logs ipam-firewall-ssi
docker logs -f ipam-firewall-ssi  # Follow logs in real-time
```

### Docker Volume Issues

```bash
# If volumes aren't mounting correctly:
# 1. Check absolute paths
docker inspect ipam-firewall-ssi | grep -A 10 Mounts

# 2. Verify files exist before starting container
ls -la config/config.yaml secrets/secrets.yaml

# 3. Remove and recreate container
docker-compose down
docker-compose up -d

# 4. Check logs for specific errors
docker logs ipam-firewall-ssi
```

### Kubernetes Permission Issues

```bash
# Logs show permission errors:
# - Verify securityContext in ipam-firewall-ssi.yaml
# - Ensure ConfigMap and Secret are properly mounted
kubectl describe pod ipam-firewall-ssi -n ssi
kubectl logs ipam-firewall-ssi -n ssi
```

## Best Practices

### Production Deployments

1. **Use Helm Chart**: Provides better configuration management and
   multi-environment support
2. **Use Secrets Management**: Store tokens in Kubernetes Secrets or external
   secret managers
3. **Set Resource Limits**: Configure appropriate CPU and memory limits based on
   workload
4. **Enable Monitoring**: Use Splunk HEC or other logging solutions
5. **Use CronJob Mode**: For scheduled executions (recommended for production)

### Security Recommendations

1. **Non-root User**: Always run as UID 1993 (deno user)
2. **Read-only Filesystem**: Enable read-only root filesystem
3. **Drop Capabilities**: Remove all unnecessary Linux capabilities
4. **Secret Permissions**: Set secrets.yaml to 400 or 600 permissions
5. **Network Policies**: Implement Kubernetes network policies to restrict
   traffic

### High Availability

For high availability deployments:

1. Use multiple CronJob schedules with different priorities
2. Implement health checks and monitoring
3. Configure appropriate retry mechanisms
4. Use distributed logging (Splunk HEC)

## License

Copyright 2025 Norsk Helsenett SF

Licensed under the Apache License, Version 2.0. See LICENSE file for details.
