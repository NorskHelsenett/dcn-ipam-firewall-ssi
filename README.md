# IPAM-Firewall-SSI

Synchronization service that manages IP address objects between Netbox IPAM and firewall systems (FortiOS and VMware NSX).

## Overview

IPAM-Firewall-SSI automatically syncs IP prefixes from Netbox to firewall address objects and groups:
- **FortiOS**: Creates IPv4/IPv6 addresses and address groups on specified VDOMs
- **VMware NSX**: Creates and updates security groups with IP address expressions
- **Automated sync**: Runs on configurable intervals with priority-based execution
- **Flexible execution**: One-shot mode for CronJobs or continuous mode for long-running containers

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

## Configuration

Example configuration files are provided in the `examples/` folder. Copy and customize them:

```bash
cp examples/config.yaml.example config/config.yaml
cp examples/secrets.yaml.example secrets/secrets.yaml
```

### config.yaml

Configuration file for non-sensitive settings:

```yaml
---
# Environment and SSI settings
DENO_ENV: "production"                     # Runtime environment: development, production
CRON_MODE: "false"                         # Execution mode: "false" or undefined = one-shot (CronJob), "true" = continuous (Pod)
SSI_NAME: "IPAM-Firewall-SSI"              # Service name
SSI_PRIORITY: "high"                       # Execution priority: low, medium, high
SSI_INTERVAL: "300"                        # Sync interval in seconds (used in continuous mode)
REQUEST_TIMEOUT: "10000"                   # API request timeout in milliseconds

# NAM (Network Automation Manager) settings
NAM_URL: "https://nam.example.com/api"     # NAM API endpoint URL
NAM_TEST_INT: "507f1f77bcf86cd799439011"   # Netbox integrator ID for testing (dev only)

# Splunk logging settings
SPLUNK_URL: "https://splunk.example.com"   # Splunk HEC endpoint
SPLUNK_INDEX: "network_automation"         # Target Splunk index
SPLUNK_SOURCE: "ipam-firewall-ssi"         # Log source identifier
SPLUNK_SOURCE_TYPE: "ipam-firewall-ssi:high" # Source type with priority
```

### secrets.yaml

Sensitive credentials (keep secure):

```yaml
---
NAM_TOKEN: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIxMjM0NTY3ODkwIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c"
SPLUNK_TOKEN: "12345678-1234-1234-1234-123456789abc"
```

### Environment Variables

You can also set configuration via environment variables:

```bash
export DENO_ENV="production"
export CRON_MODE="false"
export SSI_NAME="IPAM-Firewall-SSI"
export SSI_PRIORITY="high"
export SSI_INTERVAL="300"
export REQUEST_TIMEOUT="10000"
export NAM_URL="https://nam.example.com/api"
export NAM_TOKEN="your-jwt-token-here"
export SPLUNK_URL="https://splunk.example.com"
export SPLUNK_TOKEN="your-splunk-hec-token"
export SPLUNK_INDEX="network_automation"
export SPLUNK_SOURCE="ipam-firewall-ssi"
export SPLUNK_SOURCE_TYPE="ipam-firewall-ssi:high"
```

## Usage

### Run the service

```bash
# Development mode (with auto-reload on file changes)
deno task dev

# Production mode
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
```

### Execution Modes

- **One-shot mode** (default, `CRON_MODE="false"` or undefined): Executes sync once and exits with code 0 on success or 1 on error. Ideal for Kubernetes CronJobs.
- **Continuous mode** (`CRON_MODE="true"`): Runs continuously with interval-based scheduling. Ideal for long-running Pods.

### Run tests

```bash
deno task test
```

## How It Works

1. **Initialization**: Worker reads configuration and connects to NAM API
2. **Fetch Integrators**: Retrieves Netbox integrators based on priority
3. **Get Prefixes**: Queries Netbox IPAM for IP prefixes using integrator queries
4. **Deploy to FortiOS**:
   - Creates missing IPv4/IPv6 address objects
   - Updates address groups with new/removed members
   - Deploys to specified VDOMs on each firewall
5. **Deploy to NSX**:
   - Creates or updates security groups
   - Manages IP address expressions
6. **Repeat**: Runs continuously at configured interval

## Priority Levels

- **low**: Syncs less frequently, lower priority integrators
- **medium**: Standard sync priority
- **high**: Critical integrators, syncs more frequently

## Logging

Logs are written to multiple destinations based on environment:

**Production/Container Mode:**
- **Console**: Real-time output (stdout/stderr)
- **Splunk HEC**: Real-time forwarding to Splunk (if configured)

**Development Mode (DENO_ENV=development):**
- **Console**: Real-time output
- **File logs**: Daily rotating logs in `logs/` directory
  - `combined.log`: All log levels
  - `warn.log`: Warnings and above
  - `error.log`: Errors only
  - `debug.log`: Debug information only
  - `splunk.log`: Splunk-formatted logs (for testing HEC locally)
- **Splunk HEC**: Real-time forwarding to Splunk (if configured)

**Note:** File logging is automatically disabled in production to avoid container filesystem issues. In Docker/Kubernetes, use `docker logs` or `kubectl logs` to view output.

**Log Configuration:**
```yaml
# Optional environment variables for file logging (development only)
FILELOG_DIR: "logs"           # Log directory path
FILELOG_SIZE: "50m"           # Max size per log file (50 megabytes)
FILELOG_DAYS: "30d"           # Retention period (30 days)
```

## License

Copyright 2025 Norsk Helsenett SF

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

## Documentation

- **Deployment Guide**: See [DEPLOYMENT.md](DEPLOYMENT.md) for deployment instructions (Helm, Docker, Kubernetes)
- **Development Guide**: See [DEVELOPMENT.md](DEVELOPMENT.md) for development setup, project structure, and contributing guidelines
- **Helm Chart**: See [charts/dcn-ipam-firewall-ssi/README.md](charts/dcn-ipam-firewall-ssi/README.md) for Helm chart documentation

## Support

For issues, bug reports, and feature requests:
- **GitHub Issues**: [NorskHelsenett/dcn-ipam-firewall-ssi/issues](https://github.com/NorskHelsenett/dcn-ipam-firewall-ssi/issues)
- **Website**: [https://www.nhn.no](https://www.nhn.no)
