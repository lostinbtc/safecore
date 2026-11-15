// A selected receiving asset cannot be changed in place. Exercise the same
// explicit Overview -> Receive route a user takes to choose another coin.
module.exports=async page=>{
 if(await page.locator('#receive-overview').count()){
  await page.locator('#receive-overview').click();await page.locator('.holdings').waitFor();
 }
 await page.locator('[data-nav=receive]').click();
 await page.locator('#receive-coin').waitFor();
};
