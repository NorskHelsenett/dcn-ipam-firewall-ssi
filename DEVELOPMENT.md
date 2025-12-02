# Development Guide

This guide covers development setup, project structure, and best practices for
contributing to IPAM-Firewall-SSI.

## Project Structure

```
ipam-ssi/
├── main.ts                   # Application entry point
├── main_test.ts              # Test file
├── deno.json                 # Deno configuration
├── Dockerfile                # Container image definition
├── docker-compose.yml        # Docker Compose configuration
├── README.md                 # Main documentation
├── DEVELOPMENT.md            # This file - development guide
├── config/                   # Configuration directory
│   └── config.yaml           # Main config (create from example)
├── secrets/                  # Secrets directory
│   └── secrets.yaml          # Secrets file (create from example)
├── examples/                 # Example configuration templates
│   ├── config.yaml.example   # Config template with demo values
│   ├── secrets.yaml.example  # Secrets template with demo tokens
│   └── argo-ipam-firewall-ssi.yaml.example # Argo CD Application example
├── logs/                     # Log files directory (auto-created)
├── charts/                   # Helm charts
│   └── dcn-ipam-firewall-ssi/ # Production Helm chart
│       ├── Chart.yaml        # Chart metadata (v0.9.24)
│       ├── README.md         # Helm chart documentation
│       ├── values.yaml       # Default values
│       ├── env/              # Environment-specific values
│       │   ├── prod.yaml     # Production configuration
│       │   ├── qa.yaml       # QA configuration
│       │   └── test.yaml     # Test configuration
│       └── templates/        # Kubernetes resource templates
│           ├── _helpers.tpl  # Template helpers
│           ├── configmap.yaml # ConfigMap template
│           ├── credentials.yaml # Secret template
│           └── cronjob.yaml  # CronJob template
├── kubernetes/               # Basic Kubernetes manifests (alternative to Helm)
│   ├── configmap.yaml        # ConfigMap for mapping config.yaml
│   ├── secret.yaml           # Secret for mapping secrets.yaml
│   └── ipam-firewall-ssi.yaml # Pod deployment
└── ssi/                      # Source code
    ├── ssi.worker.ts         # Main orchestration worker
    ├── ssi.utils.ts          # Utility functions
    ├── loggers/
    │   └── logger.ts         # Winston logger configuration
    └── services/
        ├── fortios.service.ts # FortiOS firewall operations
        └── nsx.service.ts     # VMware NSX operations
```

## Development Mode

Set `DENO_ENV=development` in `config/config.yaml` to:

- Enable debug logging
- Disable SSL certificate verification
- Use `NAM_TEST_INT` for single integrator testing
- Include full error stack traces in logs
- Enable Splunk-formatted file logging (auto-enabled in dev mode)

**Note:** Standard file logging (`addFileLoggers()`) is not automatically
enabled. Call it explicitly in code if needed for development.

## Testing a Single Integrator

```yaml
# In config/config.yaml
DENO_ENV: "development"
NAM_TEST_INT: "507f1f77bcf86cd799439011" # Your integrator ID
```

## Getting Started

1. **Copy example files:**
   ```bash
   cp examples/config.yaml.example config/config.yaml
   cp examples/secrets.yaml.example secrets/secrets.yaml
   ```

2. **Update configuration:**
   - Edit `config/config.yaml` with your NAM URL, Splunk settings, etc.
   - Edit `secrets/secrets.yaml` with your actual API tokens

3. **Run locally:**
   ```bash
   deno task dev  # Development mode with auto-reload
   deno task run  # Production mode
   ```

4. **Run with Docker:**
   ```bash
   # Set proper permissions
   sudo chown 1993:1993 config/config.yaml secrets/secrets.yaml
   # Start service
   docker-compose up -d
   # View logs
   docker logs -f ipam-firewall-ssi
   ```

## Running Tests

```bash
# Run all tests
deno task test

# Run tests with coverage
deno test --coverage=coverage

# Generate coverage report
deno coverage coverage
```

## Code Structure

### Main Entry Point (`main.ts`)

- Loads configuration from YAML files
- Initializes the worker
- Handles execution mode (one-shot vs continuous)

### Worker (`ssi/ssi.worker.ts`)

- Orchestrates the sync process
- Fetches integrators from NAM API
- Iterates through integrators and deploys to firewalls

### Services

#### FortiOS Service (`ssi/services/fortios.service.ts`)

- `deployAddresses()` - Deploys IPv4 addresses and groups
- `deployAddresses6()` - Deploys IPv6 addresses and groups
- Handles address creation, group updates, and cleanup

#### NSX Service (`ssi/services/nsx.service.ts`)

- `deploySecurityGroup()` - Creates/updates NSX security groups
- `createSecurityGroup()` - Builds security group objects
- Manages IP address expressions

### Utilities (`ssi/ssi.utils.ts`)

- Helper functions for address group member comparisons
- Data transformation utilities

### Logger (`ssi/loggers/logger.ts`)

- Winston-based logging
- Default transports: console and Splunk HEC (if configured)
- Optional file logging: call `addFileLoggers()` to enable
- Splunk file logging: auto-enabled in development mode via
  `addSplunkFileLogger()`
- Environment-specific configuration

## Development Workflow

1. **Make changes** to TypeScript files
2. **Run in dev mode** with auto-reload: `deno task dev`
3. **Test your changes**: `deno task test`
4. **Build Docker image** (optional): `docker build -t ipam-firewall-ssi:dev .`
5. **Test in container**: `docker-compose up`

## Environment Variables

Development-specific environment variables:

```bash
export DENO_ENV="development"           # Enable dev mode
export NAM_TEST_INT="your-integrator-id" # Test single integrator
export FILELOG_DIR="logs"               # Log directory (for file logging if enabled)
export FILELOG_SIZE="50m"               # Max log file size
export FILELOG_DAYS="30d"               # Log retention
```

**Logging Behavior:**

- Console and Splunk HEC are always enabled (Splunk if configured)
- Splunk file logging is auto-enabled in development mode
- Standard file logging requires explicit call to `addFileLoggers()`

## Debugging

### Enable Debug Logs

Set `DENO_ENV: "development"` in `config/config.yaml`

### View Logs

```bash
# Console output (always enabled)
deno task dev

# Docker logs
docker logs -f ipam-firewall-ssi

# Splunk file logs (auto-enabled in dev mode)
tail -f logs/splunk.log

# Standard file logs (only if explicitly enabled via addFileLoggers())
tail -f logs/combined.log
tail -f logs/error.log
tail -f logs/debug.log
```

### Common Issues

**SSL Certificate Errors:**

- Development mode disables SSL verification
- Production requires valid certificates

**Permission Errors:**

- Ensure config files are readable: `chmod 644 config/*.yaml`
- For Docker: `sudo chown 1993:1993 config/*.yaml`

**API Timeouts:**

- Increase `REQUEST_TIMEOUT` in config.yaml
- Check network connectivity to NAM/Netbox/Firewall APIs

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes and test thoroughly
4. Run linter: `deno lint`
5. Format code: `deno fmt`
6. Commit with descriptive messages
7. Push to your fork: `git push origin feature/my-feature`
8. Create a Pull Request

**Note:** All contributions must pass `deno fmt` and `deno lint` checks before
being accepted.

## Code Style

- Follow TypeScript best practices
- Use meaningful variable and function names
- Add comments for complex logic
- Include JSDoc comments for exported functions
- Format code consistently with Deno formatter: `deno fmt`
- **Run linter to catch issues**: `deno lint` (required for all PRs)

## License

Copyright 2025 Norsk Helsenett SF

Licensed under the Apache License, Version 2.0. See LICENSE file for details.
