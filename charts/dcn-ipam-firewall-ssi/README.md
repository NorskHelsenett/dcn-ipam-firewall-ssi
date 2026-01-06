# IPAM-Firewall-SSI Helm Chart

Network automation sync for IPAM to Firewall systems (FortiOS and VMware NSX).

## Quick Start

```bash
helm install ipam-firewall-ssi-high-prod ./charts/dcn-ipam-firewall-ssi \
  -f charts/dcn-ipam-firewall-ssi/env/prod.yaml \
  --set settings.priority="high" \
  --set credentials.namToken="<api-token-here>" \
  --set credentials.splunkToken="<api-token-here>"
```

## Mandatory Parameters

| Parameter                 | Description                  | Values                  |
| ------------------------- | ---------------------------- | ----------------------- |
| `credentials.namToken`    | NAM API authentication token | String (JWT token)      |
| `credentials.splunkToken` | Splunk HEC token             | String (UUID)           |
| `settings.priority`       | Execution priority           | `low`, `medium`, `high` |

## All Configurable Variables

### Basic Configuration

| Variable       | Description          | Default             |
| -------------- | -------------------- | ------------------- |
| `namespace`    | Target namespace     | `ssi`               |
| `nameOverride` | Override chart name  | `""`                |
| `workspace`    | Workspace identifier | `ipam-firewall-ssi` |

### Monitoring & Alerting

| Variable                 | Description                   | Default | Values/Notes                           |
| ------------------------ | ----------------------------- | ------- | -------------------------------------- |
| `alarmathan.enable`      | Enable Prometheus alerting    | `false` | `true` to deploy PrometheusRule        |
| `alarmathan.cluster`     | Kubernetes cluster identifier | `""`    | String                                 |
| `alarmathan.criticality` | Alert criticality level       | `""`    | String (e.g., `high`, `medium`, `low`) |
| `alarmathan.environment` | Environment label for alerts  | `""`    | String (e.g., `prod`, `qa`, `test`)    |
| `alarmathan.severity`    | Alert severity level          | `""`    | String (e.g., `critical`, `warning`)   |
| `alarmathan.service_id`  | Service identifier for alerts | `""`    | String                                 |
| `alarmathan.team`        | Team responsible for alerts   | `""`    | String                                 |
| `alarmathan.varseltilos` | Alert routing configuration   | `""`    | String                                 |

**Alert Configuration**: When enabled, a PrometheusRule is deployed that
monitors pod restart counts. The alert triggers when a pod restarts 3 or more
times within a 5-minute window, indicating potential crashes or configuration
issues.

### Image Configuration

| Variable           | Description                | Default                                                    |
| ------------------ | -------------------------- | ---------------------------------------------------------- |
| `image.repository` | Container image repository | `ncr.sky.nhn.no/ghcr/norskhelsenett/dcn-ipam-firewall-ssi` |
| `image.tag`        | Image tag                  | `latest`                                                   |
| `image.pullPolicy` | Pull policy                | `Always`                                                   |

### CronJob Configuration

| Variable                     | Description                 | Default        |
| ---------------------------- | --------------------------- | -------------- |
| `schedule`                   | Cron schedule expression    | `*/15 * * * *` |
| `successfulJobsHistoryLimit` | Successful jobs to keep     | `3`            |
| `failedJobsHistoryLimit`     | Failed jobs to keep         | `3`            |
| `allowConcurrent`            | Allow concurrent executions | `false`        |

### Resource Limits

| Variable            | Description    | Default  |
| ------------------- | -------------- | -------- |
| `limits.memory.min` | Memory request | `384Mi`  |
| `limits.memory.max` | Memory limit   | `1152Mi` |
| `limits.cpu.min`    | CPU request    | `300m`   |
| `limits.cpu.max`    | CPU limit      | `600m`   |

### Application Settings

| Variable                  | Description                 | Default      | Values/Notes                                        |
| ------------------------- | --------------------------- | ------------ | --------------------------------------------------- |
| `settings.infrastructure` | Infrastructure environment  | `prod`       | `prod`, `qa`, `dev`                                 |
| `settings.environment`    | Runtime environment         | `production` | `production`, `development`                         |
| `settings.priority`       | SSI priority (mandatory)    | `low`        | `low`, `medium`, `high`                             |
| `settings.interval`       | Sync interval in seconds    | `300`        | Recommended: low=300s, medium=180s, high=60s        |
| `settings.timeout`        | API timeout in milliseconds | `3000`       | Integer                                             |
| `settings.continuousMode` | Execution mode              | `false`      | `false` (one-shot CronJob), `true` (continuous Pod) |

### Integration Settings

| Variable                    | Description                   | Default                     |
| --------------------------- | ----------------------------- | --------------------------- |
| `integration.nam.url`       | NAM API endpoint URL          | `""`                        |
| `integration.nam.test_int`  | Test integrator ID (dev only) | `""`                        |
| `integration.splunk.url`    | Splunk HEC endpoint           | `https://splunk-hec.nhn.no` |
| `integration.splunk.index`  | Splunk index name             | `dc_nam`                    |
| `integration.splunk.source` | Splunk source identifier      | `ipam-firewall-ssi:prod`    |

### Credentials (Mandatory)

| Variable                  | Description              | Default |
| ------------------------- | ------------------------ | ------- |
| `credentials.namToken`    | NAM authentication token | `""`    |
| `credentials.splunkToken` | Splunk HEC token         | `""`    |

## Usage Examples

### Production Deployment (High Priority)

```bash
helm install ipam-firewall-ssi-high-prod ./charts/dcn-ipam-firewall-ssi \
  -f charts/dcn-ipam-firewall-ssi/env/prod.yaml \
  --set settings.priority="high" \
  --set credentials.namToken="<api-token-here>" \
  --set credentials.splunkToken="<api-token-here>"
```

Creates CronJob: `ipam-firewall-ssi-high-prod` in namespace `ssi`

### QA Deployment (Medium Priority)

```bash
helm install ipam-firewall-ssi-medium-qa ./charts/dcn-ipam-firewall-ssi \
  -f charts/dcn-ipam-firewall-ssi/env/qa.yaml \
  --set settings.priority="medium" \
  --set credentials.namToken="<api-token-here>" \
  --set credentials.splunkToken="<api-token-here>"
```

Creates CronJob: `ipam-firewall-ssi-medium-qa` in namespace `ssi`

### Test Deployment (Low Priority)

```bash
helm install ipam-firewall-ssi-low-test ./charts/dcn-ipam-firewall-ssi \
  -f charts/dcn-ipam-firewall-ssi/env/test.yaml \
  --set settings.priority="low" \
  --set credentials.namToken="<api-token-here>" \
  --set credentials.splunkToken="<api-token-here>"
```

Creates CronJob: `ipam-firewall-ssi-low-test` in namespace `ssi`

### Custom Schedule

```bash
helm install ipam-firewall-ssi-medium-prod ./charts/dcn-ipam-firewall-ssi \
  -f charts/dcn-ipam-firewall-ssi/env/prod.yaml \
  --set schedule="0 */2 * * *" \
  --set settings.priority="medium" \
  --set credentials.namToken="<api-token-here>" \
  --set credentials.splunkToken="<api-token-here>"
```

## Environment-Specific Values

Pre-configured environment files are available:

- `env/prod.yaml` - Production settings (schedule: */15 min, resources:
  384-1152Mi/300-600m)
- `env/qa.yaml` - QA settings (schedule: */15 min, resources:
  384-1152Mi/300-600m)
- `env/test.yaml` - Test/Development settings (schedule: */5 min, resources:
  384-1152Mi/300-600m, with test integrator)

## Commands

```bash
# Install
helm install ipam-firewall-ssi-{priority}-{infrastructure} ./charts/dcn-ipam-firewall-ssi \
  -f charts/dcn-ipam-firewall-ssi/env/{infrastructure}.yaml \
  --set settings.priority="{priority}" \
  --set credentials.namToken="<api-token-here>" \
  --set credentials.splunkToken="<api-token-here>"

# Upgrade
helm upgrade ipam-firewall-ssi-{priority}-{infrastructure} ./charts/dcn-ipam-firewall-ssi \
  -f charts/dcn-ipam-firewall-ssi/env/{infrastructure}.yaml \
  --set settings.priority="{priority}"

# Uninstall
helm uninstall ipam-firewall-ssi-{priority}-{infrastructure}

# Template (dry-run)
helm template ipam-firewall-ssi-low-test ./charts/dcn-ipam-firewall-ssi \
  -f charts/dcn-ipam-firewall-ssi/env/test.yaml \
  --set settings.priority="low" \
  --set credentials.namToken="<api-token-here>" \
  --set credentials.splunkToken="<api-token-here>"

# Validate
helm lint ./charts/dcn-ipam-firewall-ssi

# List releases
helm list -A
```

## Argo CD Deployment

See `examples/argo-ipam-firewall-ssi.yaml.example` for a complete Argo CD
Application manifest.

### Example Argo CD Application

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: ipam-firewall-ssi-low-qa #ipam-firewall-ssi-<priority>-<environment>
  namespace: argocd

spec:
  destination:
    namespace: ssi
    server: https://kubernetes.default.svc
  project: default
  source:
    chart: dcn-ipam-firewall-ssi
    helm:
      valueFiles:
        - values.yaml
        - env/qa.yaml #test, qa, prod
      parameters:
        - name: settings.continuousMode
          value: "true" # True for continuous mode (Pod), false for one shot mode (CronJob)
        - name: settings.interval
          value: "300" #Seconds for continuous mode (Pod)
        - name: schedule
          value: "*/5 * * * *" # Used for one shot mode (CronJob)
        - name: settings.priority
          value: "low" # high, medium, low
        - name: credentials.namToken
          value: "<NAM_TOKEN_HERE>"
        - name: credentials.splunkToken
          value: "<SPLUNK_TOKEN_HERE>"
    repoURL: ncr.sky.nhn.no/ghcr/norskhelsenett/helm
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
  --repo ncr.sky.nhn.no/ghcr/norskhelsenett/helm \
  --helm-chart dcn-ipam-firewall-ssi \
  --dest-server https://kubernetes.default.svc \
  --dest-namespace ssi \
  --values env/prod.yaml \
  --helm-set settings.priority=high \
  --helm-set credentials.namToken="<api-token-here>" \
  --helm-set credentials.splunkToken="<api-token-here>" \
  --sync-policy automated \
  --sync-option CreateNamespace=true

# QA - Medium Priority
argocd app create ipam-firewall-ssi-medium-qa \
  --repo ncr.sky.nhn.no/ghcr/norskhelsenett/helm \
  --helm-chart dcn-ipam-firewall-ssi \
  --dest-server https://kubernetes.default.svc \
  --dest-namespace ssi \
  --values env/qa.yaml \
  --helm-set settings.priority=medium \
  --helm-set credentials.namToken="<api-token-here>" \
  --helm-set credentials.splunkToken="<api-token-here>" \
  --sync-policy automated \
  --sync-option CreateNamespace=true

# Test - Low Priority
argocd app create ipam-firewall-ssi-low-test \
  --repo ncr.sky.nhn.no/ghcr/norskhelsenett/helm \
  --helm-chart dcn-ipam-firewall-ssi \
  --dest-server https://kubernetes.default.svc \
  --dest-namespace ssi \
  --values env/test.yaml \
  --helm-set settings.priority=low \
  --helm-set credentials.namToken="<api-token-here>" \
  --helm-set credentials.splunkToken="<api-token-here>" \
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

## Monitoring and Alerting

The chart includes optional Prometheus monitoring capabilities via
PrometheusRule CRD.

### Enabling Alerts

Set `alarmathan.enable: true` in your values to deploy a PrometheusRule that
monitors pod health:

```bash
helm install ipam-firewall-ssi-high-prod ./charts/dcn-ipam-firewall-ssi \
  -f charts/dcn-ipam-firewall-ssi/env/prod.yaml \
  --set settings.priority="high" \
  --set alarmathan.enable=true \
  --set alarmathan.cluster="prod-cluster" \
  --set alarmathan.criticality="high" \
  --set alarmathan.environment="production" \
  --set alarmathan.severity="critical" \
  --set alarmathan.team="network-ops" \
  --set credentials.namToken="<api-token-here>" \
  --set credentials.splunkToken="<api-token-here>"
```

### Alert Behavior

**Alert Name**: `IPAM_FIREWALL_SSI_ALERT`

**Trigger Condition**: Pod restarts 3 or more times within a 5-minute window

**PromQL Expression**:

```promql
sum by (namespace, pod) (
  increase(kube_pod_container_status_restarts_total{
    namespace="ssi",
    pod=~"ipam-firewall-ssi-deployment-{priority}-{infrastructure}-.*"
  }[5m])
) >= 3
```

**Alert Labels**:

- `app`: Application identifier with priority and infrastructure
- `cluster`: Kubernetes cluster name
- `criticality`: Business impact level
- `environment`: Deployment environment
- `severity`: Alert severity (critical, warning, etc.)
- `service_id`: Service tracking identifier
- `team`: Responsible team
- `varseltilos`: Alert routing configuration

**Use Cases**:

- Detect application crashes or restart loops
- Monitor configuration issues causing pod failures
- Track resource exhaustion (OOM kills)
- Alert on unhealthy deployments in production

### Configuration Example

```yaml
alarmathan:
  enable: true
  cluster: "prod-k8s-cluster"
  criticality: "high"
  environment: "production"
  severity: "critical"
  service_id: "ipam-firewall-ssi"
  team: "network-automation"
  varseltilos: "slack-network-ops"
```

### Requirements

- Prometheus Operator installed in cluster
- PrometheusRule CRD available (monitoring.coreos.com/v1)
- Alert manager configured to route alerts based on labels
