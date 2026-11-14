// Explicit UI setup for disposable test wallets, never a production bypass.
module.exports=async function selectCoins(page,coins){
  await page.locator('[data-nav=wallet]').click();
  await page.locator('#header-add-coins').click();
  for(const coin of coins)await page.locator(`[data-show-coin=${coin}]`).check();
  await page.getByRole('link',{name:'Done',exact:true}).click();
  await page.locator('.holdings').waitFor();
};
