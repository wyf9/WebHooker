import type { RouteTarget, Target } from "./types";
import { log } from "./lib/log";

export type { Target };

interface D1TargetRow {
  id: string;
  group_id: string;
  name: string;
  platform: string;
  channel_id: string | null;
  thread_id: string | null;
  chat_id: string | null;
  topic_id: string | null;
  created_at: number;
  updated_at: number;
}

export function targetToKey(t: RouteTarget): string {
  const p = t.platform ?? "discord";
  if (p === "telegram") {
    return `telegram:${t.chatId ?? ""}:${t.topicId ?? ""}`;
  }
  if (p === "feishu") {
    return `feishu:${t.chatId ?? ""}`;
  }
  return `discord:${t.channelId ?? ""}:${t.threadId ?? ""}`;
}

export function defaultTargetName(t: RouteTarget, index?: number): string {
  const p = t.platform ?? "discord";
  if (p === "telegram") {
    return t.topicId ? `Telegram (${t.chatId}#${t.topicId})` : `Telegram (${t.chatId ?? (index !== undefined ? `Target ${index}` : "Target")})`;
  }
  if (p === "feishu") {
    return `Feishu (${t.chatId ?? (index !== undefined ? `Target ${index}` : "Target")})`;
  }
  return t.threadId ? `Discord (#${t.channelId}#${t.threadId})` : `Discord (#${t.channelId ?? (index !== undefined ? `Target ${index}` : "Target")})`;
}

export function targetToRouteTarget(t: Target): RouteTarget {
  return {
    platform: t.platform,
    channelId: t.channelId,
    threadId: t.threadId,
    chatId: t.chatId,
    topicId: t.topicId,
  };
}

export async function loadTargets(db: D1Database): Promise<Target[]> {
  try {
    const stmt = db.prepare(
      "SELECT id, group_id, name, platform, channel_id, thread_id, chat_id, topic_id, created_at, updated_at FROM d1_targets ORDER BY created_at ASC, id ASC",
    );
    if (typeof stmt.all !== "function") return [];
    const { results } = await stmt.all<D1TargetRow>();
    if (!results || results.length === 0) return [];
    return results.map((r) => ({
      id: r.id,
      groupId: r.group_id,
      name: r.name,
      platform: r.platform as "discord" | "telegram" | "feishu",
      channelId: r.channel_id ?? undefined,
      threadId: r.thread_id ?? undefined,
      chatId: r.chat_id ?? undefined,
      topicId: r.topic_id ?? undefined,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  } catch (err) {
    log.warn({ err }, "Failed to load targets from D1");
    return [];
  }
}

export async function saveTargets(db: D1Database, targets: Target[], groupId?: string): Promise<void> {
  const now = Date.now();
  const existing = await loadTargets(db);
  const relevantExisting = groupId ? existing.filter((t) => t.groupId === groupId) : existing;

  const existingKeys = new Set(relevantExisting.map((t) => `${t.id}:${t.groupId}`));
  const newKeys = new Set(targets.map((t) => `${t.id}:${t.groupId}`));

  const statements: D1PreparedStatement[] = [];

  for (const key of existingKeys) {
    if (!newKeys.has(key)) {
      const [id, gid] = key.split(":");
      statements.push(db.prepare("DELETE FROM d1_targets WHERE id = ? AND group_id = ?").bind(id, gid));
    }
  }

  for (const t of targets) {
    statements.push(
      db
        .prepare(
          `INSERT INTO d1_targets (id, group_id, name, platform, channel_id, thread_id, chat_id, topic_id, version, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
           ON CONFLICT(id, group_id) DO UPDATE SET
             name = excluded.name,
             platform = excluded.platform,
             channel_id = excluded.channel_id,
             thread_id = excluded.thread_id,
             chat_id = excluded.chat_id,
             topic_id = excluded.topic_id,
             updated_at = excluded.updated_at`,
        )
        .bind(
          t.id,
          t.groupId,
          t.name,
          t.platform,
          t.channelId ?? null,
          t.threadId ?? null,
          t.chatId ?? null,
          t.topicId ?? null,
          t.createdAt ?? now,
          now,
        ),
    );
  }

  if (statements.length > 0) {
    await db.batch(statements);
  }
}
