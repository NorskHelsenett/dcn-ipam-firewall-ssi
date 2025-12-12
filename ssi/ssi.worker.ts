/**
 * SSI Worker - Main orchestration class for IPAM-Firewall synchronization
 * Manages sync operations between Netbox IPAM and firewall systems (FortiOS, VMware NSX)
 */

import {
  FortiOSDriver,
  HTTPError,
  isDevMode,
  NAMAPIEndpoint,
  NAMNetboxIntegrator,
  NAMv2Driver,
  NetboxDriver,
  VMwareNSXDriver,
} from "@norskhelsenett/zeniki";
import { mapper, mapper6 } from "./ssi.utils.ts";
import packageInfo from "../deno.json" with { type: "json" };
import {
  createSecurityGroup,
  deploySecurityGroup,
} from "./services/nsx.service.ts";
import {
  deployAddresses,
  deployAddresses6,
} from "./services/fortios.service.ts";
import logger from "./loggers/logger.ts";

const SSI_NAME = Deno.env.get("SSI_NAME") ?? "SSI_NAME_MISSING";
const USER_AGENT = `${SSI_NAME}/${packageInfo.version}`;
Deno.env.set("USER_AGENT", USER_AGENT);
const REQUEST_TIMEOUT = Deno.env.get("REQUEST_TIMEOUT")
  ? parseInt(Deno.env.get("REQUEST_TIMEOUT") as string)
  : 10000;

const NAM_URL = Deno.env.get("NAM_URL");
const NAM_TOKEN = Deno.env.get("NAM_TOKEN");
const NAM_TEST_INT = Deno.env.get("NAM_TEST_INT");

/**
 * Main worker class that orchestrates IPAM to firewall synchronization
 * Initializes API drivers and coordinates deployment to FortiGate and NSX systems
 */
export class SSIWorker {
  private _running: boolean = false;
  private static _nms: NAMv2Driver;
  private _ipam: NetboxDriver | null = null;
  private _firewall: FortiOSDriver | null = null;
  private _nsx: VMwareNSXDriver | null = null;
  private _run_counter = 0;

  /**
   * Initializes the worker and sets up the NAM API driver
   */
  constructor() {
    if (!SSIWorker._nms && NAM_URL) {
      SSIWorker._nms = new NAMv2Driver({
        baseURL: NAM_URL,
        headers: {
          "User-Agent": USER_AGENT,
          "Content-Type": "application/json",
          Authorization: `Bearer ${NAM_TOKEN}`,
        },
        // * NOTE!: Only add if a timeout needed, signal: AbortSignal.timeout(REQUEST_TIMEOUT),
      });
    }
  }

  get isRunning(): boolean {
    return this._running;
  }

  /**
   * Main work method that performs synchronization tasks
   * Fetches integrators, retrieves prefixes from Netbox, and deploys to firewall systems
   * @param priority - Sync priority filter: low, medium, or high
   */
  public async work(priority: string = "low") {
    try {
      if (!this.isRunning) {
        this._running = true;
        logger.debug("ipam-firewall-ssi: Worker running task...");

        const integrators = isDevMode() && NAM_TEST_INT
          ? [
            await SSIWorker._nms.netbox_integrators.getNetboxIntegrator(
              NAM_TEST_INT,
              {
                expand: 1,
              },
            ).catch((error) => {
              logger.error(
                `ipam-firewall-ssi: Failed fetching integrators on ${Deno.hostname()}, ${error.message} @ ${NAM_URL}`,
                {
                  component: "worker",
                  method: "getNetboxIntegrator",
                  error: isDevMode() ? error : error.message,
                },
              );
              return;
            }),
          ]
          : ((
            await SSIWorker._nms.netbox_integrators.getNetboxIntegrators({
              expand: 1,
              sync_priority: priority,
            }).catch((error) => {
              logger.error(
                `ipam-firewall-ssi: Failed fetching integrators on ${Deno.hostname()}, ${error.message} @ ${NAM_URL}`,
                {
                  component: "worker",
                  method: "getNetboxIntegrator",
                  error: isDevMode() ? error : error.message,
                },
              );
              return;
            })
          )?.results as NAMNetboxIntegrator[]) || [];

        for (const integrator of integrators) {
          if (!integrator || !integrator?.enabled) {
            if (isDevMode() && !NAM_TEST_INT) {
              logger.debug(
                `ipam-firewall-ssi: Skipping disabled integrator '${integrator?.name}'...`,
                {
                  component: "worker",
                  method: "work",
                },
              );
            }
            if (!NAM_TEST_INT) {
              continue;
            }
          }

          // Dispose previous IPAM driver if exists
          if (this._ipam) {
            this._ipam.dispose();
            this._ipam = null;
          }

          this._ipam = this._configureIPAM(
            integrator?.netbox_endpoint as NAMAPIEndpoint,
          );
          const netboxQuery = new URLSearchParams(
            integrator?.query?.split("?")[1],
          );

          if (isDevMode()) {
            logger.debug(
              "ipam-firewall-ssi: Preparing IP prefix(es) from IPAM...",
              {
                component: "worker",
                method: "work",
              },
            );
          }

          const netboxPrefixes = (
            await this._ipam.prefixes.getPrefixes(netboxQuery, true).catch(
              (error: HTTPError) => {
                logger.warning(
                  `ipam-firewall-ssi: Could not retrieve prefixes from IPAM ${this?._ipam?.getHostname()} due to ${error.message} `,
                  {
                    component: "ssi.worker",
                    method: "work",
                    error: isDevMode() ? error : error.message,
                  },
                );
                return;
              },
            )
          )?.results;

          if (!netboxPrefixes) {
            logger.info(
              `ipam-firewall-ssi: Skipping due to missing prefixes for '${integrator?.name}'...`,
              {
                component: "worker",
                method: "work",
              },
            );
            continue;
          }

          const prefixes = mapper(netboxPrefixes);
          const prefixes6 = mapper6(netboxPrefixes);

          if (
            integrator?.create_fg_group &&
            integrator?.fortigate_endpoints.length > 0
          ) {
            if (isDevMode()) {
              logger.debug("ipam-firewall-ssi: Deploying to firewall(s)...", {
                component: "worker",
                method: "work",
              });
            }
            for (const fortigate of integrator.fortigate_endpoints) {
              const firewall = fortigate.endpoint;
              const vdoms = fortigate.vdoms;

              if (!fortigate || !vdoms || vdoms.length === 0) {
                logger.warning(
                  `ipam-firewall-ssi: Invalid Fortigate endpoint configured for '${integrator.name}'. Check your configuration in NAM.`,
                  {
                    component: "worker",
                    method: "work",
                  },
                );
                continue;
              }

              if (firewall.enabled) {
                // Dispose previous firewall driver if exists
                if (this._firewall) {
                  this._firewall.dispose();
                  this._firewall = null;
                }
                this._firewall = this._configureFirewall(firewall);

                await Promise.all(
                  vdoms.map((vdom: { name: string }) =>
                    Promise.all([
                      deployAddresses(
                        this._firewall,
                        vdom,
                        integrator,
                        prefixes,
                      ),
                      deployAddresses6(
                        this._firewall,
                        vdom,
                        integrator,
                        prefixes6,
                      ),
                    ])
                  ),
                );
              }
            }
          }

          if (isDevMode()) {
            logger.debug("ipam-firewall-ssi: Deploying to VMware NSX(es)...", {
              component: "worker",
              method: "work",
            });
          }
          if (integrator?.create_nsx_group && integrator?.nsx_endpoints) {
            const securityGroup = await createSecurityGroup(
              integrator,
              netboxPrefixes,
            );
            for (const endpoint of integrator.nsx_endpoints) {
              // Dispose previous NSX driver if exists
              if (this._nsx) {
                this._nsx.dispose();
                this._nsx = null;
              }
              this._nsx = this._configureNSX(endpoint as NAMAPIEndpoint);
              const gm = (endpoint as NAMAPIEndpoint).type === "global";
              await deploySecurityGroup(
                this._nsx,
                securityGroup,
                netboxPrefixes,
                gm,
              );
            }
          }

          // Array cleanup - explicitly clear to free memory
          if (isDevMode()) {
            logger.debug(
              `ipam-firewall-ssi: Cleaning up arrays for '${integrator?.name}' (netboxPrefixes: ${netboxPrefixes.length}, prefixes: ${prefixes.length}, prefixes6: ${prefixes6.length})`,
              {
                component: "worker",
                method: "work",
              },
            );
          }
          netboxPrefixes.length = 0;
          prefixes.length = 0;
          prefixes6.length = 0;
        }

        // Final cleanup - clear integrators array
        if (isDevMode()) {
          logger.debug(
            `ipam-firewall-ssi: Cleaning up integrators array (${integrators.length} integrators processed)`,
            {
              component: "worker",
              method: "work",
            },
          );
        }
        integrators.length = 0;

        this._running = false;
        this._resetDriverInstances();
        this._run_counter += 1;
        logger.debug("ipam-firewall-ssi: Worker task completed...", {
          component: "worker",
          method: "work",
        });
        // This shall be a console log, as we´re only interested in number of runs completed, and not logging them.
        console.log(
          `ipam-firewall-ssi: Completed run number ${this._run_counter}`,
        );
        return 0;
      } else {
        logger.warning("ipam-firewall-ssi: Worker task already running...", {
          component: "worker",
          method: "work",
        });
        return 7;
      }
    } catch (error: unknown) {
      this._running = false;
      throw error;
    }
  }

  /**
   * Configures the Netbox IPAM driver with endpoint credentials
   */
  private _configureIPAM(endpoint: NAMAPIEndpoint): NetboxDriver {
    return new NetboxDriver({
      baseURL: endpoint.url.replace(/\/$/, ""),
      headers: {
        "User-Agent": USER_AGENT,
        "Content-Type": "application/json",
        Authorization: `Token ${endpoint.key}`,
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT),
    });
  }

  /**
   * Configures the FortiOS firewall driver with endpoint credentials
   */
  private _configureFirewall(endpoint: NAMAPIEndpoint): FortiOSDriver {
    return new FortiOSDriver({
      baseURL: endpoint.url,
      headers: {
        "User-Agent": USER_AGENT,
        "Content-Type": "application/json",
        Authorization: `Bearer ${endpoint.key}`,
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT),
    });
  }

  /**
   * Configures the VMware NSX driver with endpoint credentials
   */
  private _configureNSX = (endpoint: NAMAPIEndpoint) => {
    const username = endpoint?.user + "";
    const password = endpoint?.pass + "";
    const authString = `${username}:${password}`;
    const encodedAuth = btoa(authString);

    return new VMwareNSXDriver({
      baseURL: endpoint?.url?.replace("/api/v1", ""),
      headers: {
        "User-Agent": USER_AGENT,
        "Content-Type": "application/json",
        Authorization: `Basic ${encodedAuth}`,
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT),
    });
  };

  private _resetDriverInstances() {
    try {
      logger.debug(`ipam-firewall-ssi: Dereferencing old driver instances.`);
      if (this._ipam) {
        this._ipam.dispose();
        this._ipam = null;
      }
      if (this._firewall) {
        this._firewall.dispose();
        this._firewall = null;
      }
      if (this._nsx) {
        this._nsx.dispose();
        this._nsx = null;
      }
    } catch (error: unknown) {
      if (error instanceof Error) {
        logger.warning(
          `ipam-firewall-ssi: Error could not reset one or more driver instances, ${error.message}`,
          {
            component: "worker",
            method: "work",
            error: isDevMode() ? error : error.message,
          },
        );
      }
    }
  }
}
