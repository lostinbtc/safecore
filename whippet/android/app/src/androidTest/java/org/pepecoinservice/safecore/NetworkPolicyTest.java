package org.pepecoinservice.safecore;

import android.net.Uri;
import android.test.AndroidTestCase;

/** Pure URL policy checks; no network or wallet data. */
public class NetworkPolicyTest extends AndroidTestCase {
    public void testBellsApiAllowlist() {
        String base="https://bells-mainnet-api.nintondo.io",hash="a".repeat(64);
        for(String path:new String[]{"/block-height/0","/blocks/tip/height","/fee-estimates",
            "/scripthash/"+hash,"/scripthash/"+hash+"/txs","/scripthash/"+hash+"/txs/chain/"+hash,
            "/scripthash/"+hash+"/utxo","/tx/"+hash+"/hex","/tx/"+hash+"/status"}) {
            assertTrue(MainActivity.bellsApiRequest(Uri.parse(base+path),"GET"));
            assertFalse(MainActivity.bellsApiRequest(Uri.parse(base+path),"POST"));
            for(String bad:new String[]{base+path+"?key=x",base+path+"#x",base+path+"/extra",
                base.replace("https:","http:")+path,base+":443"+path,
                base+".evil.example"+path,base.replace("https://","https://user@")+path})
                assertFalse(MainActivity.bellsApiRequest(Uri.parse(bad),"GET"));
        }
        assertTrue(MainActivity.bellsApiRequest(Uri.parse(base+"/tx"),"POST"));
        assertFalse(MainActivity.bellsApiRequest(Uri.parse(base+"/tx"),"GET"));
        assertFalse(MainActivity.bellsApiRequest(Uri.parse(base+"/%74x"),"POST"));
        assertFalse(MainActivity.bellsApiRequest(Uri.parse(base+"/tx"),"DELETE"));
    }
    public void testTransactionExplorerNavigation() {
        String hash="a".repeat(64);
        for(String base:new String[]{"https://pepecoinservice.org/explorer/tx/", "https://mempool.space/tx/",
            "https://dogechain.com/tx/", "https://litecoinspace.org/tx/", "https://explorer.shibacoinshic.org/tx/", "https://nintondo.io/bells/explorer/tx/", "https://explorer.dingocoin.com/tx/", "https://digiexplorer.info/tx/", "https://ravencoinexplorer.com/tx/", "https://blockchair.com/bitcoin-cash/transaction/", "https://blockchair.com/dash/transaction/"}){
            String url=base+hash+(base.contains("pepecoinservice.org")?"/":"");
            assertTrue(MainActivity.transactionPage(Uri.parse(url)));
            String host=Uri.parse(url).getHost();
            for(String bad:new String[]{url.replace("https:","http:"), url.replace(host,host+".evil.example"),
                url.replace(host,"user@"+host),url.replace(host,host+":443"),url+"?redirect=1",url+"#fragment",
                url.replace("/tx/","/address/").replace("/transaction/","/address/"),url.replace("/tx/","/%74x/").replace("/transaction/","/%74ransaction/"),url.replace(hash,"bad"),
                url.replace(hash,hash+"0"),url.replace(hash,hash.substring(1)),url.replace(hash,"g".repeat(64)),
                url.replace(hash,hash+"%2fextra")})assertFalse(MainActivity.transactionPage(Uri.parse(bad)));
        }
        assertFalse(MainActivity.transactionPage(null));
        assertFalse(MainActivity.transactionPage(Uri.parse("https://whippet.example/tx/"+hash)));
        assertFalse(MainActivity.transactionPage(Uri.parse("https://mempool.space/testnet/tx/"+hash)));
        assertFalse(MainActivity.transactionPage(Uri.parse(MainActivity.START)));
    }
    public void testPublicPriceAllowlist() {
        String quote="https://api.coingecko.com/api/v3/simple/price?ids=shibacoin,litecoin,dogecoin,bitcoin,bellscoin,dingocoin,bitcoin-cash,dash,digibyte,junkcoin,luckycoin,ravencoin,catcoin,trumpow&vs_currencies=usd&include_last_updated_at=true";
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
