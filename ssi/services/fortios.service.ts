/**
 * FortiOS Service - Manages FortiGate firewall addresses and address groups
 * Syncs IPv4 and IPv6 prefixes from Netbox to FortiGate VDOMs
 */

import {
  FortiOSDriver,
  FortiOSFirewallAddress,
  FortiOSFirewallAddress6,
  FortiOSFirewallAddrGrp,
  FortiOSFirewallAddrGrp6,
  isDevMode,
  NAMAPIEndpoint,
  NAMFortiOSVdom,
  NAMNetboxIntegrator,
} from "@norskhelsenett/zeniki";
import { getAddGrpMemberChanges } from "../ssi.utils.ts";
import logger from "../loggers/logger.ts";

/**
 * Deploys IPv4 addresses and address groups to a FortiGate firewall VDOM
 * Creates missing addresses, updates groups with added/removed members
 */
export const deployAddresses = async (
  firewall: FortiOSDriver | null,
  vdom: NAMFortiOSVdom,
  integrator: NAMNetboxIntegrator,
  prefixes: FortiOSFirewallAddress[],
) => {
  try {
    if (firewall) {
      const groups: FortiOSFirewallAddrGrp[] | undefined = (
        await firewall.addrgrp
          .getAddressGroups({ vdom: vdom.name })
          .catch((error: unknown) => {
            logger.warning(
              `ipam-firewall-ssi: Failed getting IPv4 address groups from '${integrator.name}' on '${firewall.getHostname()}' vdom '${vdom.name}'`,
              {
                component: "fortios.service",
                method: "deployAddresses",
                error: isDevMode() ? error : (error as Error).message,
              },
            );
          })
      )?.results;

      const addresses: FortiOSFirewallAddress[] | undefined = (
        await firewall.address
          .getAddresses({ vdom: vdom.name })
          .catch((error: unknown) => {
            logger.warning(
              `ipam-firewall-ssi: Failed getting IPv4 addresses from '${integrator.name}' on '${firewall.getHostname()}' vdom '${vdom.name}'`,
              {
                component: "fortios.service",
                method: "deployAddresses",
                error: isDevMode() ? error : (error as Error).message,
              },
            );
          })
      )?.results;

      if (!groups || !addresses) {
        logger.error(
          `ipam-firewall-ssi: Missing IPv4 addresses or groups from '${integrator.name}' on ${firewall.getHostname()} vdom ${vdom.name}.`,
          {
            component: "fortios.service",
            method: "deployAddresses",
          },
        );
        return;
      }

      const groupName = `grp_${integrator.fg_group_name}`;

      for (const prefix of prefixes) {
        const existing = addresses.find((address: FortiOSFirewallAddress) => {
          return address.name === prefix.name;
        });

        if (!existing) {
          await firewall.address
            .addAddress(prefix, { vdom: vdom.name })
            .then((_res) => {
              logger.info(
                `ipam-firewall-ssi: Created IPv4 address '${prefix.name}' from '${integrator.name}' on '${firewall.getHostname()}' vdom '${vdom.name}'`,
              );
            })
            .catch((error: unknown) => {
              logger.error(
                `ipam-firewall-ssi: Failed to create IPv4 address '${prefix.name}' from '${integrator.name}' on '${firewall.getHostname()}' vdom '${vdom.name}'`,
                {
                  component: "fortios.service",
                  method: "deployAddresses",
                  error: isDevMode() ? error : (error as Error).message,
                },
              );
            });
          //addresses.push(prefix);
        }
      }

      if (integrator.create_fg_group && integrator.fg_group_name) {
        const existingGroup = groups.find((group: FortiOSFirewallAddrGrp) => {
          return group.name === groupName;
        });

        if (!existingGroup) {
          const members = prefixes.map((prefix: FortiOSFirewallAddress) => {
            return { name: prefix.name };
          });

          await firewall.addrgrp
            .addAddressGroup(
              {
                name: groupName,
                comment: "Managed by NAM",
                color: 3,
                member: members,
              },
              { vdom: vdom.name },
            )
            .then((_res) => {
              logger.info(
                `ipam-firewall-ssi: Created IPv4 address group from '${integrator.name}' on '${firewall.getHostname()}' vdom '${vdom.name}'`,
                {
                  component: "fortios.service",
                  method: "deployAddresses",
                },
              );
            })
            .catch((error: unknown) => {
              logger.error(
                `ipam-firewall-ssi: Creation of IPv4 address group failed from '${integrator.name}' on '${firewall.getHostname()}' vdom '${vdom.name}'`,
                {
                  component: "fortios.service",
                  method: "deployAddresses",
                  error: isDevMode() ? error : (error as Error).message,
                },
              );
            });
        } else {
          const group = groups.find((group: FortiOSFirewallAddrGrp) => {
            return group.name === groupName;
          }) as FortiOSFirewallAddrGrp;

          const uniqueMembers: { name: string }[] = prefixes.filter(
            (
              member: FortiOSFirewallAddress,
              index: number,
              array: FortiOSFirewallAddress[],
            ) =>
              index ===
                array.findIndex((findMember) =>
                  findMember.name === member.name
                ),
          );

          const updatedGroup: FortiOSFirewallAddrGrp = {
            name: groupName,
            comment: "Managed by NAM",
            color: 3,
            member: uniqueMembers,
          };

          const updates: { added: string[]; removed: string[] } =
            getAddGrpMemberChanges(group, updatedGroup);

          const meta = {
            name: groupName,
            type: "UPDATE",
            src: {
              system: "netbox",
              server: (integrator.netbox_endpoint as NAMAPIEndpoint).name,
              options: { query: integrator.query },
            },
            dst: {
              system: "fortigate",
              server: firewall.getHostname(),
              options: { vdom: vdom.name },
            },
            changes: updates,
          };

          if (updates?.added.length > 0 || updates?.removed.length > 0) {
            await firewall.addrgrp
              .updateAddressGroup(groupName, updatedGroup, {
                vdom: vdom.name,
              })
              .then((_res) => {
                logger.info(
                  `ipam-firewall-ssi: Updated IPv4 address group from '${integrator.name}' on '${firewall.getHostname()}' vdom '${vdom.name}'`,
                  {
                    component: "fortios.service",
                    method: "deployAddresses",
                    ...meta,
                  },
                );
              })
              .catch((error: unknown) => {
                logger.error(
                  `ipam-firewall-ssi: Updated IPv4 address group failed from '${integrator.name}' on '${firewall.getHostname()}' vdom '${vdom.name}'`,
                  {
                    component: "fortios.service",
                    method: "deployAddresses",
                    ...meta,
                    error: isDevMode() ? error : (error as Error).message,
                  },
                );
              });

            for (const removed_prefix_name of updates.removed) {
              const ip_address = (
                await firewall.address
                  .getAddress(removed_prefix_name, {
                    with_meta: 1,
                    vdom: vdom.name,
                  })
                  .catch((_error) => {
                    // Do nothing!
                  })
              )?.results[0];

              if (ip_address?.q_ref === 0) {
                await firewall.address
                  .deleteAddress(removed_prefix_name, { vdom: vdom.name })
                  .then((_res) => {
                    logger.info(
                      `ipam-firewall-ssi: Removed IPv4 address '${removed_prefix_name}' from '${integrator.name}' on '${firewall.getHostname()}' vdom '${vdom.name}'`,
                      {
                        component: "fortios.service",
                        method: "deployAddresses",
                      },
                    );
                  })
                  .catch((error: unknown) => {
                    logger.error(
                      `ipam-firewall-ssi: Remove IPv4 address '${removed_prefix_name}' failed from '${integrator.name}' on '${firewall.getHostname()}' vdom '${vdom.name}'`,
                      {
                        component: "fortios.service",
                        method: "deployAddresses",
                        error: isDevMode() ? error : (error as Error).message,
                      },
                    );
                  });
              }
            }
          }
        }
      }

      // Clear arrays to free memory
      if (groups) groups.length = 0;
      if (addresses) addresses.length = 0;
    }
  } catch (error) {
    throw error;
  }
};

/**
 * Deploys IPv6 addresses and address groups to a FortiGate firewall VDOM
 * Creates missing addresses, updates groups with added/removed members
 */
export const deployAddresses6 = async (
  firewall: FortiOSDriver | null,
  vdom: NAMFortiOSVdom,
  integrator: NAMNetboxIntegrator,
  prefixes: FortiOSFirewallAddress6[],
) => {
  try {
    if (firewall) {
      const groups: FortiOSFirewallAddrGrp6[] | undefined = (
        await firewall.addrgrp6
          .getAddressGroups6({ vdom: vdom.name })
          .catch((error: unknown) => {
            logger.warning(
              `ipam-firewall-ssi: Failed getting IPv6 address groups from '${integrator.name}' on '${firewall.getHostname()}' vdom '${vdom.name}'`,
              {
                component: "fortios.service",
                method: "deployAddresses6",
                error: isDevMode() ? error : (error as Error).message,
              },
            );
          })
      )?.results;

      const addresses = (
        await firewall.address6
          .getAddresses6({ vdom: vdom.name })
          .catch((error: unknown) => {
            logger.warning(
              `ipam-firewall-ssi: Failed getting IPv6 addresses from '${integrator.name}' on '${firewall.getHostname()}' vdom '${vdom.name}'`,
              {
                component: "fortios.service",
                method: "deployAddresses6",
                error: isDevMode() ? error : (error as Error).message,
              },
            );
          })
      )?.results;

      if (!groups || !addresses) {
        logger.error(
          `ipam-firewall-ssi: Missing IPv6 addresses or groups from '${integrator.name}' on ${firewall.getHostname()} vdom ${vdom.name}.`,
          {
            component: "fortios.service",
            method: "deployAddresses6",
          },
        );
        return;
      }

      const groupName = `grp6_${integrator.fg_group_name}`;

      for (const prefix of prefixes) {
        const existing = addresses.find((address: FortiOSFirewallAddress6) => {
          return address.name === prefix.name;
        });
        if (!existing) {
          await firewall.address6
            .addAddress6(prefix, { vdom: vdom.name })
            .then((_res) => {
              logger.info(
                `ipam-firewall-ssi: Created IPv6 address '${prefix.name}' from '${integrator.name}' on '${firewall.getHostname()}' vdom '${vdom.name}'`,
              );
            })
            .catch((error: unknown) => {
              logger.error(
                `ipam-firewall-ssi: Failed to create IPv6 address '${prefix.name}' from '${integrator.name}' on '${firewall.getHostname()}' vdom '${vdom.name}'`,
                {
                  component: "fortios.service",
                  method: "deployAddresses",
                  error: isDevMode() ? error : (error as Error).message,
                },
              );
            });
          //addresses.push(prefix);
        }
      }

      // check for fortigate group
      if (integrator.create_fg_group && integrator.fg_group_name) {
        const existingGroup = groups.find((group: FortiOSFirewallAddrGrp6) => {
          return group.name === groupName;
        });
        if (!existingGroup) {
          const members = prefixes.map((prefix: FortiOSFirewallAddress6) => {
            return { name: prefix.name };
          });

          await firewall.addrgrp6
            .addAddressGroup6(
              {
                name: groupName,
                color: 3,
                comment: "Managed by NAM",
                member: members,
              },
              { vdom: vdom.name },
            )
            .then((_res) => {
              logger.info(
                `ipam-firewall-ssi: Created IPv6 address group from '${integrator.name}' on '${firewall.getHostname()}' vdom '${vdom.name}'`,
                {
                  component: "fortios.service",
                  method: "deployAddresses6",
                },
              );
            })
            .catch((error: unknown) => {
              logger.error(
                `ipam-firewall-ssi: Creation of IPv6 address group failed from '${integrator.name}' on '${firewall.getHostname()}' vdom '${vdom.name}'`,
                {
                  component: "fortios.service",
                  method: "deployAddresses6",
                  error: isDevMode() ? error : (error as Error).message,
                },
              );
            });
        } else {
          const group = groups.find((group: FortiOSFirewallAddrGrp6) => {
            return group.name === groupName;
          }) as FortiOSFirewallAddrGrp6;

          const uniqueMembers: { name: string }[] = prefixes.filter(
            (
              member: FortiOSFirewallAddress6,
              index: number,
              array: FortiOSFirewallAddress6[],
            ) =>
              index ===
                array.findIndex((findMember) =>
                  findMember.name === member.name
                ),
          );

          const updatedGroup: FortiOSFirewallAddrGrp6 = {
            name: groupName,
            comment: "Managed by NAM",
            color: 3,
            member: uniqueMembers,
          };

          const updates: { added: string[]; removed: string[] } =
            getAddGrpMemberChanges(group, updatedGroup);

          const meta = {
            name: groupName,
            type: "UPDATE",
            src: {
              system: "netbox",
              server: (integrator.netbox_endpoint as NAMAPIEndpoint).name,
              query: integrator.query,
            },
            dst: {
              system: "fortigate",
              server: firewall.getHostname(),
              options: { vdom: vdom.name },
            },
            updates: updates,
          };

          if (updates?.added.length > 0 || updates?.removed.length > 0) {
            await firewall.addrgrp6
              .updateAddressGroup6(groupName, updatedGroup, { vdom: vdom.name })
              .then((_res) => {
                logger.info(
                  `ipam-firewall-ssi: Updated IPv6 address group from '${integrator.name}' on '${firewall.getHostname()}' vdom '${vdom.name}'`,
                  {
                    component: "fortios.service",
                    method: "deployAddresses6",
                    ...meta,
                  },
                );
              })
              .catch((error: unknown) => {
                logger.error(
                  `ipam-firewall-ssi: Updated IPv6 address group failed from '${integrator.name}' on '${firewall.getHostname()}' vdom '${vdom.name}'`,
                  {
                    component: "fortios.service",
                    method: "deployAddresses6",
                    ...meta,
                    error: isDevMode() ? error : (error as Error).message,
                  },
                );
              });

            for (const removed_prefix_name of updates.removed) {
              let ip6_address = (
                await firewall.address6
                  .getAddress6(removed_prefix_name, {
                    with_meta: 1,
                    vdom: vdom.name,
                  })
                  .catch((_error) => {
                    // Do nothing!
                  })
              )?.results[0];

              if (ip6_address?.q_ref === 0) {
                ip6_address = undefined;
                await firewall.address6
                  .deleteAddress6(removed_prefix_name, {
                    vdom: vdom.name,
                  })
                  .then((_res) => {
                    logger.info(
                      `ipam-firewall-ssi: Removed IPv6 address '${removed_prefix_name}' from '${integrator.name}' on '${firewall.getHostname()}' vdom '${vdom.name}'`,
                      {
                        component: "fortios.service",
                        method: "deployAddresses6",
                      },
                    );
                  })
                  .catch((error: unknown) => {
                    logger.error(
                      `ipam-firewall-ssi: Remove IPv6 address '${removed_prefix_name}' failed from '${integrator.name}' on '${firewall.getHostname()}' vdom '${vdom.name}'`,
                      {
                        component: "fortios.service",
                        method: "deployAddresses6",
                        error: isDevMode() ? error : (error as Error).message,
                      },
                    );
                  });
              }
            }
          }
        }
      }

      // Clear arrays to free memory
      if (groups) groups.length = 0;
      if (addresses) addresses.length = 0;
    }
  } catch (error) {
    throw error;
  }
};
