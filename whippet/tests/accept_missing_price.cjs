// Explicit test-user action, never a production bypass. Other guards stay live.
module.exports=async page=>{
 if(await page.locator('#missing-price-option').isVisible())await page.locator('#missing-price-ack').check();
};
