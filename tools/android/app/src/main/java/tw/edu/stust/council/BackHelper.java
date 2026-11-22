package tw.edu.stust.council;

import android.app.Activity;
import android.window.OnBackInvokedCallback;
import android.window.OnBackInvokedDispatcher;

/** Android 13 以上的預測返回手勢：只在網頁能往回時才註冊；在最上層時不註冊，系統就會播返回桌面的預測動畫。 */
class BackHelper {
    private final Activity act;
    private final OnBackInvokedCallback cb;
    private boolean on;

    BackHelper(Activity a, Runnable goBack) {
        act = a;
        cb = goBack::run;
    }

    void set(boolean want) {
        OnBackInvokedDispatcher d = act.getOnBackInvokedDispatcher();
        if (want && !on) { d.registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT, cb); on = true; }
        else if (!want && on) { d.unregisterOnBackInvokedCallback(cb); on = false; }
    }
}
