package com.zhicang.reader;

import android.app.Activity;
import android.content.Intent;
import android.webkit.CookieManager;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "ZhihuSession")
public class ZhihuSessionPlugin extends Plugin {
    private static final String ZHIHU_ORIGIN = "https://www.zhihu.com";
    private static final int MAX_RESPONSE_BYTES = 12 * 1024 * 1024;
    private static final Set<String> ALLOWED_HOSTS = new HashSet<>(
        Arrays.asList("www.zhihu.com", "zhuanlan.zhihu.com")
    );
    private final ExecutorService networkExecutor = Executors.newSingleThreadExecutor();

    @PluginMethod
    public void openLogin(PluginCall call) {
        String url = call.getString("url", ZHIHU_ORIGIN + "/signin");
        if (!isZhihuLoginUrl(url)) {
            call.reject("只允许打开知乎官方 HTTPS 登录页面。");
            return;
        }
        Intent intent = new Intent(getContext(), ZhihuLoginActivity.class);
        intent.putExtra(ZhihuLoginActivity.EXTRA_URL, url);
        startActivityForResult(call, intent, "loginResult");
    }

    @ActivityCallback
    private void loginResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        JSObject response = new JSObject();
        boolean loggedIn = result.getResultCode() == Activity.RESULT_OK &&
            result.getData() != null &&
            result.getData().getBooleanExtra(ZhihuLoginActivity.EXTRA_LOGGED_IN, false);
        response.put("loggedIn", loggedIn);
        call.resolve(response);
    }

    @PluginMethod
    public void getSessionStatus(PluginCall call) {
        JSObject response = new JSObject();
        response.put("loggedIn", hasLoginCookie());
        call.resolve(response);
    }

    @PluginMethod
    public void clearSession(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            CookieManager cookieManager = CookieManager.getInstance();
            cookieManager.removeAllCookies(value -> {
                cookieManager.flush();
                JSObject response = new JSObject();
                response.put("loggedIn", false);
                call.resolve(response);
            });
        });
    }

    @PluginMethod
    public void request(PluginCall call) {
        String rawUrl = call.getString("url", "");
        final URI uri;
        try {
            uri = URI.create(rawUrl);
        } catch (IllegalArgumentException error) {
            call.reject("请求地址无效。");
            return;
        }

        if (!"https".equalsIgnoreCase(uri.getScheme()) || !ALLOWED_HOSTS.contains(uri.getHost())) {
            call.reject("只允许请求知乎官方 HTTPS 地址。");
            return;
        }

        String cookies = CookieManager.getInstance().getCookie(ZHIHU_ORIGIN);
        networkExecutor.execute(() -> performRequest(call, rawUrl, cookies));
    }

    private void performRequest(PluginCall call, String rawUrl, String cookies) {
        HttpURLConnection connection = null;
        try {
            if (cookies == null || !cookies.contains("z_c0=")) {
                resolveHttpResponse(call, false, 401, "");
                return;
            }

            connection = (HttpURLConnection) new URL(rawUrl).openConnection();
            connection.setConnectTimeout(15000);
            connection.setReadTimeout(30000);
            connection.setInstanceFollowRedirects(false);
            connection.setRequestMethod("GET");
            connection.setRequestProperty("Accept", "application/json");
            connection.setRequestProperty("Accept-Language", "zh-CN,zh;q=0.9");
            connection.setRequestProperty("Cookie", cookies);
            connection.setRequestProperty("Referer", ZHIHU_ORIGIN + "/");
            connection.setRequestProperty("User-Agent", System.getProperty("http.agent", "Zhicang Android"));

            int status = connection.getResponseCode();
            InputStream stream = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
            String body = stream == null ? "" : readLimited(stream);
            resolveHttpResponse(call, status >= 200 && status < 300, status, body);
        } catch (Exception error) {
            call.reject("知乎请求失败：" + error.getMessage(), null, error);
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private String readLimited(InputStream stream) throws Exception {
        try (InputStream input = stream; ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            int total = 0;
            int read;
            while ((read = input.read(buffer)) != -1) {
                total += read;
                if (total > MAX_RESPONSE_BYTES) {
                    throw new IllegalStateException("知乎单次响应过大，请减小同步分页。");
                }
                output.write(buffer, 0, read);
            }
            return new String(output.toByteArray(), StandardCharsets.UTF_8);
        }
    }

    private void resolveHttpResponse(PluginCall call, boolean ok, int status, String body) {
        JSObject response = new JSObject();
        response.put("ok", ok);
        response.put("status", status);
        response.put("body", body);
        call.resolve(response);
    }

    private boolean hasLoginCookie() {
        String cookies = CookieManager.getInstance().getCookie(ZHIHU_ORIGIN);
        return cookies != null && cookies.contains("z_c0=");
    }

    private boolean isZhihuLoginUrl(String rawUrl) {
        try {
            URI uri = URI.create(rawUrl);
            String host = uri.getHost();
            return "https".equalsIgnoreCase(uri.getScheme()) &&
                host != null &&
                (host.equals("zhihu.com") || host.endsWith(".zhihu.com"));
        } catch (IllegalArgumentException error) {
            return false;
        }
    }

    @Override
    protected void handleOnDestroy() {
        networkExecutor.shutdownNow();
    }
}
