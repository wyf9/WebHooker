<template>
  <div class="panel">
    <div class="panel-header">
      <div>
        <h3 class="panel-title">{{ t("targets.title") }}</h3>
        <p class="panel-desc">{{ t("targets.desc") }}</p>
      </div>
      <button
        v-if="canEdit"
        class="btn btn-accent text-xs"
        @click="openAdd"
      >
        + {{ t("targets.add") }}
      </button>
    </div>

    <p v-if="error" class="err mt-2">{{ error }}</p>

    <div v-if="loading" class="text-xs text-text-muted mt-3">
      {{ t("status.loading") }}
    </div>

    <div v-else-if="targets.length === 0" class="text-xs text-text-muted mt-3 italic">
      {{ t("targets.empty") }}
    </div>

    <div v-else class="targets-list mt-3 flex flex-col gap-2">
      <div
        v-for="target in targets"
        :key="target.id"
        class="target-item flex items-center justify-between p-2.5 rounded-lg border border-border bg-bg-surface hover:border-border-strong transition-colors"
      >
        <div class="flex items-center gap-2.5 overflow-hidden">
          <span
            class="badge text-[10px] font-mono px-1.5 py-0.5 rounded"
            :class="{
              'bg-[#5865F2]/15 text-[#5865F2]': target.platform === 'discord',
              'bg-[#229ED9]/15 text-[#229ED9]': target.platform === 'telegram',
              'bg-[#00D6B9]/15 text-[#00D6B9]': target.platform === 'feishu',
            }"
          >
            {{ target.platform }}
          </span>
          <span class="font-medium text-sm text-text-strong truncate">
            {{ target.name }}
          </span>
          <span class="text-xs text-text-muted font-mono truncate">
            <template v-if="target.platform === 'discord'">
              #{{ target.channelId }}<template v-if="target.threadId">/{{ target.threadId }}</template>
            </template>
            <template v-else-if="target.platform === 'telegram'">
              {{ target.chatId }}<template v-if="target.topicId">#{{ target.topicId }}</template>
            </template>
            <template v-else-if="target.platform === 'feishu'">
              {{ target.chatId }}
            </template>
          </span>
        </div>

        <div v-if="canEdit" class="flex items-center gap-1 shrink-0">
          <button
            class="icon-btn text-xs text-text-muted hover:text-text-strong p-1"
            :title="t('common.edit')"
            @click="openEdit(target)"
          >
            ✎
          </button>
          <button
            class="icon-btn danger text-xs text-red-400 hover:text-red-300 p-1"
            :title="t('common.delete')"
            @click="remove(target.id)"
          >
            ✕
          </button>
        </div>
      </div>
    </div>

    <!-- Edit/Add Modal or Inline Form -->
    <div
      v-if="modalOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      @click.self="modalOpen = false"
    >
      <div class="bg-bg-surface border border-border rounded-xl shadow-xl max-w-md w-full p-5 flex flex-col gap-4">
        <h4 class="font-semibold text-text-strong text-base">
          {{ editingId ? t("targets.editTitle") : t("targets.addTitle") }}
        </h4>

        <div class="flex flex-col gap-3 text-xs">
          <div>
            <label class="block text-text-muted mb-1 font-medium">{{ t("targets.name") }}</label>
            <input
              v-model="form.name"
              type="text"
              class="input w-full"
              placeholder="e.g. 生产告警频道"
            />
          </div>

          <div>
            <label class="block text-text-muted mb-1 font-medium">{{ t("targets.platform") }}</label>
            <select v-model="form.platform" class="input w-full">
              <option value="discord">Discord</option>
              <option value="telegram">Telegram</option>
              <option value="feishu">Feishu</option>
            </select>
          </div>

          <template v-if="form.platform === 'discord'">
            <div>
              <label class="block text-text-muted mb-1 font-medium">{{ t("targets.channelId") }}</label>
              <input
                v-model="form.channelId"
                type="text"
                class="input w-full font-mono"
                placeholder="123456789012345678"
              />
            </div>
            <div>
              <label class="block text-text-muted mb-1 font-medium">{{ t("targets.threadId") }} ({{ t("common.optional") }})</label>
              <input
                v-model="form.threadId"
                type="text"
                class="input w-full font-mono"
                placeholder="123456789012345678"
              />
            </div>
          </template>

          <template v-else-if="form.platform === 'telegram'">
            <div>
              <label class="block text-text-muted mb-1 font-medium">{{ t("targets.chatId") }}</label>
              <input
                v-model="form.chatId"
                type="text"
                class="input w-full font-mono"
                placeholder="-1001234567890"
              />
            </div>
            <div>
              <label class="block text-text-muted mb-1 font-medium">{{ t("targets.topicId") }} ({{ t("common.optional") }})</label>
              <input
                v-model="form.topicId"
                type="text"
                class="input w-full font-mono"
                placeholder="1234"
              />
            </div>
          </template>

          <template v-else-if="form.platform === 'feishu'">
            <div>
              <label class="block text-text-muted mb-1 font-medium">{{ t("targets.feishuChatId") }}</label>
              <input
                v-model="form.chatId"
                type="text"
                class="input w-full font-mono"
                placeholder="oc_xxxxxxxxxxxxxxxxxxxxxxxx"
              />
            </div>
          </template>
        </div>

        <p v-if="formError" class="err text-xs">{{ formError }}</p>

        <div class="flex justify-end gap-2 mt-2">
          <button class="btn btn-secondary text-xs" @click="modalOpen = false">
            {{ t("common.cancel") }}
          </button>
          <button class="btn btn-accent text-xs" :disabled="saving" @click="saveTarget">
            {{ saving ? t("status.saving") : t("common.save") }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Target } from "~/types";
import { useTargetsApi } from "~/composables/useTargets";

const props = defineProps<{
  groupId: string;
  canEdit: boolean;
}>();

const { t } = useI18n();
const { push } = useToasts();
const { targets, loading, error, load, save } = useTargetsApi();

const modalOpen = ref(false);
const editingId = ref<string | null>(null);
const saving = ref(false);
const formError = ref("");

const form = reactive({
  name: "",
  platform: "discord" as "discord" | "telegram" | "feishu",
  channelId: "",
  threadId: "",
  chatId: "",
  topicId: "",
});

watch(
  () => props.groupId,
  (gid) => {
    if (gid) load(gid);
  },
  { immediate: true },
);

function openAdd() {
  editingId.value = null;
  form.name = "";
  form.platform = "discord";
  form.channelId = "";
  form.threadId = "";
  form.chatId = "";
  form.topicId = "";
  formError.value = "";
  modalOpen.value = true;
}

function openEdit(target: Target) {
  editingId.value = target.id;
  form.name = target.name;
  form.platform = target.platform;
  form.channelId = target.channelId ?? "";
  form.threadId = target.threadId ?? "";
  form.chatId = target.chatId ?? "";
  form.topicId = target.topicId ?? "";
  formError.value = "";
  modalOpen.value = true;
}

async function remove(id: string) {
  if (!confirm(t("targets.confirmDelete"))) return;
  const next = targets.value.filter((t) => t.id !== id);
  try {
    await save(props.groupId, next);
    push(t("targets.deleteSuccess"), "ok");
  } catch (err) {
    push(err instanceof Error ? err.message : String(err), "bad");
  }
}

async function saveTarget() {
  formError.value = "";
  if (!form.name.trim()) {
    formError.value = t("targets.errName");
    return;
  }
  if (form.platform === "discord" && !form.channelId.trim()) {
    formError.value = t("targets.errChannelId");
    return;
  }
  if ((form.platform === "telegram" || form.platform === "feishu") && !form.chatId.trim()) {
    formError.value = t("targets.errChatId");
    return;
  }

  saving.value = true;
  try {
    const next = [...targets.value];
    if (editingId.value) {
      const idx = next.findIndex((t) => t.id === editingId.value);
      if (idx !== -1) {
        const cur = next[idx]!;
        next[idx] = {
          ...cur,
          id: cur.id,
          groupId: cur.groupId,
          name: form.name.trim(),
          platform: form.platform,
          channelId: form.platform === "discord" ? form.channelId.trim() : undefined,
          threadId: form.platform === "discord" ? form.threadId.trim() || undefined : undefined,
          chatId: form.platform !== "discord" ? form.chatId.trim() : undefined,
          topicId: form.platform === "telegram" ? form.topicId.trim() || undefined : undefined,
          updatedAt: Date.now(),
        };
      }
    } else {
      next.push({
        id: `tg-${crypto.randomUUID().slice(0, 8)}`,
        groupId: props.groupId,
        name: form.name.trim(),
        platform: form.platform,
        channelId: form.platform === "discord" ? form.channelId.trim() : undefined,
        threadId: form.platform === "discord" ? form.threadId.trim() || undefined : undefined,
        chatId: form.platform !== "discord" ? form.chatId.trim() : undefined,
        topicId: form.platform === "telegram" ? form.topicId.trim() || undefined : undefined,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }

    await save(props.groupId, next);
    modalOpen.value = false;
    push(t("targets.saveSuccess"), "ok");
  } catch (err) {
    formError.value = err instanceof Error ? err.message : String(err);
  } finally {
    saving.value = false;
  }
}
</script>
