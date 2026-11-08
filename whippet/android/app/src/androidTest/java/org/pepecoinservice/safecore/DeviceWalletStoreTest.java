package org.pepecoinservice.safecore;

import android.test.AndroidTestCase;
import android.util.AtomicFile;
import org.json.JSONObject;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.security.KeyStore;
import java.util.Arrays;
import java.util.UUID;

/** Isolated files/keys, no real wallet data and no network. Emulator QA package only. */
public class DeviceWalletStoreTest extends AndroidTestCase {
    private File path;
    private String alias;
    private DeviceWalletStore store;
    private static final String ACTIVE="whippet.dev.encrypted.v1", COLLECTION="corevault.wallets.v1";
    @Override protected void setUp() throws Exception {
        super.setUp();
        assertTrue("QA package only",getContext().getPackageName().endsWith(".qa"));
        alias="safecore.fixture."+UUID.randomUUID();
        path=new File(getContext().getNoBackupFilesDir(),alias+".enc");
        store=new DeviceWalletStore(path,alias);
    }
    @Override protected void tearDown() throws Exception {
        new AtomicFile(path).delete();
        KeyStore keys=KeyStore.getInstance("AndroidKeyStore");keys.load(null);keys.deleteEntry(alias);
        super.tearDown();
    }
    private JSONObject records(String value) throws Exception {
        return new JSONObject().put(ACTIVE,value).put(COLLECTION,"fixture-collection-"+value);
    }
    public void testEncryptedRoundTripAndAtomicRevision() throws Exception {
        assertNull(store.read());
        JSONObject data=records("public-fixture-not-a-wallet");
        String first=store.write(null,data);
        byte[] one=Files.readAllBytes(path.toPath());
        assertFalse(new String(one,StandardCharsets.UTF_8).contains("public-fixture"));
        assertEquals(data.toString(),new DeviceWalletStore(path,alias).read().getJSONObject("records").toString());
        KeyStore keys=KeyStore.getInstance("AndroidKeyStore");keys.load(null);
        assertNull("Device key must not be exportable",keys.getKey(alias,null).getEncoded());
        try { store.write(null,records("stale"));fail("Stale writer accepted"); } catch (IllegalStateException expected) { }
        assertTrue(Arrays.equals(one,Files.readAllBytes(path.toPath())));
        String second=store.write(first,data);
        assertFalse(first.equals(second));assertFalse(Arrays.equals(one,Files.readAllBytes(path.toPath())));
        assertEquals(second,store.read().getString("revision"));
        // Simulate an interrupted AtomicFile write, then read/recover the previous snapshot.
        AtomicFile atomic=new AtomicFile(path);
        FileOutputStream interrupted=atomic.startWrite();interrupted.write(new byte[]{1,2,3});interrupted.close();
        assertEquals(second,store.read().getString("revision"));
    }
    public void testTamperAndKeyLossFailClosed() throws Exception {
        String revision=store.write(null,records("public-fixture-not-a-wallet"));
        byte[] original=Files.readAllBytes(path.toPath()),tampered=original.clone();tampered[tampered.length-1]^=1;
        Files.write(path.toPath(),tampered);
        try { store.read();fail("Tampered ciphertext accepted"); } catch (java.security.GeneralSecurityException expected) { }
        try { store.write(revision,records("replacement"));fail("Tampered wallet overwritten"); } catch (java.security.GeneralSecurityException expected) { }
        assertTrue(Arrays.equals(tampered,Files.readAllBytes(path.toPath())));
        Files.write(path.toPath(),original);
        KeyStore keys=KeyStore.getInstance("AndroidKeyStore");keys.load(null);keys.deleteEntry(alias);
        try { store.read();fail("Missing key accepted"); } catch (DeviceWalletStore.KeyUnavailableException expected) { }
        try { store.write(revision,records("replacement"));fail("Missing key replaced"); } catch (DeviceWalletStore.KeyUnavailableException expected) { }
        assertFalse(keys.containsAlias(alias));assertTrue(Arrays.equals(original,Files.readAllBytes(path.toPath())));
    }
    public void testMalformedRequestsPreserveStore() throws Exception {
        String revision=store.write(null,records("fixture"));byte[] original=Files.readAllBytes(path.toPath());
        try { store.write(revision,new JSONObject().put(ACTIVE,123));fail("Invalid records accepted"); } catch (IllegalArgumentException expected) { }
        assertTrue(Arrays.equals(original,Files.readAllBytes(path.toPath())));
    }
}
