package tw.edu.stust.council;

import android.app.Activity;
import android.content.Intent;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import androidx.browser.customtabs.CustomTabsIntent;

import java.security.SecureRandom;
import java.util.regex.Pattern;

/**
 * 學生會看板的安卓外殼：WebView 滿版顯示網站，上下系統列的顏色跟著網頁主題色。
 * - 只載入 https://stustsa.github.io/council/ ；其他網址一律丟給 Chrome／系統瀏覽器。
 * - Google 不讓內嵌畫面登入：網頁呼叫 CouncilApp.login() 時，這裡開 Chrome 跑 app-login.html（帶一次性 nonce），
 *   登入完成後用「指定本 App 套件名」的 intent 把 Google ID 憑證交回來；nonce 對得上、10 分鐘內、只能用一次才接受。
 */
public class MainActivity extends Activity {
    static final String PREFIX = "https://stustsa.github.io/council/";
    static final String HOME = PREFIX + "home.html";
    static final String LOGIN = PREFIX + "app-login.html";
    private static final Pattern TOKEN = Pattern.compile("^[A-Za-z0-9._-]{20,4096}$");
    private static final Pattern NONCE = Pattern.compile("^[A-Za-z0-9_-]{16,64}$");
    private static final Pattern RGB = Pattern.compile("^rgba?\\(\\s*(\\d{1,3})\\s*[, ]\\s*(\\d{1,3})\\s*[, ]\\s*(\\d{1,3}).*\\)$");
    private static final long NONCE_MS = 10 * 60 * 1000L;

    private FrameLayout root;
    private String insetCss = "";
    private WebView web;
    private BackHelper back;
    private static final String PREFS = "login";   /* App 私有的 SharedPreferences：撐得過程序被系統殺掉，別的 App 讀不到 */

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        Window w = getWindow();
        if (Build.VERSION.SDK_INT >= 30) {
            w.setDecorFitsSystemWindows(false);
        } else {
            w.getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
        }
        w.setStatusBarColor(Color.TRANSPARENT);
        w.setNavigationBarColor(Color.TRANSPARENT);
        if (Build.VERSION.SDK_INT >= 29) w.setNavigationBarContrastEnforced(false);

        root = new FrameLayout(this);
        root.setOnApplyWindowInsetsListener((v, ins) -> {
            int t, r, b, l, nav, kb;
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets sys = ins.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                int ime = ins.getInsets(WindowInsets.Type.ime()).bottom;
                t = sys.top; l = sys.left; r = sys.right; nav = sys.bottom;
                kb = ime > nav ? ime : 0;
            } else {
                t = ins.getSystemWindowInsetTop(); l = ins.getSystemWindowInsetLeft(); r = ins.getSystemWindowInsetRight();
                nav = ins.getStableInsetBottom();
                kb = ins.getSystemWindowInsetBottom() > nav ? ins.getSystemWindowInsetBottom() : 0;
            }
            /* 內容滿版延伸到系統列底下；只有鍵盤出現時才把底部縮上去，避免擋住輸入框 */
            v.setPadding(0, 0, 0, kb);
            float d = getResources().getDisplayMetrics().density;
            insetCss = "var e=document.documentElement.style;e.setProperty('--sa-top','" + (t / d) + "px');e.setProperty('--sa-left','" + (l / d)
                    + "px');e.setProperty('--sa-right','" + (r / d) + "px');e.setProperty('--sa-bottom','" + (kb > 0 ? 0 : nav / d) + "px');";
            pushInsets();
            return Build.VERSION.SDK_INT >= 30 ? WindowInsets.CONSUMED : ins.consumeSystemWindowInsets();
        });
        web = new WebView(this);
        root.addView(web, new FrameLayout.LayoutParams(-1, -1));
        setContentView(root);
        setBarColor(defaultColor());   /* 要在 setContentView 之後：DecorView 建好了才能設系統列圖示明暗 */

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        CookieManager.getInstance().setAcceptCookie(true);
        web.addJavascriptInterface(new Bridge(), "CouncilApp");
        web.setBackgroundColor(Color.TRANSPARENT);
        web.setDownloadListener((url, ua, cd, mime, len) -> openExternal(Uri.parse(url)));
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest req) {
                if (!req.isForMainFrame()) return false;
                if (req.getUrl().toString().startsWith(PREFIX)) return false;
                openExternal(req.getUrl());
                return true;
            }

            @Override
            public void onPageStarted(WebView v, String url, Bitmap icon) { pushInsets(); }

            @Override
            public void onPageCommitVisible(WebView v, String url) { pushInsets(); }

            @Override
            public void onPageFinished(WebView v, String url) {
                pushInsets();
                v.evaluateJavascript(
                        "(function(){if(window.__tcObs)return;window.__tcObs=1;"
                        + "function s(){var m=document.querySelector('meta[name=\"theme-color\"]');if(m&&window.CouncilApp)CouncilApp.themeColor(m.content)}"
                        + "s();new MutationObserver(s).observe(document.head,{childList:true,subtree:true,attributes:true,attributeFilter:['content']})})()", null);
                syncBack();
            }

            @Override
            public void doUpdateVisitedHistory(WebView v, String url, boolean reload) { syncBack(); }
        });

        if (Build.VERSION.SDK_INT >= 33) back = new BackHelper(this, web, () -> { if (web.canGoBack()) web.goBack(); });
        if (state != null) web.restoreState(state); else web.loadUrl(HOME);
        handleIntent(getIntent());
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        if (web != null) web.saveState(out);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIntent(intent);
    }

    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack(); else super.onBackPressed();
    }

    /** 網頁裡可以返回上一頁時才接手返回鍵；在最上層時交給系統，才會有「返回桌面」的預測動畫 */
    private void syncBack() {
        if (back != null) back.set(web.canGoBack());
    }

    private int defaultColor() {
        boolean night = (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
        return night ? 0xFF000000 : 0xFFF5F0E1;
    }

    private void setBarColor(int c) {
        root.setBackgroundColor(c);
        getWindow().setBackgroundDrawable(new ColorDrawable(c));
        boolean light = (0.299 * Color.red(c) + 0.587 * Color.green(c) + 0.114 * Color.blue(c)) / 255 > 0.5;
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController ic = getWindow().getInsetsController();
            if (ic != null) {
                int m = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
                ic.setSystemBarsAppearance(light ? m : 0, m);
            }
        } else {
            View d = getWindow().getDecorView();
            int f = d.getSystemUiVisibility();
            int m = View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | (Build.VERSION.SDK_INT >= 26 ? View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR : 0);
            d.setSystemUiVisibility(light ? (f | m) : (f & ~m));
        }
    }

    /** 把系統列高度寫成網頁的 CSS 變數（board.css 的 --sa-*），網頁的上下內距用它 */
    private void pushInsets() {
        if (web != null && !insetCss.isEmpty()) web.evaluateJavascript("(function(){" + insetCss + "})()", null);
    }

    private boolean onOurSite() {
        String u = web == null ? null : web.getUrl();
        return u != null && u.startsWith(PREFIX);
    }

    private void openExternal(Uri uri) {
        String sc = uri.getScheme();
        if (!"https".equals(sc) && !"http".equals(sc)) return;
        try { new CustomTabsIntent.Builder().build().launchUrl(this, uri); }
        catch (Exception e) { try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); } catch (Exception ignored) { } }
    }

    private void startLogin() {
        byte[] b = new byte[24];
        new SecureRandom().nextBytes(b);
        String nonce = android.util.Base64.encodeToString(b, android.util.Base64.URL_SAFE | android.util.Base64.NO_WRAP | android.util.Base64.NO_PADDING);
        getSharedPreferences(PREFS, MODE_PRIVATE).edit().putString("nonce", nonce).putLong("at", System.currentTimeMillis()).commit();
        openExternal(Uri.parse(LOGIN + "#n=" + nonce));
    }

    /** 收 app-login.html 交回來的憑證：nonce 一次性、10 分鐘內、格式正確才轉給網頁 */
    private void handleIntent(Intent in) {
        /* 只處理登入交接的 intent（VIEW＋councilapp://auth）；別的 intent（桌面圖示等）不碰目前的 nonce */
        if (in == null || !Intent.ACTION_VIEW.equals(in.getAction())) return;
        Uri d = in.getData();
        if (d == null || !"councilapp".equals(d.getScheme()) || !"auth".equals(d.getHost())) return;
        String id = in.getStringExtra("idToken"), n = in.getStringExtra("nonce");
        in.removeExtra("idToken");
        in.removeExtra("nonce");
        android.content.SharedPreferences sp = getSharedPreferences(PREFS, MODE_PRIVATE);
        String want = sp.getString("nonce", null);
        long at = sp.getLong("at", 0);
        sp.edit().clear().commit();   /* 不管對不對，用過就作廢 */
        if (id == null || n == null || want == null || !want.equals(n) || !NONCE.matcher(n).matches()
                || System.currentTimeMillis() - at > NONCE_MS || !TOKEN.matcher(id).matches() || !onOurSite()) return;
        web.evaluateJavascript("(function t(k){if(window.__councilAppSignIn)window.__councilAppSignIn('" + id
                + "');else if(k>0)setTimeout(function(){t(k-1)},500)})(20)", null);
    }

    private class Bridge {
        @JavascriptInterface
        public void login() { runOnUiThread(() -> { if (onOurSite()) startLogin(); }); }

        @JavascriptInterface
        public void themeColor(String c) {
            final int col = parseColor(c);
            if (col == 0) return;
            runOnUiThread(() -> { if (onOurSite()) setBarColor(col); });
        }
    }

    /** meta theme-color 可能是 #rgb、#rrggbb 或 rgb(...)；看不懂就回 0（不更新） */
    static int parseColor(String c) {
        if (c == null) return 0;
        c = c.trim();
        try {
            if (c.matches("^#[0-9a-fA-F]{3}$")) c = "#" + c.charAt(1) + c.charAt(1) + c.charAt(2) + c.charAt(2) + c.charAt(3) + c.charAt(3);
            if (c.matches("^#[0-9a-fA-F]{6}$")) return Color.parseColor(c);
            java.util.regex.Matcher m = RGB.matcher(c);
            if (m.matches()) return Color.rgb(Math.min(255, Integer.parseInt(m.group(1))), Math.min(255, Integer.parseInt(m.group(2))), Math.min(255, Integer.parseInt(m.group(3))));
        } catch (Exception ignored) { }
        return 0;
    }
}
