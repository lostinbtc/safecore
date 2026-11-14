package org.pepecoinservice.safecore;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Rect;
import android.graphics.Region;
import android.graphics.drawable.AdaptiveIconDrawable;
import android.graphics.drawable.BitmapDrawable;
import android.graphics.drawable.InsetDrawable;
import android.test.AndroidTestCase;

/** Drawable-only QA test: no wallet, activity, personal device or network access. */
public class IconLayoutTest extends AndroidTestCase {
    public void testSystemSplashArtworkFitsItsOwnMask() {
        assertTrue("QA package only", getContext().getPackageName().endsWith(".qa"));
        android.util.TypedValue value = new android.util.TypedValue();
        android.view.ContextThemeWrapper launchContext = new android.view.ContextThemeWrapper(getContext(), R.style.AppTheme);
        assertTrue(launchContext.getTheme().resolveAttribute(android.R.attr.windowSplashScreenAnimatedIcon, value, true));
        assertEquals(R.drawable.ic_safecore, value.resourceId);
        InsetDrawable icon = (InsetDrawable) getContext().getDrawable(value.resourceId);
        int size = 288;
        icon.setBounds(0, 0, size, size);
        Bitmap rendered = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        icon.draw(new Canvas(rendered));
        BitmapDrawable artwork = (BitmapDrawable) icon.getDrawable();
        Rect bounds = artwork.getBounds();
        Bitmap pixels = artwork.getBitmap();
        for (int y = 0; y < pixels.getHeight(); y++) for (int x = 0; x < pixels.getWidth(); x++) {
            if (Color.alpha(pixels.getPixel(x, y)) < 16) continue;
            double dx = bounds.left + (x + .5) * bounds.width() / pixels.getWidth() - size / 2.0;
            double dy = bounds.top + (y + .5) * bounds.height() / pixels.getHeight() - size / 2.0;
            assertTrue("System splash must retain the entire globe", dx * dx + dy * dy <= size * size / 9.0);
        }
        rendered.recycle();
    }
    public void testEntireGlobeFitsAdaptiveSafeZoneAtEverySize() {
        assertTrue("QA package only", getContext().getPackageName().endsWith(".qa"));
        for (int size : new int[]{32, 48, 72, 96, 192, 512}) {
            AdaptiveIconDrawable icon = (AdaptiveIconDrawable) getContext().getDrawable(R.mipmap.ic_launcher);
            icon.setBounds(0, 0, size, size);
            Bitmap rendered = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
            icon.draw(new Canvas(rendered));
            BitmapDrawable artwork = (BitmapDrawable) ((InsetDrawable) icon.getForeground()).getDrawable();
            Bitmap pixels = artwork.getBitmap();
            Rect bounds = artwork.getBounds();
            // Android's 108-unit layer maps to a 72-unit masked icon. The
            // guaranteed 66-unit safe circle must hold the complete artwork.
            double safeRadius = size * 66.0 / 72.0 / 2.0;
            Region mask = new Region();
            mask.setPath(icon.getIconMask(), new Region(0, 0, size, size));
            int checked = 0;
            for (int y = 0; y < pixels.getHeight(); y++) {
                for (int x = 0; x < pixels.getWidth(); x++) {
                    // Ignore barely visible stray pixels in the supplied artwork,
                    // but include the complete globe and its antialiased edges.
                    if (Color.alpha(pixels.getPixel(x, y)) < 16) continue;
                    int targetX = bounds.left + (int) ((x + .5) * bounds.width() / pixels.getWidth());
                    int targetY = bounds.top + (int) ((y + .5) * bounds.height() / pixels.getHeight());
                    double dx = targetX + .5 - size / 2.0, dy = targetY + .5 - size / 2.0;
                    assertTrue("Globe outside adaptive safe zone at icon size " + size,
                            dx * dx + dy * dy <= safeRadius * safeRadius && mask.contains(targetX, targetY));
                    checked++;
                }
            }
            assertTrue("Artwork must contain visible pixels", checked > 1000);
            rendered.recycle();
        }
    }
}
