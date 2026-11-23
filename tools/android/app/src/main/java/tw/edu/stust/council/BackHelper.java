package tw.edu.stust.council;

import android.app.Activity;
import android.graphics.Outline;
import android.view.View;
import android.view.ViewOutlineProvider;
import android.window.BackEvent;
import android.window.OnBackAnimationCallback;
import android.window.OnBackInvokedCallback;
import android.window.OnBackInvokedDispatcher;

/**
 * Android 13 以上的預測返回手勢。
 * - 網頁能往回時才註冊：Android 14 以上在手指滑動時，畫面（WebView）會跟著縮小並往手勢方向偏一點，放開才真的返回上一頁；中途收手就彈回原位。
 * - 在最上層（不能往回）時不註冊，系統就會播「返回桌面」的預測動畫。
 * - Android 13 沒有滑動進度，只做一般的返回。
 */
class BackHelper {
    private final Activity act;
    private final View view;
    private final Runnable goBack;
    private final OnBackInvokedCallback cb;
    private boolean on;
    /* 預測返回幅度：縮到 0.80、往手勢方向位移 40dp、圓角到 32dp（螢幕上的大小；程式裡除以縮放比例） */
    private static final float MIN_SCALE = 0.80f, SHIFT_DP = 40f, RADIUS_DP = 32f;
    private float radiusPx;
    private final ViewOutlineProvider round = new ViewOutlineProvider() {
        @Override
        public void getOutline(View v, Outline o) { o.setRoundRect(0, 0, v.getWidth(), v.getHeight(), radiusPx); }
    };

    BackHelper(Activity a, View v, Runnable goBack) {
        act = a;
        view = v;
        this.goBack = goBack;
        cb = android.os.Build.VERSION.SDK_INT >= 34 ? new Animated() : (OnBackInvokedCallback) goBack::run;
    }

    void set(boolean want) {
        OnBackInvokedDispatcher d = act.getOnBackInvokedDispatcher();
        if (want && !on) { d.registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT, cb); on = true; }
        else if (!want && on) { d.unregisterOnBackInvokedCallback(cb); on = false; }
    }

    private void reset() {
        view.animate().cancel();
        view.animate().scaleX(1f).scaleY(1f).translationX(0f).setDuration(180).withEndAction(() -> {
            view.setClipToOutline(false);
            view.setOutlineProvider(ViewOutlineProvider.BACKGROUND);
        }).start();
    }

    /** Android 14 以上：跟著手指的預覽動畫 */
    private class Animated implements OnBackAnimationCallback {
        @Override
        public void onBackStarted(BackEvent e) {
            view.animate().cancel();
            view.setOutlineProvider(round);
            view.setClipToOutline(true);
        }

        @Override
        public void onBackProgressed(BackEvent e) {
            float p = e.getProgress();
            float dir = e.getSwipeEdge() == BackEvent.EDGE_RIGHT ? -1f : 1f;
            float d = view.getResources().getDisplayMetrics().density;
            view.setPivotX(view.getWidth() / 2f);
            view.setPivotY(view.getHeight() / 2f);
            float sc = 1f - (1f - MIN_SCALE) * p;
            radiusPx = RADIUS_DP * d * p / sc;
            view.invalidateOutline();
            view.setScaleX(sc);
            view.setScaleY(sc);
            view.setTranslationX(dir * SHIFT_DP * d * p);
        }

        @Override
        public void onBackInvoked() { reset(); goBack.run(); }

        @Override
        public void onBackCancelled() { reset(); }
    }
}
