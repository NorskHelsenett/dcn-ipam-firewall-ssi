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

const SECRETS_PATH = Deno.env.get("SECRETS_PATH") ?? undefined;
const CONFIG_PATH = Deno.env.get("CONFIG_PATH") ?? undefined;

const envLoader = new EnvLoader(SECRETS_PATH, CONFIG_PATH);
const SSI_NAME = Deno.env.get("SSI_NAME") ?? "SSI_NAME_MISSING";
const USER_AGENT = `${SSI_NAME}/${packageInfo.version}`;
Deno.env.set("USER_AGENT", USER_AGENT);


let INTERVAL_ID: number | undefined;
const SSI_PRIORITY = Deno.env.get("SSI_PRIORITY") ?? "low"; // [low | medium | high]
const SSI_INTERVAL = parseInt(Deno.env.get("SSI_INTERVAL") as string) ?? 900; // In seconds
const REQUEST_TIMEOUT = Deno.env.get("REQUEST_TIMEOUT")
  ? parseInt(Deno.env.get("REQUEST_TIMEOUT") as string)
  : 3000;
envLoader.close();
/**
 * Starts the SSI worker with mode-specific execution behavior
 *
 * One-shot mode (CRON_MODE != "true"):
 * - Executes synchronization once
 * - Waits for completion
 * - Exits with code 0 on success, 1 on error
 * - Ideal for Kubernetes CronJobs
 *
 * Continuous mode (CRON_MODE = "true"):
 * - Runs immediately on start
 * - Schedules periodic synchronization at SSI_INTERVAL
 * - Continues running until manually stopped
 * - Ideal for long-running containers
 */
const start = async (): Promise<void> => {
  try {
    console.log(`Starting ${USER_AGENT}`);
    const ssiWorker = new SSIWorker();
    if (Deno.env.get("CRON_MODE") !== "true") {
      logger.info(
        `ipam-firewall-ssi: Initializing worker on ${Deno.hostname()} with priority ${SSI_PRIORITY}`
      );
      await ssiWorker.work(SSI_PRIORITY);
      logger.debug(
        `ipam-firewall-ssi: Waiting to flush logs in ${
          REQUEST_TIMEOUT / 1000
        } seconds`
      );
      // Added because Splunk logging can be slow...
      setTimeout(() => {
        Deno.exit(0);
      }, REQUEST_TIMEOUT);
    } else {
      logger.info(
        `ipam-firewall-ssi: Initializing worker on ${Deno.hostname()} with priority ${SSI_PRIORITY} running every ${SSI_INTERVAL} seconds...`
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
      }
    );
    // Added because Splunk logging can be slow...
    setTimeout(() => {
      Deno.exit(1);
    }, REQUEST_TIMEOUT);
  }
};

start();
