import type { Target } from "~/types";

export function useTargetsApi() {
  const { needLogin } = useAuthState();
  const targets = ref<Target[]>([]);
  const loading = ref(false);
  const error = ref("");

  async function load(groupId: string): Promise<void> {
    loading.value = true;
    error.value = "";
    needLogin.value = false;
    try {
      const data = await apiFetch<{ targets?: Target[] }>(
        `/admin/api/groups/${encodeURIComponent(groupId)}/targets`,
      );
      targets.value = data.targets ?? [];
    } catch (err) {
      if (!needLogin.value) error.value = err instanceof Error ? err.message : String(err);
    } finally {
      loading.value = false;
    }
  }

  async function save(groupId: string, next: Target[]): Promise<void> {
    await apiFetch(`/admin/api/groups/${encodeURIComponent(groupId)}/targets`, {
      method: "PUT",
      body: JSON.stringify({ targets: next }),
    });
    targets.value = next;
  }

  return { targets, loading, needLogin, error, load, save };
}
