package org.pepecoinservice.safecore;

import android.net.Uri;
import android.test.AndroidTestCase;

/** Pure URL policy checks; no network or wallet data. */
public class NetworkPolicyTest extends AndroidTestCase {
    public void testPublicPriceAllowlist() {
        String quote="https://api.coingecko.com/api/v3/simple/price?ids=shibacoin,litecoin&vs_currencies=usd&include_last_updated_at=true";
        assertTrue(MainActivity.publicPriceRequest(Uri.parse(quote),"GET"));
        assertTrue(MainActivity.publicPriceRequest(Uri.parse("https://api.kraken.com/0/public/Ticker?pair=PEPUSD,USDTUSD"),"GET"));
        assertFalse(MainActivity.publicPriceRequest(Uri.parse(quote),"POST"));
        for(String bad:new String[]{
            quote.replace("https:","http:"),quote.replace("api.coingecko.com","api.coingecko.com.evil.example"),
            quote.replace("api.coingecko.com","user:password@api.coingecko.com"),
            quote.replace("api.coingecko.com","api.coingecko.com:444"),quote+"#fragment",
            quote+"&address=not-allowed",quote.replace("shibacoin","shiba-inu"),
            quote.replace("/simple/price","/simple/%70rice"),"https://api.coingecko.com/api/v3/coins/list"
        })assertFalse(MainActivity.publicPriceRequest(Uri.parse(bad),"GET"));
    }
    public void testPriceSourceNavigation() {
        String source="https://www.coingecko.com/en/coins/shibacoin";
        assertTrue(MainActivity.priceSourcePage(Uri.parse(source)));
        for(String bad:new String[]{source+"?x=1",source+"#x",source+"/",source.replace("https:","http:"),
            source.replace("www.coingecko.com","user@www.coingecko.com"),
            source.replace("www.coingecko.com","www.coingecko.com.evil.example")})
            assertFalse(MainActivity.priceSourcePage(Uri.parse(bad)));
    }
}
