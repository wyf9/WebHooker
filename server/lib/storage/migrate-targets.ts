import type { Route, Target } from "../types";
import { defaultTargetName, loadTargets, saveTargets, targetToKey, targetToRouteTarget } from "../targets";
import { log } from "../lib/log";

/**
 * Migrates legacy inline targets on routes to group-level Targets in `d1_targets`,
 * deduplicating identical targets within each group and assigning targetIds to routes.
 */
export async function migrateTargets(
  db: D1Database,
  routes: Route[],
): Promise<{ targetsCreated: number; routesUpdated: number; routes: Route[] }> {
  try {
    const existingTargets = await loadTargets(db);
    const targetsByGroup = new Map<string, Map<string, Target>>();

    for (const t of existingTargets) {
      let groupMap = targetsByGroup.get(t.groupId);
      if (!groupMap) {
        groupMap = new Map();
        targetsByGroup.set(t.groupId, groupMap);
      }
      groupMap.set(targetToKey(t), t);
    }

    let targetsCreated = 0;
    let routesUpdated = 0;
    const newTargetsToSave: Target[] = [];
    const updatedRoutes: Route[] = [];

    for (const route of routes) {
      const groupId = route.groupId || "default";
      let groupTargets = targetsByGroup.get(groupId);
      if (!groupTargets) {
        groupTargets = new Map();
        targetsByGroup.set(groupId, groupTargets);
      }

      const existingTargetIds = route.targetIds ? [...route.targetIds] : [];
      let routeChanged = false;

      if (route.targets && route.targets.length > 0) {
        for (const rt of route.targets) {
          const key = targetToKey(rt);
          let target = groupTargets.get(key);

          if (!target) {
            const nextIdx = groupTargets.size + 1;
            target = {
              id: `tg-${crypto.randomUUID().slice(0, 8)}`,
              groupId,
              name: defaultTargetName(rt, nextIdx),
              platform: rt.platform ?? "discord",
              channelId: rt.channelId,
              threadId: rt.threadId,
              chatId: rt.chatId,
              topicId: rt.topicId,
              createdAt: Date.now(),
              updatedAt: Date.now(),
            };
            groupTargets.set(key, target);
            newTargetsToSave.push(target);
            targetsCreated++;
          }

          if (!existingTargetIds.includes(target.id)) {
            existingTargetIds.push(target.id);
            routeChanged = true;
          }
        }
      }

      if (routeChanged || !route.targetIds) {
        routesUpdated++;
        updatedRoutes.push({
          ...route,
          targetIds: existingTargetIds,
        });
      } else {
        updatedRoutes.push(route);
      }
    }

    if (newTargetsToSave.length > 0) {
      await saveTargets(db, [...existingTargets, ...newTargetsToSave]);
      log.info({ count: newTargetsToSave.length }, "Migrated legacy inline targets to d1_targets");
    }

    return {
      targetsCreated,
      routesUpdated,
      routes: updatedRoutes,
    };
  } catch (err) {
    log.error({ err }, "Failed to migrate targets");
    return { targetsCreated: 0, routesUpdated: 0, routes };
  }
}

/**
 * Hydrates routes with target objects from group targets if targetIds are present.
 */
export function hydrateRouteTargets(routes: Route[], targets: Target[]): Route[] {
  const targetMap = new Map<string, Target>();
  for (const t of targets) {
    targetMap.set(`${t.groupId}:${t.id}`, t);
  }

  return routes.map((r) => {
    if (!r.targetIds || r.targetIds.length === 0) {
      return r;
    }
    const groupId = r.groupId || "default";
    const resolvedTargets = r.targetIds
      .map((id) => targetMap.get(`${groupId}:${id}`))
      .filter((t): t is Target => Boolean(t))
      .map(targetToRouteTarget);

    return {
      ...r,
      targets: resolvedTargets.length > 0 ? resolvedTargets : r.targets,
    };
  });
}
