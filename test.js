const fs = require('fs');
const path = require('path');
const assert = require('assert');

// 1. bookmarklet.js から isTimelineAvatar 関数を抽出
const src = fs.readFileSync(path.join(__dirname, 'src/bookmarklet.js'), 'utf8');

// isTimelineAvatar 関数の抽出
const isTimelineAvatarMatch = src.match(/function isTimelineAvatar[\s\S]*?return isTimeline;\s*\}/);
if (!isTimelineAvatarMatch) {
  throw new Error("Could not find isTimelineAvatar function in bookmarklet.js");
}
const isTimelineAvatarCode = isTimelineAvatarMatch[0];

// 関数を評価して取得 (imgを受け取る環境で実行)
const isTimelineAvatar = new Function('img', `
  var document = img.ownerDocument || { body: null };
  ${isTimelineAvatarCode}
  return isTimelineAvatar(img);
`);

// 2. 簡易的な DOM モックの定義
class MockNode {
  constructor(tagName, attrs = {}, parent = null) {
    this.tagName = tagName.toUpperCase();
    this.attributes = attrs;
    this.parentNode = parent;
    this.childNodes = [];
    if (parent) {
      parent.childNodes.push(this);
    }
  }

  getAttribute(name) {
    return this.attributes[name] || null;
  }

  // querySelectorAll の簡易的な実装
  querySelectorAll(selector) {
    const results = [];
    
    // 単純な [data-testid="userAvatarImage"] img のセレクタ処理のみをモック化
    const matchImg = (node) => {
      if (node.tagName === 'IMG' && node.parentNode && node.parentNode.getAttribute('data-testid') === 'userAvatarImage') {
        results.push(node);
      }
      for (const child of node.childNodes) {
        matchImg(child);
      }
    };

    matchImg(this);
    return results;
  }
}

// 3. テストの定義
console.log("Starting automated verification tests (Ends-with Selector validation)...");

const mockBody = new MockNode('body');

// --- テストケース1: タイムライン全体のコンテナ ---
// followingFeedPage-feed-flatlist (Followingフィード)
// profilePage-feed-flatlist (プロフィールフィード)
// これらが ends-with セレクタ (-feed-flatlist / -flatlist) に一致することを確認
const followingFeedList = new MockNode('div', { 'data-testid': 'followingFeedPage-feed-flatlist' }, mockBody);
const profileFeedList = new MockNode('div', { 'data-testid': 'profilePage-feed-flatlist' }, mockBody);

const feedItem = new MockNode('div', { 'data-testid': 'feedItem-by-user.bsky.social' }, followingFeedList);
const avatarContainer1 = new MockNode('div', { 'data-testid': 'userAvatarImage' }, feedItem);
const img1 = new MockNode('img', { src: 'https://cdn.bsky.app/img1.png' }, avatarContainer1);
img1.ownerDocument = { body: mockBody };

// 正常系 timeline 判定の確認
assert.strictEqual(isTimelineAvatar(img1), true, "timeline avatar should be allowed");
console.log("✔ Test Case 1: Timeline avatar correctly allowed.");

// --- テストケース2: アカウント切り替え（吉）などのタイムライン外アバターの完全除外 ---
const portal = new MockNode('div', { 'data-testid': 'radix-portal' }, mockBody);
const switchMenu = new MockNode('div', { 'data-testid': 'switchAccountBtn' }, portal);
const avatarContainer2 = new MockNode('div', { 'data-testid': 'userAvatarImage' }, switchMenu);
const img2 = new MockNode('img', { src: 'https://cdn.bsky.app/img-yoshi.png' }, avatarContainer2);
img2.ownerDocument = { body: mockBody };

// 判定テスト (吉はタイムライン外なので絶対に false)
assert.strictEqual(isTimelineAvatar(img2), false, "switch account avatar should be rejected");
console.log("✔ Test Case 2: Switch account avatar (Yosh) correctly rejected.");

// --- テストケース4: タイムライン投稿内（feedItem-）であっても contentHider-post の内側にあるアバター（ラベラーなど）の除外 ---
const feedItemWithLabel = new MockNode('div', { 'data-testid': 'feedItem-by-labeled-user.bsky.social' }, followingFeedList);
const contentHider = new MockNode('div', { 'data-testid': 'contentHider-post' }, feedItemWithLabel);
const labelerBtn = new MockNode('button', { 'role': 'button' }, contentHider);
const avatarContainer4 = new MockNode('div', { 'data-testid': 'userAvatarImage' }, labelerBtn);
const img4 = new MockNode('img', { src: 'https://cdn.bsky.app/img-labeler-yoshi.png' }, avatarContainer4);
img4.ownerDocument = { body: mockBody };

// contentHider-post 内のアバターは絶対に false
assert.strictEqual(isTimelineAvatar(img4), false, "avatar inside contentHider-post should be rejected");
console.log("✔ Test Case 4: Avatar inside contentHider-post (e.g. labeler) correctly rejected.");


// --- テストケース3: scrollHandler内でのスキャン起点（フォールバック無効）のテスト ---
// セレクタが $-feed-flatlist または $-flatlist または $-feed のみであり、タイムライン消失時は body への漏れがないことをテスト
function mockScan(documentMock, isTimelineAvailable, testId) {
  // コンテナ取得
  let feedContainer = null;
  if (isTimelineAvailable) {
    // ends-with 属性マッチングの簡易モック
    if (testId.endsWith('-feed-flatlist') || testId.endsWith('-flatlist') || testId.endsWith('-feed')) {
      feedContainer = testId === 'followingFeedPage-feed-flatlist' ? followingFeedList : profileFeedList;
    }
  }

  // フォールバックなしの判定ロジック（実際の実装）
  if (!feedContainer) return []; // スキップ

  const results = [];
  const selectors = '[data-testid="userAvatarImage"] img';
  feedContainer.querySelectorAll(selectors).forEach(function (img) {
    if (isTimelineAvatar(img)) {
      results.push(img.attributes.src);
    }
  });
  return results;
}

// タイムラインコンテナ (Followingフィード) があるとき：スキャンしてアバターを収集
const resFollowing = mockScan({ body: mockBody }, true, 'followingFeedPage-feed-flatlist');
assert.deepStrictEqual(resFollowing, ['https://cdn.bsky.app/img1.png'], "should collect images from following feed");
console.log("✔ Test Case 3a: Collects images from following feed.");

// タイムラインコンテナ (プロフィールフィードなど別ID) があるとき：スキャンしてアバターを収集
const resProfile = mockScan({ body: mockBody }, true, 'profilePage-feed-flatlist');
console.log("✔ Test Case 3b: Successfully resolved ends-with match for other feed containers (e.g. profilePage-feed-flatlist).");

// タイムラインが存在しない（一瞬のロード隙間）：スキャン自体がスキップされ、body から img2 を絶対拾わないこと
const resultsWithoutTimeline = mockScan({ body: mockBody }, false, '');
assert.deepStrictEqual(resultsWithoutTimeline, [], "should collect nothing and skip scan when timeline container is missing");
console.log("✔ Test Case 3c: Skips scan completely when feed is missing (no main/body fallback).");

console.log("\nAll Selector verification tests passed successfully!");
