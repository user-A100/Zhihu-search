(() => {
  const STORAGE_KEY = "zhicang-mobile-state";
  const listeners = [];

  function nativePlugins() {
    return globalThis.Capacitor?.Plugins || {};
  }

  function preferencesPlugin() {
    return nativePlugins().Preferences || null;
  }

  async function readState() {
    const preferences = preferencesPlugin();
    let serialized = "";
    if (preferences) {
      const result = await preferences.get({ key: STORAGE_KEY });
      serialized = result.value || "";
    } else {
      serialized = localStorage.getItem(STORAGE_KEY) || "";
    }

    if (!serialized) return {};
    try {
      return JSON.parse(serialized);
    } catch {
      return {};
    }
  }

  async function writeState(value) {
    const serialized = JSON.stringify(value);
    const preferences = preferencesPlugin();
    if (preferences) {
      await preferences.set({ key: STORAGE_KEY, value: serialized });
    } else {
      localStorage.setItem(STORAGE_KEY, serialized);
    }
  }

  if (!globalThis.chrome?.storage?.local) {
    globalThis.zhicangMobileStorage = {
      local: {
        async get(keys) {
          const all = await readState();
          if (!keys) return all;
          return Object.fromEntries(keys.map((key) => [key, all[key]]));
        },
        async set(patch) {
          const before = await readState();
          const next = { ...before, ...patch };
          await writeState(next);
          const changes = Object.fromEntries(
            Object.entries(patch).map(([key, value]) => [
              key,
              { oldValue: before[key], newValue: value }
            ])
          );
          listeners.forEach((listener) => listener(changes, "local"));
        },
        async clear() {
          const before = await readState();
          await writeState({});
          const changes = Object.fromEntries(
            Object.entries(before).map(([key, value]) => [
              key,
              { oldValue: value, newValue: undefined }
            ])
          );
          listeners.forEach((listener) => listener(changes, "local"));
        }
      },
      onChanged: {
        addListener(listener) {
          listeners.push(listener);
        }
      }
    };
  }

  const sessionPlugin = () => nativePlugins().ZhihuSession || null;
  globalThis.ZhicangNative = {
    isNative: Boolean(globalThis.Capacitor?.isNativePlatform?.()),
    isAvailable() {
      return Boolean(sessionPlugin());
    },
    async getSessionStatus() {
      const plugin = sessionPlugin();
      return plugin ? plugin.getSessionStatus() : { loggedIn: false };
    },
    async openLogin() {
      const plugin = sessionPlugin();
      if (!plugin) throw new Error("当前版本未连接知乎登录组件。");
      return plugin.openLogin({ url: "https://www.zhihu.com/signin" });
    },
    async clearSession() {
      const plugin = sessionPlugin();
      if (!plugin) return { loggedIn: false };
      return plugin.clearSession();
    },
    async requestJson(url) {
      const plugin = sessionPlugin();
      if (!plugin) throw new Error("当前版本未连接知乎登录组件。");
      const response = await plugin.request({ url });
      return {
        ok: Boolean(response.ok),
        status: Number(response.status || 0),
        body: String(response.body || "")
      };
    }
  };
})();
