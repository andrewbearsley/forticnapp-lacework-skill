'use strict';
// MIT, Copyright (c) 2026 Andrew Bearsley. FortiAgent adaptation.
function pagingPath(nextUrl, expectedOrigin) {
  const url = new URL(nextUrl);
  const expected = new URL(expectedOrigin);
  if (url.protocol !== 'https:' || url.origin !== expected.origin || url.username || url.password) {
    throw new Error('Paging URL does not match the verified HTTPS tenant');
  }
  return url.pathname + url.search; // preserve encoded path/query; exclude fragment
}
module.exports = {pagingPath};
if (require.main === module) {
  try {
    if (process.argv.length !== 4) throw new Error('Usage: node paging-path.cjs <next-url> <verified-tenant-origin>');
    console.log(pagingPath(process.argv[2], process.argv[3]));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
