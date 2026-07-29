package com.zhicang.reader;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;
import androidx.activity.OnBackPressedCallback;
import androidx.appcompat.app.AppCompatActivity;

public class ZhihuLoginActivity extends AppCompatActivity {
    public static final String EXTRA_URL = "url";
    public static final String EXTRA_LOGGED_IN = "loggedIn";
    private static final String ZHIHU_ORIGIN = "https://www.zhihu.com";

    private WebView webView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setTitle("登录知乎");
        buildInterface();
        configureWebView();

        String initialUrl = getIntent().getStringExtra(EXTRA_URL);
        webView.loadUrl(
            initialUrl == null || initialUrl.trim().isEmpty()
                ? ZHIHU_ORIGIN + "/signin"
                : initialUrl
        );

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (webView.canGoBack()) webView.goBack();
                else finishWithResult(false);
            }
        });
    }

    private void buildInterface() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.rgb(243, 247, 247));

        LinearLayout toolbar = new LinearLayout(this);
        toolbar.setOrientation(LinearLayout.HORIZONTAL);
        toolbar.setGravity(Gravity.CENTER_VERTICAL);
        toolbar.setPadding(dp(12), dp(8), dp(12), dp(8));
        toolbar.setBackgroundColor(Color.rgb(243, 247, 247));

        Button closeButton = new Button(this);
        closeButton.setText("取消");
        closeButton.setTextSize(12);
        closeButton.setAllCaps(false);
        closeButton.setOnClickListener(view -> finishWithResult(false));

        LinearLayout titleGroup = new LinearLayout(this);
        titleGroup.setOrientation(LinearLayout.VERTICAL);
        titleGroup.setGravity(Gravity.CENTER);

        TextView title = new TextView(this);
        title.setText("在知藏中登录知乎");
        title.setTextColor(Color.rgb(16, 42, 50));
        title.setTextSize(15);
        title.setGravity(Gravity.CENTER);

        TextView domain = new TextView(this);
        domain.setText("zhihu.com 安全登录");
        domain.setTextColor(Color.rgb(94, 141, 128));
        domain.setTextSize(9);
        domain.setGravity(Gravity.CENTER);

        titleGroup.addView(title);
        titleGroup.addView(domain);

        Button doneButton = new Button(this);
        doneButton.setText("完成");
        doneButton.setTextSize(12);
        doneButton.setAllCaps(false);
        doneButton.setOnClickListener(view -> {
            if (hasLoginCookie()) {
                CookieManager.getInstance().flush();
                finishWithResult(true);
            } else {
                Toast.makeText(this, "请先完成知乎登录", Toast.LENGTH_SHORT).show();
            }
        });

        toolbar.addView(closeButton, new LinearLayout.LayoutParams(dp(72), ViewGroup.LayoutParams.WRAP_CONTENT));
        toolbar.addView(titleGroup, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        toolbar.addView(doneButton, new LinearLayout.LayoutParams(dp(72), ViewGroup.LayoutParams.WRAP_CONTENT));

        webView = new WebView(this);
        root.addView(toolbar, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        root.addView(webView, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));
        setContentView(root);
    }

    private void configureWebView() {
        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        cookieManager.setAcceptThirdPartyCookies(webView, true);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);

        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String host = uri.getHost();
                if (
                    "https".equalsIgnoreCase(uri.getScheme()) &&
                    host != null &&
                    (host.equals("zhihu.com") || host.endsWith(".zhihu.com"))
                ) {
                    return false;
                }

                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                } catch (Exception error) {
                    Toast.makeText(ZhihuLoginActivity.this, "无法打开外部登录页面", Toast.LENGTH_SHORT).show();
                }
                return true;
            }
        });
    }

    private boolean hasLoginCookie() {
        String cookies = CookieManager.getInstance().getCookie(ZHIHU_ORIGIN);
        return cookies != null && cookies.contains("z_c0=");
    }

    private void finishWithResult(boolean loggedIn) {
        Intent result = new Intent();
        result.putExtra(EXTRA_LOGGED_IN, loggedIn);
        setResult(loggedIn ? Activity.RESULT_OK : Activity.RESULT_CANCELED, result);
        finish();
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.stopLoading();
            webView.setWebChromeClient(null);
            webView.setWebViewClient(null);
            webView.destroy();
        }
        super.onDestroy();
    }
}
