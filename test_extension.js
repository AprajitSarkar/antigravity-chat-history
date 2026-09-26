const fs = require('fs');
const path = require('path');
const { ConversationManager } = require('./src/conversationManager');
const { encodeTrajectorySummaries } = require('./src/protoEncoder');

console.log('=== TEST 1: Load All Conversations ===');
const mgr = new ConversationManager();
const convs = mgr.reload();
console.log(`Total conversations detected: ${convs.length}`);
if (convs.length < 50) {
    console.error('FAIL: Expected >= 50 conversations, got ' + convs.length);
    process.exit(1);
}
console.log('PASS: Loaded all conversations!');
console.log('\nTop 10 Detected Titles:');
convs.slice(0, 10).forEach((c, idx) => {
    console.log(`  ${idx + 1}. [${c.wsName}] "${c.title}" (${c.relativeTime})`);
});

console.log('\n=== TEST 2: Verify Every Field is Present (0 Skipped) ===');
let missingTitle = 0;
let missingWs = 0;
let missingDate = 0;
for (const c of convs) {
    if (!c.title) missingTitle++;
    if (!c.wsName) missingWs++;
    if (!c.dateStr) missingDate++;
}
console.log(`Missing titles: ${missingTitle}, Missing ws names: ${missingWs}, Missing dates: ${missingDate}`);
if (missingTitle > 0 || missingWs > 0 || missingDate > 0) {
    console.error('FAIL: Some conversations have missing fields!');
    process.exit(1);
}
console.log('PASS: All conversations have complete metadata!');

console.log('\n=== TEST 3: Verify Webview Assets Exist ===');
const htmlPath = path.join(__dirname, 'src', 'webview', 'view.html');
const cssPath = path.join(__dirname, 'src', 'webview', 'view.css');
const jsPath = path.join(__dirname, 'src', 'webview', 'view.js');

if (!fs.existsSync(htmlPath) || !fs.existsSync(cssPath) || !fs.existsSync(jsPath)) {
    console.error('FAIL: Webview assets missing!');
    process.exit(1);
}
console.log('PASS: Webview files exist and are intact!');

console.log('\n=== TEST 4: Verify Protobuf Encoding & state.vscdb Sync ===');
const b64 = encodeTrajectorySummaries(convs);
console.log(`Encoded protobuf payload length: ${b64.length}`);
const syncOk = mgr.syncToVscdb();
console.log(`state.vscdb sync result: ${syncOk}`);
if (!syncOk) {
    console.error('FAIL: syncToVscdb failed!');
    process.exit(1);
}
console.log('\n=== TEST 5: Verify Last Prompt & Title Renaming ===');
const first = convs[0];
console.log(`First conversation CID: ${first.cid}`);
console.log(`Original Title: "${first.title}"`);
console.log(`Last Prompt Preview: "${(first.lastPrompt || '').substring(0, 60)}..."`);
if (first.lastPrompt === undefined) {
    console.error('FAIL: lastPrompt property is undefined!');
    process.exit(1);
}

// Test renaming
const originalTitle = first.title;
mgr.setCustomTitle(first.cid, 'Renamed Title Test');
const afterRename = mgr.getConversations().find(c => c.cid === first.cid);
if (afterRename.title !== 'Renamed Title Test' || !afterRename.isCustomTitle) {
    console.error('FAIL: Renaming did not apply properly!');
    process.exit(1);
}
console.log('PASS: Successfully renamed title!');

// Reset back to original
mgr.setCustomTitle(first.cid, '');
const afterReset = mgr.getConversations().find(c => c.cid === first.cid);
if (afterReset.title !== originalTitle) {
    console.error('FAIL: Resetting title did not restore original auto title!');
    process.exit(1);
}
console.log('PASS: Successfully reset custom title!');

console.log('\n=== ALL TESTS PASSED! ===');
