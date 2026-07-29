import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const previewRuntimeSource = await readFile(
  new URL("../src/preview-runtime.js", import.meta.url),
  "utf8"
);
const mobileRuntimeSource = await readFile(
  new URL("../src/mobile-runtime.js", import.meta.url),
  "utf8"
);

function runRuntime(source, values = {}) {
  const context = vm.createContext({
    ...values,
    globalThis: null
  });
  context.globalThis = context;
  vm.runInContext(source, context);
  return context;
}

test("preview storage does not replace native app storage", () => {
  const context = runRuntime(previewRuntimeSource, {
    location: { protocol: "https:" },
    Capacitor: { isNativePlatform: () => true }
  });

  assert.equal(context.zhicangPreviewStorage, undefined);
});

test("mobile runtime uses Capacitor Preferences and the native session plugin", async () => {
  let serialized = "";
  const context = runRuntime(mobileRuntimeSource, {
    localStorage: {
      getItem: () => "",
      setItem: () => {}
    },
    Capacitor: {
      isNativePlatform: () => true,
      Plugins: {
        Preferences: {
          get: async () => ({ value: serialized }),
          set: async ({ value }) => {
            serialized = value;
          }
        },
        ZhihuSession: {
          getSessionStatus: async () => ({ loggedIn: true }),
          request: async () => ({ ok: true, status: 200, body: "{\"data\":[]}" })
        }
      }
    }
  });

  await context.zhicangMobileStorage.local.set({ profile: "demo-user" });
  const stored = await context.zhicangMobileStorage.local.get(["profile"]);
  const session = await context.ZhicangNative.getSessionStatus();
  const response = await context.ZhicangNative.requestJson("https://www.zhihu.com/api/v4/collections/1");

  assert.equal(stored.profile, "demo-user");
  assert.equal(session.loggedIn, true);
  assert.equal(response.status, 200);
  assert.equal(response.body, "{\"data\":[]}");
});
