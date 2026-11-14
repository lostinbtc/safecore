package org.pepecoinservice.safecore;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.provider.DocumentsContract;
import android.test.AndroidTestCase;

/** No real wallet data. Policy and picker checks use public dummy ciphertext. */
public class LocalRecoveryCopyTest extends AndroidTestCase {
    static final String FIXTURE="{\"format\":\"pepecoin-whippet-encrypted-v1\",\"kdf\":\"PBKDF2-SHA256\",\"iterations\":600000,\"cipher\":\"AES-256-GCM\",\"salt\":\"00000000000000000000000000000000\",\"iv\":\"000000000000000000000000\",\"data\":\"00000000000000000000000000000000\"}";
    public void testOnlyEncryptedEnvelopeAccepted() throws Exception {
        LocalRecoveryCopy.validate(FIXTURE);
        for(String invalid:new String[]{"{}","{\"mnemonic\":\"public dummy words\"}",FIXTURE.replace("600000","1"),FIXTURE.replace("AES-256-GCM","plain"),FIXTURE.replace("00000000000000000000000000\"","bad\""),FIXTURE.replace("{","{\"mnemonic\":\"words\",")}){
            boolean rejected=false;try{LocalRecoveryCopy.validate(invalid);}catch(Exception e){rejected=true;}assertTrue(rejected);
        }
    }
    public void testLocalProvidersOnly() {
        assertTrue(LocalRecoveryCopy.localDocument(LocalRecoveryCopy.DEFAULT_LOCATION));
        assertTrue(LocalRecoveryCopy.localDocument(DocumentsContract.buildDocumentUri("com.android.providers.downloads.documents","msf:42")));
        for(Uri invalid:new Uri[]{null,Uri.parse("file:///sdcard/Download/a.json"),Uri.parse("content://cloud.example/document/a"),Uri.parse("content://com.android.externalstorage.documents/not-a-document"),
            DocumentsContract.buildDocumentUri("com.android.externalstorage.documents","primary:Android/data/app/a.json"),
            DocumentsContract.buildDocumentUri("com.android.externalstorage.documents","primary:Android/obb/a.json"),
            DocumentsContract.buildDocumentUri("com.android.externalstorage.documents","primary:Android/media/app/a.json"),
            DocumentsContract.buildDocumentUri("com.android.externalstorage.documents","primary:Documents/../Android/data/a.json")})assertFalse(LocalRecoveryCopy.localDocument(invalid));
    }
    public void testPickerRemembersLocationNotPassword() {
        Context context=getContext();context.getSharedPreferences(LocalRecoveryCopy.PREFS,0).edit().clear().commit();
        Intent first=LocalRecoveryCopy.picker(context);
        assertEquals(Intent.ACTION_CREATE_DOCUMENT,first.getAction());assertTrue(first.getBooleanExtra(Intent.EXTRA_LOCAL_ONLY,false));
        assertEquals(LocalRecoveryCopy.DEFAULT_LOCATION,first.getParcelableExtra(DocumentsContract.EXTRA_INITIAL_URI));
        Uri saved=DocumentsContract.buildDocumentUri("com.android.externalstorage.documents","primary:Documents/Test/a.json");
        context.getSharedPreferences(LocalRecoveryCopy.PREFS,0).edit().putString(LocalRecoveryCopy.LAST_URI,saved.toString()).commit();
        assertEquals(saved,LocalRecoveryCopy.picker(context).getParcelableExtra(DocumentsContract.EXTRA_INITIAL_URI));
        assertEquals(1,context.getSharedPreferences(LocalRecoveryCopy.PREFS,0).getAll().size());
        context.getSharedPreferences(LocalRecoveryCopy.PREFS,0).edit().putString(LocalRecoveryCopy.LAST_URI,"content://cloud.example/document/a").commit();
        assertEquals(LocalRecoveryCopy.DEFAULT_LOCATION,LocalRecoveryCopy.picker(context).getParcelableExtra(DocumentsContract.EXTRA_INITIAL_URI));
        context.getSharedPreferences(LocalRecoveryCopy.PREFS,0).edit().clear().commit();
    }
}
