# IPAM-Firewall-SSI Helm Chart

Network automation sync for IPAM to Firewall systems (FortiOS and VMware NSX).

## Quick Start

```bash
helm install ipam-firewall-ssi-high-prod ./charts/ipam-firewall-ssi \
  -f charts/ipam-firewall-ssi/env/prod.yaml \
  --set settings.priority="high" \
  --set credentials.namToken="your-nam-token" \
  --set credentials.splunkToken="your-splunk-token"
```

## Mandatory Parameters

| Parameter | Description | Values |
|-----------|-------------|--------|
| `credentials.namToken` | NAM API authentication token | String (JWT token) |
| `credentials.splunkToken` | Splunk HEC token | String (UUID) |
| `settings.priority` | Execution priority | `low`, `medium`, `high` |

## All Configurable Variables

### Basic Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `namespace` | Target namespace | `ipam-firewall-ssi` |
| `nameOverride` | Override chart name | `""` |
| `workspace` | Workspace identifier | `ipam-firewall-ssi` |

### Image Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `image.repository` | Container image repository | `ncr.sky.nhn.no/kevvat-test/ipam-firewall-ssi` |
| `image.tag` | Image tag | `latest` |
| `image.pullPolicy` | Pull policy | `Always` |

### CronJob Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `schedule` | Cron schedule expression | `*/15 * * * *` |
| `successfulJobsHistoryLimit` | Successful jobs to keep | `3` |
| `failedJobsHistoryLimit` | Failed jobs to keep | `3` |
| `allowConcurrent` | Allow concurrent executions | `false` |

### Resource Limits

| Variable | Description | Default |
|----------|-------------|---------|
| `limits.memory.min` | Memory request | `128Mi` |
| `limits.memory.max` | Memory limit | `384Mi` |
| `limits.cpu.min` | CPU request | `100m` |
| `limits.cpu.max` | CPU limit | `300m` |

### Application Settings

| Variable | Description | Default | Values |
|----------|-------------|---------|--------|
| `settings.infrastructure` | Infrastructure environment | `prod` | `prod`, `qa`, `dev` |
| `settings.environment` | Runtime environment | `production` | `production`, `development` |
| `settings.priority` | SSI priority (mandatory) | `low` | `low`, `medium`, `high` |
| `settings.interval` | Sync interval in seconds | `300` | Integer |
| `settings.timeout` | API timeout in milliseconds | `10000` | Integer |
| `settings.continuousMode` | CRON_MODE setting | `false` | `true` (continuous), `false` (one-shot) |

### Integration Settings

| Variable | Description | Default |
|----------|-------------|---------|
| `integration.nam.url` | NAM API endpoint URL | `""` |
| `integration.nam.test_int` | Test integrator ID (dev only) | `""` |
| `integration.splunk.url` | Splunk HEC endpoint | `https://splunk-hec.nhn.no` |
| `integration.splunk.index` | Splunk index name | `dc_nam` |
| `integration.splunk.source` | Splunk source identifier | `ipam-firewall-ssi:prod` |

### Credentials (Mandatory)

| Variable | Description | Default |
|----------|-------------|---------|
| `credentials.namToken` | NAM authentication token | `""` |
| `credentials.splunkToken` | Splunk HEC token | `""` |

## Usage Examples

### Production Deployment (High Priority)

```bash
helm install ipam-firewall-ssi-high-prod ./charts/ipam-firewall-ssi \
  -f charts/ipam-firewall-ssi/env/prod.yaml \
  --set settings.priority="high" \
  --set credentials.namToken="prod-token-here" \
  --set credentials.splunkToken="prod-splunk-token"
```

Creates CronJob: `ipam-firewall-ssi-high-prod` in namespace `ipam-firewall-ssi`

### QA Deployment (Medium Priority)

```bash
helm install ipam-firewall-ssi-medium-qa ./charts/ipam-firewall-ssi \
  -f charts/ipam-firewall-ssi/env/qa.yaml \
  --set settings.priority="medium" \
  --set credentials.namToken="qa-token-here" \
  --set credentials.splunkToken="qa-splunk-token"
```

Creates CronJob: `ipam-firewall-ssi-medium-qa` in namespace `ipam-firewall-ssi`

### Test Deployment (Low Priority)

```bash
helm install ipam-firewall-ssi-low-test ./charts/ipam-firewall-ssi \
  -f charts/ipam-firewall-ssi/env/test.yaml \
  --set settings.priority="low" \
  --set credentials.namToken="test-token-here" \
  --set credentials.splunkToken="test-splunk-token"
```

Creates CronJob: `ipam-firewall-ssi-low-test` in namespace `ipam-firewall-ssi`

### Custom Schedule

```bash
helm install ipam-firewall-ssi-medium-prod ./charts/ipam-firewall-ssi \
  -f charts/ipam-firewall-ssi/env/prod.yaml \
  --set schedule="0 */2 * * *" \
  --set settings.priority="medium" \
  --set credentials.namToken="token" \
  --set credentials.splunkToken="splunk-token"
```

## Environment-Specific Values

Pre-configured environment files are available:

- `env/prod.yaml` - Production settings (schedule: */15 min, resources: 256-512Mi/200-500m)
- `env/qa.yaml` - QA settings (schedule: */15 min, resources: 128-256Mi/150-300m)
- `env/test.yaml` - Test/Development settings (schedule: */5 min, resources: 128-256Mi/150-300m, with test integrator)

## Commands

```bash
# Install
helm install ipam-firewall-ssi-{priority}-{infrastructure} ./charts/ipam-firewall-ssi \
  -f charts/ipam-firewall-ssi/env/{infrastructure}.yaml \
  --set settings.priority="{priority}" \
  --set credentials.namToken="token" \
  --set credentials.splunkToken="splunk-token"

# Upgrade
helm upgrade ipam-firewall-ssi-{priority}-{infrastructure} ./charts/ipam-firewall-ssi \
  -f charts/ipam-firewall-ssi/env/{infrastructure}.yaml \
  --set settings.priority="{priority}"

# Uninstall
helm uninstall ipam-firewall-ssi-{priority}-{infrastructure}

# Template (dry-run)
helm template ipam-firewall-ssi-low-test ./charts/ipam-firewall-ssi \
  -f charts/ipam-firewall-ssi/env/test.yaml \
  --set settings.priority="low" \
  --set credentials.namToken="test" \
  --set credentials.splunkToken="test"

# Validate
helm lint ./charts/ipam-firewall-ssi

# List releases
helm list -A
```

## Argo CD Deployment

See `examples/argo-ipam-firewall-ssi.yaml.example` for a complete Argo CD Application manifest.

### Example Argo CD Application

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: ipam-firewall-ssi-high-prod
  namespace: argocd
spec:
  destination:
    namespace: ssi
    server: https://kubernetes.default.svc
  project: default
  source:
    chart: ipam-firewall-ssi
    helm:
      valueFiles:
      - values.yaml
      - env/prod.yaml
      parameters:
        - name: schedule
          value: "*/30 * * * *" 
        - name: settings.priority
          value: "high"
        - name: credentials.namToken
          value: "<your-nam-token-here>"
        - name: credentials.splunkToken
          value: "<your-splunk-token-here>" 
    repoURL: ncr.sky.nhn.no/kevvat-test-helm
    targetRevision: "*"
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
    - CreateNamespace=true
```

### Deploy with Argo CD CLI

```bash
# Production - High Priority
argocd app create ipam-firewall-ssi-high-prod \
  --repo ncr.sky.nhn.no/kevvat-test-helm \
  --helm-chart ipam-firewall-ssi \
  --dest-server https://kubernetes.default.svc \
  --dest-namespace ssi \
  --values env/prod.yaml \
  --helm-set settings.priority=high \
  --helm-set credentials.namToken="your-token" \
  --helm-set credentials.splunkToken="your-splunk-token" \
  --sync-policy automated \
  --sync-option CreateNamespace=true

# QA - Medium Priority
argocd app create ipam-firewall-ssi-medium-qa \
  --repo ncr.sky.nhn.no/kevvat-test-helm \
  --helm-chart ipam-firewall-ssi \
  --dest-server https://kubernetes.default.svc \
  --dest-namespace ssi \
  --values env/qa.yaml \
  --helm-set settings.priority=medium \
  --helm-set credentials.namToken="your-token" \
  --helm-set credentials.splunkToken="your-splunk-token" \
  --sync-policy automated \
  --sync-option CreateNamespace=true

# Test - Low Priority
argocd app create ipam-firewall-ssi-low-test \
  --repo ncr.sky.nhn.no/kevvat-test-helm \
  --helm-chart ipam-firewall-ssi \
  --dest-server https://kubernetes.default.svc \
  --dest-namespace ssi \
  --values env/test.yaml \
  --helm-set settings.priority=low \
  --helm-set credentials.namToken="your-token" \
  --helm-set credentials.splunkToken="your-splunk-token" \
  --sync-policy automated \
  --sync-option CreateNamespace=true
```

## Notes

- `continuousMode=false` creates one-shot CronJob execution (default)
- `continuousMode=true` enables continuous mode (not recommended for CronJobs)
- Priority affects resource allocation and Splunk source type
- CronJob naming pattern: `ipam-firewall-ssi-{priority}-{infrastructure}`
- ConfigMap naming pattern: `ipam-firewall-ssi-{infrastructure}-config`
- Secret naming pattern: `ipam-firewall-ssi-{infrastructure}-secrets`
- Security context runs as non-root user (UID/GID 1993)
- Read-only root filesystem with writable logs volume
