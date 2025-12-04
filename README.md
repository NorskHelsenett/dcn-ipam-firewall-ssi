# IPAM-Firewall-SSI

Synchronization service that manages IP address objects between Netbox IPAM and
firewall systems (FortiOS and VMware NSX).

## Overview

IPAM-Firewall-SSI automatically syncs IP prefixes from Netbox to firewall
address objects and groups:

- **FortiOS**: Creates IPv4/IPv6 addresses and address groups on specified VDOMs
- **VMware NSX**: Creates and updates security groups with IP address
  expressions
- **Automated sync**: Runs on configurable intervals with priority-based
  execution
- **Flexible execution**: One-shot mode for CronJobs or continuous mode for
  long-running containers

## Requirements

- Deno runtime
- Access to NAM (Network Architecture Management) API
- Netbox IPAM instance
- FortiOS firewall(s) with API access
- VMware NSX instance(s) with API access (optional)
- Splunk HEC endpoint (optional, for logging)

## Installation

```bash
# Clone the repository
git clone <repository-url>
cd dcn-ipam-firewall-ssi

# Copy example configuration files
cp examples/config.yaml.example config/config.yaml
cp examples/secrets.yaml.example secrets/secrets.yaml

# Edit configuration files with your actual values
# config/config.yaml - Update NAM_URL, SPLUNK_URL, etc.
# secrets/secrets.yaml - Add your NAM_TOKEN and SPLUNK_TOKEN

# Install dependencies (handled by Deno automatically)
deno cache main.ts
```

### Certificate Configuration

For production use with your own infrastructure, replace the CA certificate
bundle:

```bash
# Replace ca_chain.crt with your organization's CA certificates
# This file is used for SSL/TLS certificate verification
cp /path/to/your/ca-bundle.crt ./ca_chain.crt
```

**Note:** The included `ca_chain.crt` contains certificate authority chain from
Norsk Helsenett SF. For production environments, replace this file with your
organization's CA certificate bundle to ensure proper SSL/TLS verification.

## Configuration

Example configuration files are provided in the `examples/` folder. Copy and
customize them:

```bash
cp examples/config.yaml.example config/config.yaml
cp examples/secrets.yaml.example secrets/secrets.yaml
```

### config.yaml

Configuration file for non-sensitive settings:

```yaml
---
# Environment and SSI settings
DENO_ENV: "production" # Runtime environment: development, production
CRON_MODE: "false" # Execution mode: "false" or undefined = one-shot (CronJob), "true" = continuous (Pod)
SSI_NAME: "IPAM-Firewall-SSI" # Service name
SSI_PRIORITY: "high" # Execution priority: low, medium, high
SSI_INTERVAL: "300" # Sync interval in seconds (used in continuous mode)
REQUEST_TIMEOUT: "10000" # API request timeout in milliseconds

# NAM (Network Automation Manager) settings
NAM_URL: "https://nam.example.com/api" # NAM API endpoint URL
NAM_TEST_INT: "507f1f77bcf86cd799439011" # Netbox integrator ID for testing (dev only)

# Splunk logging settings
SPLUNK_URL: "https://splunk.example.com" # Splunk HEC endpoint
SPLUNK_INDEX: "network_automation" # Target Splunk index
SPLUNK_SOURCE: "ipam-firewall-ssi" # Log source identifier
SPLUNK_SOURCE_TYPE: "ipam-firewall-ssi:high" # Source type with priority
```

### secrets.yaml

Sensitive credentials (keep secure):

```yaml
---
NAM_TOKEN: "<api-token-here>"
SPLUNK_TOKEN: "<api-token-here>"
```

## Usage

### Run the service

```bash
# Development mode (with auto-reload on file changes)
deno task dev

# Production mode (recommended - uses certificate verification)
deno task run

# One-shot mode (runs once and exits - for CronJobs, default if CRON_MODE not set)
export CRON_MODE="false"
deno task run

# Or simply omit CRON_MODE for one-shot mode
deno task run

# Continuous mode (runs with interval scheduling)
export CRON_MODE="true"
deno task run

# Specify custom config paths
export CONFIG_PATH="/path/to/config.yaml"
export SECRETS_PATH="/path/to/secrets.yaml"
deno task dev   # for development
deno task run   # for production

# LAST RESORT: Production without certificate verification
# Only use when CA certificates are unavailable
deno task unsafe
```

**⚠️ Important:** `deno task unsafe` disables SSL certificate verification and
should **only** be used as a last resort in production environments where CA
certificates are unavailable. Always prefer `deno task run` with proper
certificate configuration.

### Execution Modes

- **One-shot mode** (default, `CRON_MODE="false"` or undefined): Executes sync
  once and exits with code 0 on success or 1 on error. Ideal for Kubernetes
  CronJobs.
- **Continuous mode** (`CRON_MODE="true"`): Runs continuously with
  interval-based scheduling. Ideal for long-running Pods.

### Run tests

```bash
deno task test
```

## How It Works

1. **Initialization**: Worker reads configuration and connects to NAM API
2. **Fetch Integrators**: Retrieves Netbox integrators based on priority
3. **Get Prefixes**: Queries Netbox IPAM for IP prefixes using integrator
   queries
4. **Deploy to FortiOS**:
   - Creates missing IPv4/IPv6 address objects
   - Updates address groups with new/removed members
   - Deploys to specified VDOMs on each firewall
5. **Deploy to NSX**:
   - Creates or updates security groups
   - Manages IP address expressions
6. **Repeat**: Runs continuously at configured interval

## Priority Levels

- **low**: Syncs less frequently, lower priority integrators (recommended
  interval: 300 seconds)
- **medium**: Standard sync priority (recommended interval: 180 seconds)
- **high**: Critical integrators, syncs more frequently (recommended interval:
  60 seconds)

**Note:** The intervals shown are recommended defaults. Set `SSI_INTERVAL` in
your configuration to customize the sync interval for your specific deployment
needs.

## Logging

Logs are written to multiple destinations based on configuration:

**Default Logging (All Environments):**

- **Console**: Real-time output (stdout/stderr)
- **Splunk HEC**: Real-time forwarding to Splunk (if `SPLUNK_URL` and
  `SPLUNK_TOKEN` configured)

**Optional File Logging:**

File logging can be enabled by explicitly calling `addFileLoggers()` in the
code. When enabled, creates daily rotating logs in `logs/` directory:

- `combined.log`: All log levels
- `warn.log`: Warnings and above
- `error.log`: Errors only
- `debug.log`: Debug information only

**Optional Splunk File Logging (Development Only):**

Splunk-formatted file logging can be enabled by calling `addSplunkFileLogger()`
in development mode:

- `splunk.log`: Splunk HEC JSON format (for testing Splunk ingestion locally)

**Note:** File logging is disabled by default to avoid container filesystem
issues. In Docker/Kubernetes, use `docker logs` or `kubectl logs` to view
output.

**Log Configuration:**

```yaml
# Optional environment variables for file logging (development only)
FILELOG_DIR: "logs" # Log directory path
FILELOG_SIZE: "50m" # Max size per log file (50 megabytes)
FILELOG_DAYS: "30d" # Retention period (30 days)
```

## License

Copyright 2025 Norsk Helsenett SF

Licensed under the Apache License, Version 2.0 (the "License"); you may not use
this file except in compliance with the License. You may obtain a copy of the
License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed
under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR
CONDITIONS OF ANY KIND, either express or implied. See the License for the
specific language governing permissions and limitations under the License.

## Documentation

- **Deployment Guide**: See [DEPLOYMENT.md](DEPLOYMENT.md) for deployment
  instructions (Helm, Docker, Kubernetes)
- **Development Guide**: See [DEVELOPMENT.md](DEVELOPMENT.md) for development
  setup, project structure, and contributing guidelines
- **Helm Chart**: See
  [charts/dcn-ipam-firewall-ssi/README.md](charts/dcn-ipam-firewall-ssi/README.md)
  for Helm chart documentation

## Support

For issues, bug reports, and feature requests:

- **GitHub Issues**:
  [NorskHelsenett/dcn-ipam-firewall-ssi/issues](https://github.com/NorskHelsenett/dcn-ipam-firewall-ssi/issues)
- **Website**: [https://www.nhn.no](https://www.nhn.no)
