import { describe, it, expect } from "bun:test";
import { defaultTargetName, targetToKey } from "../server/lib/targets";
import { hydrateRouteTargets, migrateTargets } from "../server/lib/storage/migrate-targets";
import type { Route, Target } from "../server/lib/types";

describe("targets domain & migration", () => {
  it("generates deterministic keys for targets", () => {
    expect(targetToKey({ platform: "discord", channelId: "123", threadId: "456" })).toBe("discord:123:456");
    expect(targetToKey({ platform: "discord", channelId: "123" })).toBe("discord:123:");
    expect(targetToKey({ platform: "telegram", chatId: "-1001", topicId: "99" })).toBe("telegram:-1001:99");
    expect(targetToKey({ platform: "feishu", chatId: "oc_abc" })).toBe("feishu:oc_abc");
  });

  it("generates friendly default names for targets", () => {
    expect(defaultTargetName({ platform: "discord", channelId: "123" }, 1)).toBe("Discord (#123)");
    expect(defaultTargetName({ platform: "telegram", chatId: "-1001" }, 2)).toBe("Telegram (-1001)");
    expect(defaultTargetName({ platform: "telegram", chatId: "-1001", topicId: "5" })).toBe("Telegram (-1001#5)");
    expect(defaultTargetName({ platform: "feishu", chatId: "oc_abc" }, 3)).toBe("Feishu (oc_abc)");
  });

  it("hydrates route targets from group targets pool", () => {
    const targets: Target[] = [
      {
        id: "tg-1",
        groupId: "grp-1",
        name: "Alerts Channel",
        platform: "discord",
        channelId: "12345",
      },
      {
        id: "tg-2",
        groupId: "grp-1",
        name: "Dev Chat",
        platform: "telegram",
        chatId: "-999",
      },
    ];

    const routes: Route[] = [
      {
        id: "r1",
        name: "Route 1",
        enabled: true,
        groupId: "grp-1",
        filters: [],
        targets: [],
        targetIds: ["tg-1", "tg-2"],
      },
      {
        id: "r2",
        name: "Route 2",
        enabled: true,
        groupId: "grp-1",
        filters: [],
        targets: [{ platform: "discord", channelId: "legacy" }],
      },
    ];

    const hydrated = hydrateRouteTargets(routes, targets);
    expect(hydrated[0].targets).toEqual([
      { platform: "discord", channelId: "12345", threadId: undefined, chatId: undefined, topicId: undefined },
      { platform: "telegram", channelId: undefined, threadId: undefined, chatId: "-999", topicId: undefined },
    ]);
    expect(hydrated[1].targets).toEqual([{ platform: "discord", channelId: "legacy" }]);
  });

  it("migrates and deduplicates identical inline targets within groups", async () => {
    const savedTargets: Target[] = [];
    const fakeDb = {
      prepare(sql: string) {
        return {
          bind(..._args: unknown[]) {
            return this;
          },
          async all(): Promise<{ results: Target[] }> {
            if (sql.includes("FROM d1_targets")) {
              return { results: savedTargets };
            }
            return { results: [] };
          },
        };
      },
      async batch(stmts: unknown[]) {
        void stmts;
        return [];
      },
    } as unknown as D1Database;

    const routes: Route[] = [
      {
        id: "r1",
        name: "Route 1",
        enabled: true,
        groupId: "team-a",
        filters: [],
        targets: [
          { platform: "discord", channelId: "100" },
          { platform: "telegram", chatId: "200" },
        ],
      },
      {
        id: "r2",
        name: "Route 2",
        enabled: true,
        groupId: "team-a",
        filters: [],
        targets: [
          // Identical target to Route 1's Discord target
          { platform: "discord", channelId: "100" },
        ],
      },
      {
        id: "r3",
        name: "Route 3",
        enabled: true,
        groupId: "team-b",
        filters: [],
        targets: [
          // Same channel ID, but in different group -> should be independent target
          { platform: "discord", channelId: "100" },
        ],
      },
    ];

    const res = await migrateTargets(fakeDb, routes);
    expect(res.targetsCreated).toBe(3); // 2 in team-a, 1 in team-b
    expect(res.routes[0].targetIds?.length).toBe(2);
    expect(res.routes[1].targetIds?.length).toBe(1);
    // r1 and r2 share the same Discord target ID in team-a
    expect(res.routes[0].targetIds?.[0]).toBe(res.routes[1].targetIds?.[0]);
    // team-b target is separate
    expect(res.routes[2].targetIds?.[0]).not.toBe(res.routes[0].targetIds?.[0]);
  });
});
