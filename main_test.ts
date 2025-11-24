/**
 * Test suite for IPAM-Firewall-SSI
 * Tests utility functions, mappers, and service logic
 */

import { assertEquals, assertExists, assertThrows } from "@std/assert";
import { mapper, mapper6, getAddGrpMemberChanges } from "./ssi/ssi.utils.ts";
import {
  type NetboxPrefix,
  type FortiOSFirewallAddrGrp,
  EnvLoader,
} from "@nhn/zeniki";
import { SSIWorker } from "./ssi/ssi.worker.ts";

const SECRETS_PATH = Deno.env.get("SECRETS_PATH") ?? undefined;
const CONFIG_PATH = Deno.env.get("CONFIG_PATH") ?? undefined;

new EnvLoader(SECRETS_PATH, CONFIG_PATH);

// ============================================================================
// Utility Function Tests
// ============================================================================

Deno.test("mapper: should filter and map IPv4 prefixes correctly", () => {
  const mockPrefixes: NetboxPrefix[] = [
    {
      id: 1,
      prefix: "192.168.1.0/24",
      family: { value: 4, label: "IPv4" },
      display: "192.168.1.0/24",
      vlan: { name: "Production" },
    } as NetboxPrefix,
    {
      id: 2,
      prefix: "10.0.0.0/8",
      family: { value: 4, label: "IPv4" },
      display: "10.0.0.0/8",
      vlan: null,
    } as NetboxPrefix,
  ];

  const result = mapper(mockPrefixes);

  assertEquals(result.length, 2);
  assertEquals(result[0].name, "netbox_192.168.1.0/24");
  assertEquals(result[0].subnet, "192.168.1.0 255.255.255.0");
  assertEquals(result[0].comment, "production");
  assertEquals(result[0].color, 0);

  assertEquals(result[1].name, "netbox_10.0.0.0/8");
  assertEquals(result[1].subnet, "10.0.0.0 255.0.0.0");
  assertEquals(result[1].comment, undefined);
});

Deno.test("mapper: should return empty array for IPv6 prefixes", () => {
  const mockPrefixes: NetboxPrefix[] = [
    {
      id: 1,
      prefix: "2001:db8::/32",
      family: { value: 6, label: "IPv6" },
      display: "2001:db8::/32",
      vlan: null,
    } as NetboxPrefix,
  ];

  const result = mapper(mockPrefixes);
  assertEquals(result.length, 0);
});

Deno.test("mapper: should handle empty array", () => {
  const result = mapper([]);
  assertEquals(result.length, 0);
});

Deno.test("mapper6: should filter and map IPv6 prefixes correctly", () => {
  const mockPrefixes: NetboxPrefix[] = [
    {
      id: 1,
      prefix: "2001:db8::/32",
      family: { value: 6, label: "IPv6" },
      display: "2001:db8::/32",
      vlan: { name: "IPv6-Network" },
    } as NetboxPrefix,
    {
      id: 2,
      prefix: "fd00::/8",
      family: { value: 6, label: "IPv6" },
      display: "fd00::/8",
      vlan: null,
    } as NetboxPrefix,
  ];

  const result = mapper6(mockPrefixes);

  assertEquals(result.length, 2);
  assertEquals(result[0].name, "netbox6_2001:db8::/32");
  assertEquals(result[0].ip6, "2001:db8::/32");
  assertEquals(result[0].comment, "ipv6-network");

  assertEquals(result[1].name, "netbox6_fd00::/8");
  assertEquals(result[1].ip6, "fd00::/8");
  assertEquals(result[1].comment, undefined);
});

Deno.test("mapper6: should return empty array for IPv4 prefixes", () => {
  const mockPrefixes: NetboxPrefix[] = [
    {
      id: 1,
      prefix: "192.168.1.0/24",
      family: { value: 4, label: "IPv4" },
      display: "192.168.1.0/24",
      vlan: null,
    } as NetboxPrefix,
  ];

  const result = mapper6(mockPrefixes);
  assertEquals(result.length, 0);
});

Deno.test("mapper6: should handle empty array", () => {
  const result = mapper6([]);
  assertEquals(result.length, 0);
});

// ============================================================================
// Address Group Member Changes Tests
// ============================================================================

Deno.test("getAddGrpMemberChanges: should identify added members", () => {
  const existingGroup: FortiOSFirewallAddrGrp = {
    name: "test-group",
    member: [{ name: "addr1" }, { name: "addr2" }],
  };

  const newGroup: FortiOSFirewallAddrGrp = {
    name: "test-group",
    member: [
      { name: "addr1" },
      { name: "addr2" },
      { name: "addr3" },
      { name: "addr4" },
    ],
  };

  const changes = getAddGrpMemberChanges(existingGroup, newGroup);

  assertEquals(changes.added.length, 2);
  assertEquals(changes.added.includes("addr3"), true);
  assertEquals(changes.added.includes("addr4"), true);
  assertEquals(changes.removed.length, 0);
});

Deno.test("getAddGrpMemberChanges: should identify removed members", () => {
  const existingGroup: FortiOSFirewallAddrGrp = {
    name: "test-group",
    member: [{ name: "addr1" }, { name: "addr2" }, { name: "addr3" }],
  };

  const newGroup: FortiOSFirewallAddrGrp = {
    name: "test-group",
    member: [{ name: "addr1" }],
  };

  const changes = getAddGrpMemberChanges(existingGroup, newGroup);

  assertEquals(changes.added.length, 0);
  assertEquals(changes.removed.length, 2);
  assertEquals(changes.removed.includes("addr2"), true);
  assertEquals(changes.removed.includes("addr3"), true);
});

Deno.test(
  "getAddGrpMemberChanges: should identify both added and removed members",
  () => {
    const existingGroup: FortiOSFirewallAddrGrp = {
      name: "test-group",
      member: [{ name: "addr1" }, { name: "addr2" }, { name: "addr3" }],
    };

    const newGroup: FortiOSFirewallAddrGrp = {
      name: "test-group",
      member: [{ name: "addr1" }, { name: "addr4" }, { name: "addr5" }],
    };

    const changes = getAddGrpMemberChanges(existingGroup, newGroup);

    assertEquals(changes.added.length, 2);
    assertEquals(changes.added.includes("addr4"), true);
    assertEquals(changes.added.includes("addr5"), true);
    assertEquals(changes.removed.length, 2);
    assertEquals(changes.removed.includes("addr2"), true);
    assertEquals(changes.removed.includes("addr3"), true);
  }
);

Deno.test(
  "getAddGrpMemberChanges: should return empty arrays when no changes",
  () => {
    const existingGroup: FortiOSFirewallAddrGrp = {
      name: "test-group",
      member: [{ name: "addr1" }, { name: "addr2" }],
    };

    const newGroup: FortiOSFirewallAddrGrp = {
      name: "test-group",
      member: [{ name: "addr1" }, { name: "addr2" }],
    };

    const changes = getAddGrpMemberChanges(existingGroup, newGroup);

    assertEquals(changes.added.length, 0);
    assertEquals(changes.removed.length, 0);
  }
);

Deno.test(
  "getAddGrpMemberChanges: should throw error when existingGroup is undefined",
  () => {
    const newGroup: FortiOSFirewallAddrGrp = {
      name: "test-group",
      member: [{ name: "addr1" }],
    };

    assertThrows(
      () => {
        getAddGrpMemberChanges(
          undefined as unknown as FortiOSFirewallAddrGrp,
          newGroup
        );
      },
      Error,
      "FortiOS member group(s) cannot be undefined"
    );
  }
);

Deno.test(
  "getAddGrpMemberChanges: should throw error when newGroup is undefined",
  () => {
    const existingGroup: FortiOSFirewallAddrGrp = {
      name: "test-group",
      member: [{ name: "addr1" }],
    };

    assertThrows(
      () => {
        getAddGrpMemberChanges(
          existingGroup,
          undefined as unknown as FortiOSFirewallAddrGrp
        );
      },
      Error,
      "FortiOS member group(s) cannot be undefined"
    );
  }
);

// ============================================================================
// Environment Variable Tests
// ============================================================================
if (Deno.args[0] === "e2e") {
  Deno.test("Environment: should have required config variables", () => {
    // These should be set from config.yaml or environment
    const NAM_URL = Deno.env.get("NAM_URL");
    const NAM_TOKEN = Deno.env.get("NAM_TOKEN");
    const NAM_TEST_INT = Deno.env.get("NAM_TEST_INT");
    const SSI_NAME = Deno.env.get("SSI_NAME");
    const SSI_PRIORITY = Deno.env.get("SSI_PRIORITY");
    const SSI_INTERVAL = Deno.env.get("SSI_INTERVAL");

    assertExists(NAM_URL);
    assertExists(NAM_TOKEN);
    assertExists(NAM_TEST_INT);
    assertExists(SSI_NAME);
    assertExists(SSI_PRIORITY);
    assertExists(SSI_INTERVAL);
  });

  Deno.test("Environment: should have CRON_MODE variable", () => {
    const CRON_MODE = Deno.env.get("CRON_MODE");
    // CRON_MODE can be undefined, "true", or "false"
    // Just verify it's a valid value if set
    if (CRON_MODE !== undefined) {
      assertEquals(["true", "false"].includes(CRON_MODE), true);
    }
  });

  Deno.test("Environment: should have timeout configuration", () => {
    const REQUEST_TIMEOUT = Deno.env.get("REQUEST_TIMEOUT");
    if (REQUEST_TIMEOUT) {
      const timeout = parseInt(REQUEST_TIMEOUT);
      assertEquals(typeof timeout, "number");
      assertEquals(timeout > 0, true);
    }
  });

  // ============================================================================
  // Integration Tests (E2E - requires actual API access)
  // ============================================================================

  Deno.test(
    "SSIWorker: should initialize correctly with NAM credentials",
    () => {
      const NAM_URL = Deno.env.get("NAM_URL");
      const NAM_TOKEN = Deno.env.get("NAM_TOKEN");
      const NAM_TEST_INT = Deno.env.get("NAM_TEST_INT");

      assertExists(NAM_URL);
      assertExists(NAM_TOKEN);
      assertExists(NAM_TEST_INT);
      const worker = new SSIWorker();
      assertEquals(worker.isRunning, false);
    }
  );

  Deno.test(
    "SSIWorker: should complete work execution successfully",
    async () => {
      const NAM_URL = Deno.env.get("NAM_URL");
      const NAM_TOKEN = Deno.env.get("NAM_TOKEN");
      const NAM_TEST_INT = Deno.env.get("NAM_TEST_INT");
      const SSI_PRIORITY = Deno.env.get("SSI_PRIORITY");
      assertExists(NAM_URL);
      assertExists(NAM_TOKEN);
      assertExists(NAM_TEST_INT);

      const worker = new SSIWorker();
      const result = await worker.work(SSI_PRIORITY);
      assertEquals(result, 0); // Should return 0 on success
      assertEquals(worker.isRunning, false); // Should be false after completion
    }
  );

  Deno.test("SSIWorker: should handle different priority levels", async () => {
    const worker = new SSIWorker();
    const priorities = ["low", "medium", "high"];

    for (const priority of priorities) {
      const result = await worker.work(priority);
      assertEquals(result, 0);
      assertEquals(worker.isRunning, false);
    }
  });
}
