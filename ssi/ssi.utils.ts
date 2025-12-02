/**
 * SSI Utilities - Helper functions for IPAM-Firewall synchronization
 * Provides mapping and comparison utilities for firewall address objects
 */

import {
  FortiOSFirewallAddress,
  FortiOSFirewallAddress6,
  FortiOSFirewallAddrGrp,
  FortiOSFirewallAddrGrp6,
  NetboxPrefix,
  NetboxVlan,
} from "@norskhelsenett/zeniki";
import { IPv4CidrRange } from "ip-num";
import differenceWith from "lodash.differencewith";

/**
 * Maps Netbox IPv4 prefixes to FortiOS firewall address objects
 * Converts CIDR notation to subnet/mask format required by FortiOS
 *
 * @param prefixes - Array of Netbox prefixes (filters IPv4 only)
 * @returns Array of FortiOS firewall address objects
 *
 * @example
 * ```ts
 * const addresses = mapper([
 *   { prefix: '10.0.0.0/24', family: { value: 4 }, vlan: { name: 'Production' } }
 * ]);
 * // Returns: [{ name: 'netbox_10.0.0.0/24', subnet: '10.0.0.0 255.255.255.0', comment: 'production' }]
 * ```
 */
export const mapper = (prefixes: NetboxPrefix[]) => {
  const list: FortiOSFirewallAddress[] = prefixes
    .filter((_prefix: NetboxPrefix) => {
      return _prefix?.family?.value === 4;
    })
    .map((_prefix: NetboxPrefix) => {
      return {
        name: `netbox_${_prefix.prefix}`,
        comment: _prefix.vlan && (_prefix.vlan as NetboxVlan).name
          ? (_prefix.vlan as NetboxVlan).name.toLowerCase()
          : undefined,
        subnet: `${_prefix?.prefix?.split("/")[0]} ${
          IPv4CidrRange.fromCidr(
            _prefix.prefix as string,
          )
            .getPrefix()
            .toMask()
            .toString()
        }`,
        color: 0,
      } as FortiOSFirewallAddress;
    });

  return list ?? [];
};

/**
 * Maps Netbox IPv6 prefixes to FortiOS firewall IPv6 address objects
 * Preserves CIDR notation as FortiOS supports it natively for IPv6
 *
 * @param prefixes - Array of Netbox prefixes (filters IPv6 only)
 * @returns Array of FortiOS firewall IPv6 address objects
 *
 * @example
 * ```ts
 * const addresses = mapper6([
 *   { prefix: '2001:db8::/32', family: { value: 6 }, display: '2001:db8::/32' }
 * ]);
 * // Returns: [{ name: 'netbox6_2001:db8::/32', ip6: '2001:db8::/32' }]
 * ```
 */
export const mapper6 = (prefixes: NetboxPrefix[]) => {
  const list6: FortiOSFirewallAddress6[] = prefixes
    .filter((_prefix: NetboxPrefix) => {
      return _prefix?.family?.value === 6;
    })
    .map((_prefix: NetboxPrefix) => {
      return {
        name: `netbox6_${_prefix.display}`,
        comment: _prefix.vlan && (_prefix.vlan as NetboxVlan).name
          ? (_prefix.vlan as NetboxVlan).name.toLowerCase()
          : undefined,
        ip6: _prefix.prefix,
      } as FortiOSFirewallAddress6;
    });

  return list6 ?? [];
};

/**
 * Compares existing and new address group members to identify changes
 * Returns lists of added and removed member names for update operations
 *
 * @param existingGroup - Current firewall address group
 * @param newGroup - Updated firewall address group
 * @returns Object with added and removed member name arrays
 * @throws Error if either group is undefined
 *
 * @example
 * ```ts
 * const changes = getAddGrpMemberChanges(
 *   { name: 'grp_prod', member: [{ name: 'net_10.0.0.0/24' }] },
 *   { name: 'grp_prod', member: [{ name: 'net_10.0.1.0/24' }] }
 * );
 * // Returns: { added: ['net_10.0.1.0/24'], removed: ['net_10.0.0.0/24'] }
 * ```
 */
export const getAddGrpMemberChanges = (
  existingGroup: FortiOSFirewallAddrGrp | FortiOSFirewallAddrGrp6,
  newGroup: FortiOSFirewallAddrGrp | FortiOSFirewallAddrGrp6,
) => {
  if (!existingGroup || !newGroup) {
    throw new Error("FortiOS member group(s) cannot be undefined");
  }

  const compareMembers = (
    array1Value: { name: string },
    array2Value: { name: string },
  ) => {
    return array1Value.name === array2Value.name;
  };

  // Find members in existingGroup not in newGroup
  const removed = differenceWith(
    existingGroup.member,
    newGroup.member,
    compareMembers,
  ) as { name: string }[];

  // Find members in newGroup not in existingGroup
  const added = differenceWith(
    newGroup.member,
    existingGroup.member,
    compareMembers,
  ) as { name: string }[];

  return {
    added: added.map((member: { name: string }) => {
      return member.name;
    }),
    removed: removed.map((member: { name: string }) => {
      return member.name;
    }),
  };
};
