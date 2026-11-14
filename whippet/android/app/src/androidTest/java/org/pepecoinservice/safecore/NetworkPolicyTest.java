package org.pepecoinservice.safecore;

import android.net.Uri;
import android.test.AndroidTestCase;

/** Pure URL policy checks; no network or wallet data. */
public class NetworkPolicyTest extends AndroidTestCase {
    public void testTransactionExplorerNavigation() {
        String hash="a".repeat(64);
        for(String base:new String[]{"https://pepecoinservice.org/explorer/tx/", "https://mempool.space/tx/",
            "https://dogechain.com/tx/", "https://litecoinspace.org/tx/", "https://explorer.shibacoinshic.org/tx/"}){
            String url=base+hash+(base.contains("pepecoinservice.org")?"/":"");
            assertTrue(MainActivity.transactionPage(Uri.parse(url)));
            String host=Uri.parse(url).getHost();
            for(String bad:new String[]{url.replace("https:","http:"), url.replace(host,host+".evil.example"),
                url.replace(host,"user@"+host),url.replace(host,host+":443"),url+"?redirect=1",url+"#fragment",
                url.replace("/tx/","/address/"),url.replace("/tx/","/%74x/"),url.replace(hash,"bad"),
                url.replace(hash,hash+"0"),url.replace(hash,hash.substring(1)),url.replace(hash,"g".repeat(64)),
                url.replace(hash,hash+"%2fextra")})assertFalse(MainActivity.transactionPage(Uri.parse(bad)));
        }
        assertFalse(MainActivity.transactionPage(null));
        assertFalse(MainActivity.transactionPage(Uri.parse("https://whippet.example/tx/"+hash)));
        assertFalse(MainActivity.transactionPage(Uri.parse("https://mempool.space/testnet/tx/"+hash)));
        assertFalse(MainActivity.transactionPage(Uri.parse(MainActivity.START)));
    }
    public void testPublicPriceAllowlist() {
        String quote="https://api.coingecko.com/api/v3/simple/price?ids=shibacoin,litecoin,dogecoin,bitcoin&vs_currencies=usd&include_last_updated_at=true";
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
