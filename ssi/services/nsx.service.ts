/**
 * NSX Service - Manages VMware NSX security groups for IP address management
 * Syncs IP prefixes from Netbox to NSX security groups
 */

import {
  isDevMode,
  NAMNetboxIntegrator,
  NetboxPrefix,
  VMwareNSXDriver,
  VMwareNSXGroup,
} from "@norskhelsenett/zeniki";
import logger from "../loggers/logger.ts";

/**
 * Deploys or updates a security group on NSX with IP addresses from Netbox
 * Creates the group if it doesn't exist, patches with IP changes if it does
 *
 * @param nsx - VMware NSX driver instance for API communication
 * @param securityGroupObject - Security group configuration object
 * @param prefixes - Array of Netbox IP prefixes to deploy
 * @param globalManager - Whether to use global manager endpoint
 * @throws Error if deployment or update operations fail
 *
 * @example
 * ```ts
 * await deploySecurityGroup(
 *   nsxDriver,
 *   { display_name: 'nsg-prod', expression: [...] },
 *   [{ prefix: '10.0.0.0/24' }],
 *   false
 * );
 * ```
 */
export const deploySecurityGroup = async (
  nsx: VMwareNSXDriver,
  securityGroupObject: VMwareNSXGroup,
  prefixes: NetboxPrefix[],
  globalManager?: boolean,
) => {
  try {
    let groupIps: string[] = [];
    const securityGroup = (await nsx.groups
      .getGroup(
        securityGroupObject.display_name as string,
        undefined,
        undefined,
        globalManager,
      )
      .catch((error) => {
        logger.warning(
          `ipam-firewall-ssi: Security group '${securityGroupObject.display_name}' not found on '${nsx.getHostname()}'`,
          {
            component: "nsx.service",
            method: "deploySecurityGroup",
            error: isDevMode() ? error : error?.message,
          },
        );
      })) as VMwareNSXGroup;

    // If security group not found create it.
    if (!securityGroup) {
      await nsx.groups
        .patchGroup(
          securityGroupObject.display_name as string,
          securityGroupObject,
          undefined,
          undefined,
          globalManager,
        )
        .then((_res) => {
          logger.info(
            `ipam-firewall-ssi: Created security group '${securityGroupObject.display_name}' on '${nsx.getHostname()}'`,
            {
              component: "nsx.service",
              method: "deploySecurityGroup",
            },
          );
        })
        .catch((error: Error) => {
          logger.error(
            `ipam-firewall-ssi: Failed to create security group '${securityGroupObject.display_name}' on '${nsx.getHostname()}'`,
            {
              component: "nsx.service",
              method: "deploySecurityGroup",
              error: isDevMode() ? error : error?.message,
            },
          );
        });
    } // or check for changes in ip addresses and patch it is found.
    else {
      if (securityGroup.expression) {
        for (const expression of securityGroup.expression) {
          if (expression.ip_addresses) {
            groupIps = groupIps.concat(expression.ip_addresses);
          }
        }
      }
      groupIps = [...new Set(groupIps)];

      //Find members only present in Netbox
      const added = prefixes
        .map((prefixObject: NetboxPrefix) => {
          return prefixObject.prefix;
        })
        .filter(
          (netbox_ip: string | null) =>
            !groupIps.some((nsx_ip: string | null) => {
              return nsx_ip === netbox_ip;
            }),
        );

      //Find members only present in NSX
      const deleted = groupIps.filter(
        (nsxIp: string | null) =>
          !prefixes
            .map((prefixObject: NetboxPrefix) => {
              return prefixObject.prefix;
            })
            .some((netboxIp: string | null) => {
              return netboxIp === nsxIp;
            }),
      );

      if (added.length || deleted.length) {
        await nsx.groups
          .patchGroup(
            securityGroupObject.display_name as string,
            securityGroupObject,
            undefined,
            undefined,
            globalManager,
          )
          .then((_res) => {
            logger.info(
              `ipam-firewall-ssi: Updated security group '${securityGroupObject.display_name}' on '${nsx.getHostname()}'`,
              {
                component: "nsx.service",
                method: "deploySecurityGroup",
              },
            );
          })
          .catch((error: Error) => {
            logger.error(
              `ipam-firewall-ssi: Failed to update security group '${securityGroupObject.display_name}' on '${nsx.getHostname()}'`,
              {
                component: "nsx.service",
                method: "deploySecurityGroup",
                error: isDevMode() ? error : error?.message,
              },
            );
          });
      }
    }

    // Clear array to free memory
    groupIps.length = 0;
  } catch (error) {
    throw error;
  }
};

/**
 * Creates a VMware NSX security group object from Netbox integrator configuration
 * Includes IP address expressions and optional scope/tag metadata
 *
 * @param integrator - Netbox integrator configuration
 * @param prefixes - Array of Netbox IP prefixes
 * @returns VMwareNSXGroup object ready for deployment
 *
 * @example
 * ```ts
 * const group = createSecurityGroup(
 *   { nsx_group_name: 'prod', nsx_group_scope: 'env', nsx_group_tag: 'production' },
 *   [{ prefix: '10.0.0.0/24' }]
 * );
 * ```
 */
export const createSecurityGroup = (
  integrator: NAMNetboxIntegrator,
  prefixes: NetboxPrefix[],
) => {
  const ipAddresses = prefixes.map((prefix: NetboxPrefix) => {
    return prefix.prefix as string;
  });

  const securityGroup: VMwareNSXGroup = ipAddresses.length > 0
    ? {
      expression: [
        {
          ip_addresses: ipAddresses,
          resource_type: "IPAddressExpression",
        },
      ],
      display_name: `nsg-${integrator.nsx_group_name}`,
      description: "Managed by NAM",
      tags: integrator.nsx_group_scope && integrator.nsx_group_tag
        ? [
          {
            scope: integrator.nsx_group_scope,
            tag: integrator.nsx_group_tag,
          },
        ]
        : [],
    }
    : {
      display_name: `nsg-${integrator.nsx_group_name}`,
      description: "Managed by NAM",
      tags: integrator.nsx_group_scope && integrator.nsx_group_tag
        ? [
          {
            scope: integrator.nsx_group_scope,
            tag: integrator.nsx_group_tag,
          },
        ]
        : [],
    };
  return securityGroup;
};
