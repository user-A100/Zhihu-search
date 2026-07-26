// Lets the dashboard be previewed from a local web server. In the installed
// extension Chrome provides the real API, so this file does nothing.
if (location.protocol === "http:" || location.protocol === "https:" || location.protocol === "file:") {
  const listeners = [];
  let previewData = {};
  const read = () => previewData;
  const write = (value) => {
    previewData = value;
  };
  globalThis.zhicangPreviewStorage = {
    local: {
        async get(keys) {
          const all = read();
          if (!keys) return all;
          return Object.fromEntries(keys.map((key) => [key, all[key]]));
        },
        async set(patch) {
          const before = read();
          write({ ...before, ...patch });
          const changes = Object.fromEntries(
            Object.entries(patch).map(([key, value]) => [key, { oldValue: before[key], newValue: value }])
          );
          listeners.forEach((listener) => listener(changes, "local"));
        },
        async clear() {
          previewData = {};
        }
      },
    onChanged: {
      addListener(listener) {
        listeners.push(listener);
      }
    }
  };
}
