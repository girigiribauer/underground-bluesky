(function () {
  if (window.location.hostname !== 'bsky.app') {
    alert('地下ブルースカイの入り口は Bluesky (bsky.app) にあります');
    return;
  }
  var hasTimeline = !!document.querySelector('[data-testid^="feedItem-"], [data-testid="postThreadItem"], [data-testid*="notification"], [data-testid="searchScreen"]');
  if (!hasTimeline) {
    alert('このページには地下ブルースカイの入り口はありません。\nユーザーが並んでいるページで探してみてね');
    return;
  }
  var KEY = '__chikaBS7__';
  if (window[KEY]) { window[KEY](); window[KEY] = null; return; }

  var ROT_DEG = 2, MOVE_MS = 160, PAUSE_MS = 1200;
  var ROT_RAD = ROT_DEG * Math.PI / 180;
  var ARM_COUNT = 10;
  var svgFilter = null, maskEl = null;
  var rootEl = null;
  var origTransition = '', origTransform = '', origFilter = '', origTransformOrigin = '', origOpacity = '', origDisplay = '', origVisibility = '';
  var isIntroFinished = false;

  var fixedEls = [];
  function freezeFixedElements() {
    if (!rootEl) return;
    var rootRect = rootEl.getBoundingClientRect();
    var allEls = rootEl.getElementsByTagName('*');
    for (var i = 0; i < allEls.length; i++) {
      var el = allEls[i];
      var comp = window.getComputedStyle(el);
      // CSS filter on rootEl only breaks containing block for 'fixed' and 'absolute', not 'sticky'.
      if (comp.position === 'fixed') {
        var rect = el.getBoundingClientRect();
        fixedEls.push({
          el: el,
          origTransition: el.style.transition,
          origTop: el.style.top,
          origBottom: el.style.bottom,
          origLeft: el.style.left,
          origRight: el.style.right,
          origWidth: el.style.width,
          origHeight: el.style.height,
          origMargin: el.style.margin,
          origTransform: el.style.transform,
          origBoxSizing: el.style.boxSizing,
          rect: rect
        });
      }
    }
    // Set positions after calculating all to avoid layout thrashing
    for (var j = 0; j < fixedEls.length; j++) {
      var item = fixedEls[j];
      var e = item.el;
      e.style.transition = 'none';
      e.style.margin = '0px';
      e.style.transform = 'none';
      e.style.boxSizing = 'border-box';
      // Calculate position relative to rootEl's current visual position
      e.style.top = (item.rect.top - rootRect.top) + 'px';
      e.style.left = (item.rect.left - rootRect.left) + 'px';
      e.style.width = item.rect.width + 'px';
      e.style.height = item.rect.height + 'px';
      e.style.bottom = 'auto';
      e.style.right = 'auto';
    }
  }

  function unfreezeFixedElements() {
    for (var j = 0; j < fixedEls.length; j++) {
      var item = fixedEls[j];
      var e = item.el;
      e.style.transition = item.origTransition;
      e.style.top = item.origTop;
      e.style.bottom = item.origBottom;
      e.style.left = item.origLeft;
      e.style.right = item.origRight;
      e.style.width = item.origWidth;
      e.style.height = item.origHeight;
      e.style.margin = item.origMargin;
      e.style.transform = item.origTransform;
      e.style.boxSizing = item.origBoxSizing;
    }
    fixedEls = [];
  }

  function easeInQuad(t) { return t * t; }
  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

  function getSelfAvatar() {
    var el = document.querySelector('nav a[href^="/profile/"] [data-testid="userAvatarImage"] img') ||
             document.querySelector('[role="navigation"] a[href^="/profile/"] [data-testid="userAvatarImage"] img') ||
             document.querySelector('nav [data-testid="userAvatarImage"] img') ||
             document.querySelector('[role="navigation"] [data-testid="userAvatarImage"] img') ||
             document.querySelector('[data-testid="navProfileBtn"] img') ||
             document.querySelector('[data-testid="drawerBtn"] [data-testid="userAvatarImage"] img') ||
             document.querySelector('[data-testid="drawerBtn"] img');
    if (el && el.src) return el.src;

    var allImgs = document.querySelectorAll('a[href*="/profile/"] [data-testid="userAvatarImage"] img');
    for (var i = 0; i < allImgs.length; i++) {
      var parent = allImgs[i].parentNode;
      var isTimeline = false;
      while (parent && parent !== document.body) {
        var testId = parent.getAttribute('data-testid');
        if (testId && (testId.indexOf('feedItem') !== -1 || testId === 'postThreadItem')) {
          isTimeline = true;
          break;
        }
        parent = parent.parentNode;
      }
      if (!isTimeline && allImgs[i].src) {
        return allImgs[i].src;
      }
    }
    return null;
  }

  // 祖先を遡り、タイムラインの各投稿や通知のコンテナ内のアバターであるかを厳密に判定
  function isTimelineAvatar(img) {
    var parent = img.parentNode;
    var isTimeline = false;
    while (parent && parent !== document.body) {
      var testId = parent.getAttribute('data-testid');
      if (testId) {
        // 本文や添付、ラベルバッジなどコンテンツ領域内のアバターは除外
        if (testId === 'contentHider-post') {
          return false;
        }
        if (
          testId.indexOf('feedItem-') === 0 ||
          testId === 'postThreadItem' ||
          testId.indexOf('notification') !== -1 ||
          testId === 'searchScreen'
        ) {
          isTimeline = true;
        }
      }
      parent = parent.parentNode;
    }
    return isTimeline;
  }

  var seen = new Set(), imgs = new Array(ARM_COUNT).fill(null);

  var selfSrc = null;
  function checkSelfAvatar() {
    if (imgs[0] || selfSrc) return;
    selfSrc = getSelfAvatar();
    if (selfSrc) {
      seen.add(selfSrc);
      var selfImg = new Image();
      selfImg.onload = function () {
        imgs[0] = selfImg;
      };
      selfImg.src = selfSrc;
    }
  }
  checkSelfAvatar();
  var replaceIndex = 1;

  var W, H, PANEL_W, PANEL_H, PX, PY, CX, AX_W, ARM_LEN, YPERSP, PR, CY, GROUND_Y;
  var WL, fadeW, tlX, trX, torchY, fRY, fRX, axisTopY, axisBotY, capstanScaleRef;

  var resizeTimeout;
  function updateDimensions() {
    W = window.innerWidth;
    H = window.innerHeight;
    
    PANEL_W = W;
    PANEL_H = Math.round(H * 0.45);
    PX = 0;
    PY = H - PANEL_H;
    CX = W / 2;
    
    capstanScaleRef = Math.min(W * 0.8, 800);
    
    AX_W = Math.max(16, Math.round(capstanScaleRef * 0.025));
    ARM_LEN = Math.min(Math.round(capstanScaleRef * 0.26), 260);
    YPERSP = Math.round(PANEL_H * 0.15);
    PR = Math.max(10, Math.round(PANEL_H * 0.06));
    CY = PY + Math.round(PANEL_H * 0.72);
    GROUND_Y = CY + Math.round(PR * 1.2);

    WL = Math.round(PANEL_W * 0.16);
    fadeW = Math.round(PANEL_W * 0.07);
    tlX = CX - Math.round(capstanScaleRef * 0.35);
    trX = CX + Math.round(capstanScaleRef * 0.35);
    torchY = GROUND_Y - Math.round(PANEL_H * 0.48);
    fRY = Math.max(10, Math.round(PANEL_H * 0.055));
    fRX = Math.max(6, Math.round(capstanScaleRef * 0.012));
    axisTopY = PY + Math.round(PANEL_H * 0.10);
    axisBotY = GROUND_Y + Math.round(PR * 0.3);

    if (typeof canvas !== 'undefined' && canvas) {
      canvas.width = W;
      canvas.height = H;
    }
    if (typeof speedCanvas !== 'undefined' && speedCanvas) {
      speedCanvas.width = W;
      speedCanvas.height = H;
    }
  }

  function handleResize() {
    if (resizeTimeout) clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(updateDimensions, 150);
  }
  window.addEventListener('resize', handleResize);
  updateDimensions();

  svgFilter = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svgFilter.setAttribute('width', '0');
  svgFilter.setAttribute('height', '0');
  svgFilter.style.cssText = 'position:absolute;pointer-events:none;left:-9999px;top:-9999px;';
  svgFilter.innerHTML =
    '<defs>' +
      '<filter id="chika-distort-filter">' +
        // 粗めでありながらしっかり歪む周波数に調整
        '<feTurbulence type="fractalNoise" baseFrequency="0.012 0.035" numOctaves="1" result="noise" />' +
        '<feDisplacementMap id="chika-displace-map" in="SourceGraphic" in2="noise" scale="0" xChannelSelector="R" yChannelSelector="G" result="distorted" />' +
        // 歪みを殺さないよう、ぼかし上限を制限
        '<feGaussianBlur id="chika-blur-filter" in="distorted" stdDeviation="0" />' +
      '</filter>' +
    '</defs>';
  document.body.appendChild(svgFilter);

  // 暗転および薄暗さをコントロールする固定マスクDOM
  maskEl = document.createElement('div');
  maskEl.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;pointer-events:none;z-index:999999;' +
                         'background:#0a0604;opacity:0;';
  document.body.appendChild(maskEl);

  var canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  // 初期状態ではインタラクションを妨げないよう非表示
  canvas.style.cssText = 'position:fixed;top:0;left:0;pointer-events:none;z-index:1000000;display:none;';
  document.body.appendChild(canvas);
  var ctx = canvas.getContext('2d');

  var speedCanvas = document.createElement('canvas');
  speedCanvas.width = W; speedCanvas.height = H;
  speedCanvas.style.cssText = 'position:fixed;top:0;left:0;pointer-events:none;z-index:1000001;display:none;';
  document.body.appendChild(speedCanvas);
  var speedCtx = speedCanvas.getContext('2d');

  rootEl = document.getElementById('root') || document.body.firstElementChild;
  if (rootEl) {
    origTransition = rootEl.style.transition;
    origTransform = rootEl.style.transform;
    origFilter = rootEl.style.filter;
    origTransformOrigin = rootEl.style.transformOrigin;
    origOpacity = rootEl.style.opacity;
    origDisplay = rootEl.style.display;
    origVisibility = rootEl.style.visibility;
  }

  // スピード線のデータ初期化
  var speedLines = [];
  var LINE_COUNT = 35;
  for (var i = 0; i < LINE_COUNT; i++) {
    speedLines.push({
      x: Math.random() * W,
      y: Math.random() * H,
      len: 50 + Math.random() * 100,
      speed: 20 + Math.random() * 20
    });
  }

  var phaseTriggered = { p1: false, p2: false, p3: false, p4: false, finished: false };

  function drawSpeedLines(progress, opacityLimit) {
    speedCtx.clearRect(0, 0, W, H);

    // 加速・減速イージング (Math.sinによって滑らかに繋ぐ)
    var speedMult = Math.sin(progress * Math.PI);
    var opacityMult = speedMult * opacityLimit;

    speedCtx.strokeStyle = 'rgba(230, 220, 190, ' + (0.35 * opacityMult) + ')';
    speedCtx.lineWidth = 1.5;
    speedCtx.beginPath();
    speedLines.forEach(function (line) {
      speedCtx.moveTo(line.x, line.y);
      // 下から上へ移動するので、線は進行方向の後ろ（下側）に伸びる
      speedCtx.lineTo(line.x, line.y + line.len * speedMult);

      line.y -= line.speed * speedMult;
      if (line.y < -line.len) {
        line.y = H;
        line.x = Math.random() * W;
      }
    });
    speedCtx.stroke();
  }
  var stalPts = [0.14, 0.24, 0.38, 0.52, 0.64, 0.76, 0.86];
  var stalH = [0.17, 0.10, 0.22, 0.13, 0.19, 0.09, 0.16];

  function rrect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawBackground() {
    // 四角の横長（全体に広がる）グラデーション
    // 足元から画面上部に向かって暗闇に溶け込む
    var bg = ctx.createLinearGradient(0, H, 0, 0);
    bg.addColorStop(0, 'rgba(58, 37, 16, 1.0)'); // 画面一番下 (100%)
    bg.addColorStop(0.2, 'rgba(35, 21, 8, 0.95)'); // 下から20% (80%)
    bg.addColorStop(0.5, 'rgba(10, 6, 4, 0.8)'); // 画面中央 (50%) ここを濃い背景の境目にする
    bg.addColorStop(0.65, 'rgba(10, 6, 4, 0)'); // 上部 (35%〜0%) は完全に透明にする
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H); // 全画面を覆ってフェードアウト

    // カプスタンの土台となる楕円
    ctx.fillStyle = 'rgba(114, 64, 24, 0.8)'; // #724018
    ctx.beginPath();
    ctx.ellipse(CX, GROUND_Y, Math.round(ARM_LEN * 1.15), YPERSP, 0, 0, Math.PI * 2);
    ctx.fill();

    [tlX, trX].forEach(function (tx) {
      var glow = ctx.createRadialGradient(tx, torchY, 0, tx, torchY, Math.round(capstanScaleRef * 0.15));
      glow.addColorStop(0, 'rgba(255,102,0,0.25)');
      glow.addColorStop(1, 'rgba(255,102,0,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.ellipse(tx, torchY, Math.round(capstanScaleRef * 0.15), Math.round(PANEL_H * 0.30), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#5c3a18';
      ctx.fillRect(tx - 3, torchY + 12, 6, Math.round(PANEL_H * 0.10));
    });
  }

  function drawAxis() {
    ctx.save();
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(CX, GROUND_Y + 2, Math.round(AX_W * 0.9), Math.max(4, Math.round(AX_W * 0.28)), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    var topY = axisTopY; // 元の長さに戻す
    var fadeLen = Math.round(PANEL_H * 0.2); // 先端だけ少しフェードアウトさせる

    var gradBase = ctx.createLinearGradient(0, topY, 0, topY + fadeLen);
    gradBase.addColorStop(0, 'rgba(74, 48, 21, 0)');
    gradBase.addColorStop(1, 'rgba(74, 48, 21, 1)'); // #4a3015

    ctx.fillStyle = gradBase;
    rrect(CX - AX_W / 2, topY, AX_W, axisBotY - topY, Math.round(AX_W * 0.2));
    ctx.fill();

    var gradHigh = ctx.createLinearGradient(0, topY + 10, 0, topY + 10 + fadeLen);
    gradHigh.addColorStop(0, 'rgba(122, 80, 32, 0)');
    gradHigh.addColorStop(1, 'rgba(122, 80, 32, 1)'); // #7a5020

    ctx.fillStyle = gradHigh;
    rrect(CX - AX_W / 2 + 2, topY + 10, Math.max(3, Math.round(AX_W * 0.22)), axisBotY - topY - 20, 2);
    ctx.fill();
  }

  function drawPerson(tipX, tipY, alpha, sinA, stride, img) {
    var R = PR * 1.5;

    // Thick cylinders + ball joints for wooden-mannequin look
    var rArm   = R * 0.28;
    var rLeg   = R * 0.26;
    var rTorso = R * 0.38;
    var rBall  = R * 0.32;

    var FRONT = '#ddd4a8';
    var BACK  = '#a09060';
    var BALL  = '#c8bc88';

    var shX=1.80, shY=-0.20;
    var elX=0.90, elY=-0.10;
    var nkX=2.00, nkY=-0.30;
    var hdX=1.40, hdY=-0.70;
    var hpX=3.20, hpY=0.40;

    var gnd = Math.max(1.2, Math.min(2.8, (GROUND_Y - tipY) / R));

    // Calculate continuous walk phase from display angle (1周あたり12歩のどっしりしたピッチに変更)
    var walkPhase = totalAngle * 12.0;
    var cosW = Math.cos(walkPhase);

    // Left leg (A) and Right leg (B) swing coordinates (unified phase to prevent crossover jump)
    var knX_A = 3.00 + 0.80 * cosW;
    var ftX_A = 3.30 + 0.90 * cosW;
    var kY_A  = gnd * 0.58 + 0.10 * cosW;
    var gnd_A = gnd + 0.12 * Math.min(0, cosW);

    var knX_B = 3.00 - 0.80 * cosW;
    var ftX_B = 3.30 - 0.90 * cosW;
    var kY_B  = gnd * 0.58 - 0.10 * cosW;
    var gnd_B = gnd + 0.12 * Math.min(0, -cosW);

    // Swap near/far leg variables based on cosine phase (crossing point) for true stepping crossover
    var farKnX, farFtX, farKY, farGnd;
    var nearKnX, nearFtX, nearKY, nearGnd;
    if (cosW >= 0) {
      nearKnX = knX_A; nearFtX = ftX_A; nearKY = kY_A; nearGnd = gnd_A;
      farKnX  = knX_B; farFtX  = ftX_B; farKY  = kY_B; farGnd  = gnd_B;
    } else {
      nearKnX = knX_B; nearFtX = ftX_B; nearKY = kY_B; nearGnd = gnd_B;
      farKnX  = knX_A; farFtX  = ftX_A; farKY  = kY_A; farGnd  = gnd_A;
    }

    // Prevents avatar disappearance by ensuring a minimum width threshold
    var scaleX = sinA;
    if (Math.abs(scaleX) < 0.15) {
      scaleX = scaleX >= 0 ? 0.15 : -0.15;
    }

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(tipX, tipY);
    ctx.scale(scaleX, 1); // X-axis scale based on scaleX for 3D rotation and direction flip
    ctx.lineCap = 'round';

    function px(x) { return x * R; }
    function py(y) { return y * R; }

    function cyl(x1, y1, x2, y2, r, col) {
      ctx.strokeStyle = col; ctx.lineWidth = r * 2;
      ctx.beginPath(); ctx.moveTo(px(x1), py(y1)); ctx.lineTo(px(x2), py(y2)); ctx.stroke();
    }
    function ball(x, y, r, col) {
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(px(x), py(y), r, 0, Math.PI * 2); ctx.fill();
    }

    // Back leg (rendered behind torso)
    cyl(hpX, hpY, farKnX, farKY,  rLeg, BACK);
    cyl(farKnX, farKY, farFtX, farGnd, rLeg * 0.88, BACK);
    ball(farKnX, farKY, rBall * 0.85, BACK);
    ball(farFtX, farGnd, rBall * 0.72, BACK);

    // Far arm (depth offset)
    cyl(shX+0.18, shY-0.10, elX+0.18, elY-0.10, rArm, BACK);
    cyl(elX+0.18, elY-0.10, 0.18, -0.10, rArm * 0.88, BACK);

    // Torso
    cyl(nkX, nkY, hpX, hpY, rTorso, FRONT);
    ball(hpX, hpY, rBall * 1.20, BALL);

    // --- Arm (capstan beam) rendered in front of torso but behind near arm ---
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = '#a07840';
    ctx.lineWidth = Math.max(6, Math.round(AX_W * 0.4));
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(CX, CY);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(tipX, tipY);
    ctx.scale(scaleX, 1);
    ctx.lineCap = 'round';

    // Near arm
    cyl(shX, shY, elX, elY, rArm, FRONT);
    cyl(elX, elY, 0, 0, rArm * 0.88, FRONT);
    ball(shX,  shY, rBall,        BALL);
    ball(elX,  elY, rBall * 0.88, BALL);
    ball(0,    0,   rBall * 0.80, BALL);

    // Front leg (rendered in front of torso)
    cyl(hpX, hpY, nearKnX, nearKY,  rLeg, FRONT);
    cyl(nearKnX, nearKY, nearFtX, nearGnd, rLeg * 0.88, FRONT);
    ball(nearKnX, nearKY,  rBall * 0.90, BALL);
    ball(nearFtX, nearGnd, rBall * 0.78, BALL);

    // Avatar head
    ctx.save();
    ctx.beginPath();
    ctx.arc(px(hdX), py(hdY), R, 0, Math.PI * 2);
    ctx.clip();
    if (img && img.complete && img.naturalWidth) {
      try {
        ctx.drawImage(img, px(hdX) - R, py(hdY) - R, R * 2, R * 2);
      } catch (e) {
        ctx.fillStyle = FRONT;
        ctx.fill();
      }
    } else {
      ctx.fillStyle = FRONT;
      ctx.fill();
    }
    ctx.restore();

    ctx.restore();
  }

  function drawOverlay(flameF) {
    [tlX, trX].forEach(function (tx) {
      var ry = Math.round(fRY * flameF);
      var rx = Math.round(fRX * (1.2 - flameF * 0.2));
      var gr = ctx.createRadialGradient(tx, torchY, 0, tx, torchY, Math.max(rx, ry) * 1.5);
      gr.addColorStop(0, '#ffff99');
      gr.addColorStop(0.45, '#ff7700');
      gr.addColorStop(1, 'rgba(255,34,0,0)');
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.ellipse(tx, torchY, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function drawFrame(dispAngle, stride) {
    ctx.clearRect(0, 0, W, H);

    ctx.save();
    drawBackground();

    var order = [];
    for (var n = 0; n < ARM_COUNT; n++) {
      var a = dispAngle + (n / ARM_COUNT) * Math.PI * 2;
      var sinA = Math.sin(a), cosA = Math.cos(a);
      var depth = 1.0;
      order.push({
        idx: n, sinA: sinA, cosA: cosA,
        tipX: CX + ARM_LEN * cosA,
        tipY: CY + YPERSP * sinA,
        depth: depth
      });
    }
    // back-to-front: ascending sinA (draw from back to front)
    order.sort(function (a, b) { return a.sinA - b.sinA; });

    // back half: person (behind axis)
    order.forEach(function (d) {
      if (d.sinA > 0) return;
      drawPerson(d.tipX, d.tipY, d.depth, d.sinA, stride, imgs[d.idx]);
    });

    drawAxis();

    // front half: person (in front of axis)
    order.forEach(function (d) {
      if (d.sinA <= 0) return;
      drawPerson(d.tipX, d.tipY, d.depth, d.sinA, stride, imgs[d.idx]);
    });

    drawOverlay(0.80 + Math.random() * 0.40);
    ctx.restore();
  }

  var totalAngle = Math.PI * 0.3, stride = 0, rafId;
  var isScrolling = false;
  var scrollTimeout = null;
  var lastScrollY = window.scrollY;
  var avatarQueue = [];

  var lastScrollCheckTime = 0;

  function scrollHandler() {
    if (!isIntroFinished) return;
    var currentScrollY = window.scrollY;
    var delta = currentScrollY - lastScrollY;

    if (delta > 8) {
      isScrolling = true;
      if (scrollTimeout) clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(function () {
        isScrolling = false;
      }, 150);

      var now = Date.now();
      if (now - lastScrollCheckTime > 150) {
        lastScrollCheckTime = now;
        checkSelfAvatar();

        var targetEl = document.elementFromPoint(W / 2, H / 2);
        if (targetEl) {
          var parent = targetEl;
          var foundImg = null;
          while (parent && parent !== document.body) {
            var testId = parent.getAttribute ? parent.getAttribute('data-testid') : null;
            var role = parent.getAttribute ? parent.getAttribute('role') : null;
            
            var isFeedItem = testId && (testId.indexOf('feedItem-') === 0 || testId === 'postThreadItem' || testId.indexOf('notification') !== -1);
            var isSearchItem = (role === 'link');
            
            if (isFeedItem || isSearchItem) {
              var img = parent.querySelector('[data-testid="userAvatarImage"] img');
              if (img) {
                foundImg = img;
                break;
              }
            }
            parent = parent.parentNode;
          }
          if (foundImg && foundImg.src) {
            if (!seen.has(foundImg.src) && (!selfSrc || foundImg.src !== selfSrc)) {
              if (isTimelineAvatar(foundImg)) {
                seen.add(foundImg.src);
                avatarQueue.push(foundImg.src);
              }
            }
          }
        }
      }
      lastScrollY = currentScrollY;
    } else if (delta < 0) {
      isScrolling = false;
      if (scrollTimeout) clearTimeout(scrollTimeout);
      lastScrollY = currentScrollY;
    }
  }

  window.addEventListener('scroll', scrollHandler);

  var stepSpeed = 0.00405; // speed of rotation while scrolling (2.25x original speed)

  var introStartTime = null;

  function animate(ts) {
    checkSelfAvatar();

    if (!isIntroFinished) {
      if (!introStartTime) introStartTime = ts;
      var elapsed = ts - introStartTime;

      if (elapsed < 1000) {
        // --- 0ms 〜 1000ms: その場でぐにゃり歪み開始 ---
        if (!phaseTriggered.p1) {
          phaseTriggered.p1 = true;
          freezeFixedElements();
          if (rootEl) {
            rootEl.style.filter = 'url(#chika-distort-filter)';
          }
        }

        // 歪みは 1200ms 基準で進行
        var progressDistort = elapsed / 1200;
        var pValDistort = easeInQuad(progressDistort);

        // 歪みの強さ（scale: 0 -> 240）
        var dmEl = document.getElementById('chika-displace-map');
        if (dmEl) {
          dmEl.setAttribute('scale', (pValDistort * 240).toString());
        }
        // ぼかしの強さ（stdDeviation: 0 -> 1.2）
        var blurEl = document.getElementById('chika-blur-filter');
        if (blurEl) {
          blurEl.setAttribute('stdDeviation', (pValDistort * 1.2).toString());
        }

        // その場での歪み（平面での拡大）
        if (rootEl) {
          rootEl.style.transformOrigin = 'center bottom';
          rootEl.style.transition = 'none';
          rootEl.style.transform = 'scale(' + (1.0 + 0.08 * pValDistort) + ')';
        }
        if (maskEl) {
          maskEl.style.opacity = '0';
        }
      } else if (elapsed < 2000) {
        // --- 1000ms 〜 2000ms: 上方向への加速移動開始 & 歪みは 1200ms まで増加継続 ---
        if (!phaseTriggered.p2) {
          phaseTriggered.p2 = true;
          speedCanvas.style.display = 'block';
          speedCanvas.style.opacity = '1';
        }

        // 歪みとぼかし、スケール拡大率の計算（1200msまでは進行、それ以降は最大値固定）
        var scaleVal = 240;
        var blurVal = 1.2;
        var scale2D = 1.08;

        if (elapsed < 1200) {
          var progressDistort = elapsed / 1200;
          var pValDistort = easeInQuad(progressDistort);
          scaleVal = pValDistort * 240;
          blurVal = pValDistort * 1.2;
          scale2D = 1.0 + 0.08 * pValDistort;
        }

        var dmEl = document.getElementById('chika-displace-map');
        if (dmEl) {
          dmEl.setAttribute('scale', scaleVal.toString());
        }
        var blurEl = document.getElementById('chika-blur-filter');
        if (blurEl) {
          blurEl.setAttribute('stdDeviation', blurVal.toString());
        }

        // 移動と不透明度の進行（1000ms 〜 2000ms で進行）
        var progressMove = (elapsed - 1000) / 1000;
        var pValMove = easeInQuad(progressMove);

        // 元の画面は上方向（0 -> -H）へ加速移動 & フェードアウト（拡大スケールを維持）
        if (rootEl) {
          rootEl.style.opacity = (1.0 - progressMove).toString();
          rootEl.style.transform = 'translateY(' + (-H * pValMove) + 'px) scale(' + scale2D + ')';
        }

        // 黒マスクのフェードイン (0 -> 1.0)
        if (maskEl) {
          maskEl.style.opacity = progressMove.toString();
        }

        // スピード線のフェードイン (不透明度制限 0 -> 1.0)
        var progressLine = (elapsed - 1000) / 3000;
        drawSpeedLines(progressLine, progressMove);
      } else if (elapsed < 3000) {
        // --- 2000ms 〜 3000ms: 暗転スピード線単独（高速落下） ---
        if (!phaseTriggered.p3) {
          phaseTriggered.p3 = true;
          if (rootEl) {
            rootEl.style.visibility = 'hidden';
            rootEl.style.opacity = origOpacity;
            rootEl.style.filter = origFilter;
            rootEl.style.transform = origTransform;
          }
          if (maskEl) {
            maskEl.style.opacity = '1.0';
          }
        }

        var progressLine = (elapsed - 1000) / 3000;
        drawSpeedLines(progressLine, 1.0);
      } else if (elapsed < 4000) {
        // --- 3000ms 〜 4000ms: 下からせり上がり & スピード線フェードアウト ---
        var progress = (elapsed - 3000) / 1000; // 0 -> 1
        var pEase = easeOutCubic(progress);

        if (!phaseTriggered.p4) {
          phaseTriggered.p4 = true;
          if (rootEl) {
            rootEl.style.visibility = origVisibility;
            rootEl.style.transformOrigin = 'center bottom';
            rootEl.style.transition = 'none';
          }
          canvas.style.display = 'block';
          canvas.style.transition = 'none';
        }

        // 黒マスクを 1.0 から 0.55 へフェードアウト（薄暗い状態へ）
        if (maskEl) {
          maskEl.style.opacity = (1.0 - (1.0 - 0.55) * pEase).toString();
        }

        // 下からせり上がり（H から 0） & フェードイン（0 -> 1.0）
        var ty = H * (1.0 - pEase);
        if (rootEl) {
          rootEl.style.opacity = progress.toString();
          rootEl.style.transform = 'translateY(' + ty + 'px)';
        }
        canvas.style.opacity = progress.toString();
        canvas.style.transform = 'translateY(' + ty + 'px)';

        // カプスタンの描画
        drawFrame(totalAngle, stride);

        // スピード線のフェードアウト (不透明度制限 1.0 -> 0.0)
        var progressLine = (elapsed - 1000) / 3000;
        drawSpeedLines(progressLine, 1.0 - progress);
      } else {
        // --- 4000ms 〜 : 通常稼働への完全移行 ---
        if (!phaseTriggered.finished) {
          phaseTriggered.finished = true;
          isIntroFinished = true;
          unfreezeFixedElements();
          if (rootEl) {
            rootEl.style.transition = origTransition;
            rootEl.style.transform = origTransform;
            rootEl.style.filter = origFilter;
            rootEl.style.transformOrigin = origTransformOrigin;
            rootEl.style.opacity = origOpacity;
            rootEl.style.display = origDisplay;
            rootEl.style.visibility = origVisibility;
          }
          canvas.style.transition = '';
          canvas.style.transform = '';
          canvas.style.opacity = '1';
          speedCanvas.style.display = 'none';
          speedCanvas.remove();
          
          // 通常稼働中も薄暗さを維持するため、maskEl の opacity は 0.55 のままで維持する（削除もしない）
          if (maskEl) {
            maskEl.style.opacity = '0.55';
          }
        }
        runNormalFrame();
      }
    } else {
      runNormalFrame();
    }

    rafId = requestAnimationFrame(animate);
  }

  function runNormalFrame() {
    var prevAngleLocal = totalAngle;
    if (isScrolling && isIntroFinished) {
      totalAngle += stepSpeed;
    }

    if (avatarQueue.length > 0) {
      for (var n = 0; n < ARM_COUNT; n++) {
        if (n === 0) continue; // 自分は固定

        var a = totalAngle + (n / ARM_COUNT) * Math.PI * 2;
        var aMod = a % (Math.PI * 2);

        if (imgs[n] === null && aMod >= 0 && aMod <= Math.PI * 0.3 && isScrolling && isIntroFinished) {
          if (avatarQueue.length > 0) {
            var nextSrc = avatarQueue.shift();
            (function (targetIndex) {
              var newImg = new Image();
              newImg.onload = function () {
                imgs[targetIndex] = newImg;
              };
              newImg.src = nextSrc;
            })(n);
          }
          continue;
        }

        var prevA = prevAngleLocal + (n / ARM_COUNT) * Math.PI * 2;
        var currA = totalAngle + (n / ARM_COUNT) * Math.PI * 2;
        if (isScrolling && isIntroFinished && Math.floor(prevA / (Math.PI * 2)) < Math.floor(currA / (Math.PI * 2))) {
          if (avatarQueue.length > 0) {
            var nextSrc = avatarQueue.shift();
            (function (targetIndex) {
              var newImg = new Image();
              newImg.onload = function () {
                imgs[targetIndex] = newImg;
              };
              newImg.src = nextSrc;
            })(n);
          }
        }
      }
    }

    drawFrame(totalAngle, stride);
  }

  rafId = requestAnimationFrame(animate);
  window[KEY] = function () {
    cancelAnimationFrame(rafId);
    window.removeEventListener('resize', handleResize);
    window.removeEventListener('scroll', scrollHandler);
    if (scrollTimeout) clearTimeout(scrollTimeout);
    canvas.remove();
    if (typeof speedCanvas !== 'undefined' && speedCanvas) speedCanvas.remove();
    if (rootEl) {
      rootEl.style.transition = origTransition;
      rootEl.style.transform = origTransform;
      rootEl.style.filter = origFilter;
      rootEl.style.transformOrigin = origTransformOrigin;
      rootEl.style.opacity = origOpacity;
      rootEl.style.display = origDisplay;
      rootEl.style.visibility = origVisibility;
    }
    if (svgFilter) {
      svgFilter.remove();
    }
    if (maskEl) {
      maskEl.remove();
      maskEl = null;
    }
  };
})();
