/**
 * IPAM-Firewall-SSI Main Entry Point
 * Initializes and runs the SSI worker on a scheduled interval
 * Syncs IP address data from Netbox to FortiOS and VMware NSX systems
 *
 * Execution Modes:
 * - One-shot mode (CRON_MODE != "true"): Runs once and exits (for Kubernetes CronJobs)
 * - Continuous mode (CRON_MODE = "true"): Runs continuously with interval-based scheduling
 */

import { EnvLoader, isDevMode } from "@norskhelsenett/zeniki";
import { SSIWorker } from "./ssi/ssi.worker.ts";
import logger from "./ssi/loggers/logger.ts";
import packageInfo from "./deno.json" with { type: "json" };

/** Path to secrets configuration file */
const SECRETS_PATH = Deno.env.get("SECRETS_PATH") ?? undefined;
/** Path to application configuration file */
const CONFIG_PATH = Deno.env.get("CONFIG_PATH") ?? undefined;

/** Environment loader for secrets and config */
const envLoader = new EnvLoader(SECRETS_PATH, CONFIG_PATH);
/** SSI service name identifier */
const SSI_NAME = Deno.env.get("SSI_NAME") ?? "SSI_NAME_MISSING";
/** User-Agent header for API requests */
const USER_AGENT = `${SSI_NAME}/${packageInfo.version}`;
Deno.env.set("USER_AGENT", USER_AGENT);

/** Interval ID for continuous mode scheduling */
let INTERVAL_ID: number | undefined;
/** Execution priority level (low, medium, high) */
const SSI_PRIORITY = Deno.env.get("SSI_PRIORITY") ?? "low";
/** Sync interval in seconds for continuous mode */
const SSI_INTERVAL = parseInt(Deno.env.get("SSI_INTERVAL") as string) ?? 900;
/** Request timeout for API calls and log flushing in milliseconds */
const REQUEST_TIMEOUT = Deno.env.get("REQUEST_TIMEOUT")
  ? parseInt(Deno.env.get("REQUEST_TIMEOUT") as string)
  : 3000;
envLoader.close();
/**
 * Starts the SSI worker with mode-specific execution behavior
 * One-shot mode (CRON_MODE != "true"): Runs once and exits (for CronJobs)
 * Continuous mode (CRON_MODE = "true"): Runs continuously with interval scheduling (for Pods)
 *
 * @returns Promise that resolves when worker initialization completes
 * @throws Error if worker initialization or execution fails
 *
 * @example
 * ```ts
 * // One-shot mode (default)
 * Deno.env.set("CRON_MODE", "false");
 * await start(); // Runs once, exits with code 0 or 1
 *
 * // Continuous mode
 * Deno.env.set("CRON_MODE", "true");
 * Deno.env.set("SSI_INTERVAL", "300");
 * await start(); // Runs every 300 seconds
 * ```
 */
const start = async (): Promise<void> => {
  try {
    console.log(`Starting ${USER_AGENT}`);
    const ssiWorker = new SSIWorker();
    if (Deno.env.get("CRON_MODE") !== "true") {
      logger.info(
        `ipam-firewall-ssi: Initializing worker on ${Deno.hostname()} with priority ${SSI_PRIORITY}`,
      );
      await ssiWorker.work(SSI_PRIORITY);
      logger.debug(
        `ipam-firewall-ssi: Waiting to flush logs in ${
          REQUEST_TIMEOUT / 1000
        } seconds`,
      );
      // Added because Splunk logging can be slow...
      setTimeout(() => {
        Deno.exit(0);
      }, REQUEST_TIMEOUT);
    } else {
      logger.info(
        `ipam-firewall-ssi: Initializing worker on ${Deno.hostname()} with priority ${SSI_PRIORITY} running every ${SSI_INTERVAL} seconds...`,
      );
      ssiWorker.work(SSI_PRIORITY);
      INTERVAL_ID = setInterval(() => {
        ssiWorker.work(SSI_PRIORITY);
      }, SSI_INTERVAL * 1000);
    }
  } catch (error: unknown) {
    if (INTERVAL_ID) {
      clearInterval(INTERVAL_ID);
    }
    logger.error(
      `ipam-firewall-ssi: Worker error occurred on ${Deno.hostname()},  ${
        (error as Error).message
      }`,
      {
        component: "main",
        method: "start",
        error: isDevMode() ? error : (error as Error).message,
      },
    );
    // Added because Splunk logging can be slow...
    setTimeout(() => {
      Deno.exit(1);
    }, REQUEST_TIMEOUT);
  }
};

start();
