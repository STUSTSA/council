package tw.edu.stust.council;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;

import androidx.browser.customtabs.CustomTabsIntent;

/** 沒有畫面：開啟 Chrome 自訂分頁顯示看板；失敗就交給系統瀏覽器。返回後自動關閉，不留空白頁。 */
public class MainActivity extends Activity {
    private static final String URL = "https://stustsa.github.io/council/home.html";
    private boolean launched;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        launched = state != null && state.getBoolean("launched");
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        out.putBoolean("launched", launched);
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (launched) { finish(); return; }
        launched = true;
        Uri uri = Uri.parse(URL);
        try {
            new CustomTabsIntent.Builder().setShowTitle(true).build().launchUrl(this, uri);
        } catch (Exception e) {
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, uri));
            } catch (Exception e2) {
                finish();
            }
        }
    }
}
