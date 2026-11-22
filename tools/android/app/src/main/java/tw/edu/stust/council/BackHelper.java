package tw.edu.stust.council;

import android.app.Activity;
import android.graphics.Bitmap;
import android.graphics.Outline;
import android.view.View;
import android.view.ViewOutlineProvider;
import android.webkit.WebView;
import android.widget.ImageView;
import android.window.BackEvent;
import android.window.OnBackAnimationCallback;
import android.window.OnBackInvokedCallback;
import android.window.OnBackInvokedDispatcher;

/**
 * Android 13 以上的預測返回手勢。
 * - 網頁能往回時才註冊；在最上層（不能往回）時不註冊，系統會播「返回桌面」的預測動畫（manifest 要有 enableOnBackInvokedCallback）。
 * - Android 14 以上：手指從邊緣滑動時，目前畫面（WebView）跟著手指縮小成圓角卡片、往手勢方向偏移，後面露出「上一個畫面」的截圖
 *   （MainActivity 在每頁載入完成後截的）；放開超過門檻就返回上一頁，沒超過就彈回。沒有截圖時後面只露出底色。
 * - Android 13 沒有滑動進度，只做一般的返回。
 */
class BackHelper {
    /** MainActivity 提供：上一個畫面的截圖、實際返回 */
    interface Host {
        Bitmap prevShot();          /* 上一個畫面的截圖，沒有就 null */
        boolean prevSameDocument(); /* 上一筆紀錄跟現在是同一份文件（網頁自己的疊層）：返回後不會有新頁面載入 */
        void goBack();
    }

    private final Activity act;
    private final WebView web;
    private final ImageView snap;
    private final Host host;
    private final OnBackInvokedCallback cb;
    private boolean on;
    private float radius;
    private boolean waiting;
    private final Runnable settle = this::finish;

    BackHelper(Activity a, WebView w, ImageView s, Host h) {
        act = a;
        web = w;
        snap = s;
        host = h;
        cb = android.os.Build.VERSION.SDK_INT >= 34 ? new Animated() : (OnBackInvokedCallback) h::goBack;
        w.setOutlineProvider(new ViewOutlineProvider() {
            @Override
            public void getOutline(View v, Outline o) { o.setRoundRect(0, 0, v.getWidth(), v.getHeight(), radius); }
        });
    }

    void set(boolean want) {
        OnBackInvokedDispatcher d = act.getOnBackInvokedDispatcher();
        if (want && !on) { d.registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT, cb); on = true; }
        else if (!want && on) { d.unregisterOnBackInvokedCallback(cb); on = false; }
    }

    /** 上一頁已經畫出來（onPageCommitVisible）：撤掉截圖、把 WebView 還原 */
    void commit() { if (waiting) finish(); }

    private void finish() {
        web.removeCallbacks(settle);
        waiting = false;
        web.animate().cancel();
        web.setAlpha(1f); web.setScaleX(1f); web.setScaleY(1f); web.setTranslationX(0f);
        web.setClipToOutline(false);
        snap.animate().cancel();
        snap.setVisibility(View.GONE);
        snap.setImageDrawable(null);
    }

    private void spring() {
        web.animate().cancel();
        web.animate().scaleX(1f).scaleY(1f).translationX(0f).setDuration(200).withEndAction(this::finish).start();
    }

    /** Android 14 以上：跟著手指的預覽動畫 */
    private class Animated implements OnBackAnimationCallback {
        private float d() { return web.getResources().getDisplayMetrics().density; }

        @Override
        public void onBackStarted(BackEvent e) {
            web.removeCallbacks(settle);
            web.animate().cancel();
            waiting = false;
            Bitmap b = host.prevShot();
            if (b != null) { snap.setImageBitmap(b); snap.setScaleX(0.94f); snap.setScaleY(0.94f); snap.setVisibility(View.VISIBLE); }
            web.setPivotX(web.getWidth() / 2f);
            web.setPivotY(web.getHeight() / 2f);
            web.setClipToOutline(true);
        }

        @Override
        public void onBackProgressed(BackEvent e) {
            float p = e.getProgress();
            float dir = e.getSwipeEdge() == BackEvent.EDGE_RIGHT ? -1f : 1f;
            web.setScaleX(1f - 0.1f * p);
            web.setScaleY(1f - 0.1f * p);
            web.setTranslationX(dir * 24f * d() * p);
            radius = 28f * d() * Math.min(1f, p * 3f);
            web.invalidateOutline();
            if (snap.getVisibility() == View.VISIBLE) { float s = 0.94f + 0.06f * p; snap.setScaleX(s); snap.setScaleY(s); }
        }

        @Override
        public void onBackInvoked() {
            boolean shot = snap.getVisibility() == View.VISIBLE;
            if (!shot) { host.goBack(); spring(); return; }
            /* 先讓上一個畫面（截圖）鋪滿，目前的頁面淡掉；真的返回後等上一頁畫出來再撤掉截圖 */
            snap.animate().scaleX(1f).scaleY(1f).setDuration(160).start();
            web.animate().alpha(0f).setDuration(120).start();
            waiting = true;
            host.goBack();
            web.postDelayed(settle, host.prevSameDocument() ? 260 : 2000);
        }

        @Override
        public void onBackCancelled() { spring(); }
    }
}
