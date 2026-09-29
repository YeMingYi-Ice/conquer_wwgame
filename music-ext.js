(function () {
  'use strict';

  /* ==========================================================================
   * 《征服世界》音乐播放器扩展 —— music-ext.js  v2
   * v2 变更：新增随机播放（洗牌袋，一轮不重复）、上限提到 2000 首
   * 纯原生 JS / 无依赖 / 兼容 iOS 12 Safari
   * 挂载点：<div id="ext-music-slot"></div>
   * ========================================================================== */

  var VERSION = 'v2';

  // ---------- 常量 ----------
  var LS_KEY        = 'musicExt.scanPaths';
  var DEFAULT_PATHS = './music, ./Music, /music';
  var AUDIO_EXTS    = ['mp3','m4a','aac','wav','ogg','oga','opus','flac','wma','ape'];
  var MAX_TRACKS    = 2000;   // 单次扫描最多收集曲目数（原 600，为大批量曲库上调）
  var MAX_DIRS      = 500;    // 单次扫描最多访问目录数（原 200）
  var MAX_DEPTH     = 6;

  // ---------- 样式 ----------
  var CSS = [
    '.mx-panel{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:12px;margin:10px 0;',
      'font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Helvetica Neue",Arial,sans-serif;',
      'font-size:13px;line-height:1.5;color:#1e293b;box-sizing:border-box;-webkit-text-size-adjust:100%;}',
    '.mx-panel *,.mx-panel *::before,.mx-panel *::after{box-sizing:border-box;}',
    '.mx-head{display:-webkit-box;display:flex;-webkit-box-align:center;align-items:center;',
      '-webkit-box-pack:justify;justify-content:space-between;margin-bottom:10px;}',
    '.mx-title{font-weight:700;font-size:15px;color:#0f172a;white-space:nowrap;}',
    '.mx-status{font-size:11px;color:#64748b;margin-left:8px;text-align:right;white-space:nowrap;',
      'overflow:hidden;text-overflow:ellipsis;-webkit-box-flex:1;flex:1 1 auto;min-width:0;}',
    '.mx-label{display:block;font-size:11px;color:#64748b;margin-bottom:4px;}',
    '.mx-input{display:block;width:100%;padding:8px 10px;font-size:13px;font-family:inherit;color:#1e293b;',
      'background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;outline:none;',
      '-webkit-appearance:none;appearance:none;}',
    '.mx-input:focus{border-color:#93c5fd;background:#fff;}',
    '.mx-resolved{font-size:10px;color:#94a3b8;margin:4px 0 6px;line-height:1.5;word-break:break-all;}',
    '.mx-warn{color:#dc2626;}',
    '.mx-row{display:-webkit-box;display:flex;margin:8px 0;}',
    '.mx-btn{-webkit-box-flex:1;flex:1 1 0;min-width:0;margin-right:6px;padding:8px 2px;font-size:15px;',
      'font-family:inherit;font-weight:600;line-height:1.2;color:#334155;background:#f8fafc;',
      'border:1px solid #e2e8f0;border-radius:8px;cursor:pointer;',
      '-webkit-appearance:none;appearance:none;-webkit-user-select:none;user-select:none;}',
    '.mx-btn:last-child{margin-right:0;}',
    '.mx-btn:active{background:#e2e8f0;}',
    '.mx-btn[disabled]{opacity:.5;}',
    '.mx-btn.mx-on{background:#dbeafe;border-color:#93c5fd;color:#1d4ed8;}',
    '.mx-select{display:block;width:100%;padding:8px;font-size:13px;font-family:inherit;color:#1e293b;',
      'background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:8px;}',
    '.mx-audio{display:block;width:100%;height:36px;margin-bottom:8px;}',
    '.mx-tip{font-size:11px;color:#94a3b8;line-height:1.6;}',
    '.mx-tip b{color:#64748b;font-weight:600;}'
  ].join('');

  // ---------- 面板 HTML ----------
  var PANEL_HTML = [
    '<div class="mx-head">',
      '<span class="mx-title">🎵 音乐</span>',
      '<span class="mx-status">' + VERSION + ' · 未加载</span>',
    '</div>',
    '<label class="mx-label" for="mx-paths-input">扫描路径（多个用英文逗号分隔）</label>',
    '<input class="mx-input" id="mx-paths-input" type="text" inputmode="url" autocomplete="off" ',
      'autocapitalize="off" autocorrect="off" spellcheck="false" ',
      'placeholder="./music, /music, http://127.0.0.1:8081/kuwomusic">',
    '<div class="mx-resolved"></div>',
    '<div class="mx-row">',
      '<button class="mx-btn" id="mx-btn-scan"    type="button" title="扫描目录">🔄</button>',
      '<button class="mx-btn" id="mx-btn-prev"    type="button" title="上一首">⏮</button>',
      '<button class="mx-btn" id="mx-btn-toggle"  type="button" title="播放">▶</button>',
      '<button class="mx-btn" id="mx-btn-next"    type="button" title="下一首">⏭</button>',
      '<button class="mx-btn" id="mx-btn-shuffle" type="button" title="随机播放（开/关）">🔀</button>',
    '</div>',
    '<select class="mx-select" id="mx-track-list"><option value="">— 尚未扫描 —</option></select>',
    '<audio class="mx-audio" id="mx-audio" controls preload="none"></audio>',
    '<div class="mx-tip">路径支持 <b>相对</b> <b>./music</b>、<b>站点绝对</b> <b>/music</b>、',
      '<b>完整 URL</b> <b>http://主机:端口/kuwomusic</b>。',
      '点 <b>🔀</b> 开随机：<b>⏭</b> 和自动切歌都会随机挑，一轮不重复；<b>⏮</b> 仍按顺序回退。',
      '支持 mp3 / m4a / aac / wav / ogg / opus / flac / wma / ape。</div>'
  ].join('');

  // ---------- 模块内部状态 ----------
  var tracks = [];
  var currentIndex = -1;
  var scanning = false;

  var shuffleOn  = false;
  var shuffleBag = [];

  var elStatus = null, elPaths = null, elResolved = null, elScan = null,
      elPrev = null, elToggle = null, elNext = null, elShuffle = null,
      elList = null, elAudio = null;

  // ==========================================================================
  // 小工具
  // ==========================================================================

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getExt(name) {
    var i = name.lastIndexOf('.');
    if (i <= 0 || i === name.length - 1) return '';
    return name.slice(i + 1).toLowerCase();
  }

  function toDirUrl(p) {
    var s = String(p).replace(/^\s+|\s+$/g, '');
    if (!s) return '';
    var u;
    try {
      if (/^[a-zA-Z][a-zA-Z0-9+.\-]*:/.test(s)) {
        u = new URL(s);
      } else {
        u = new URL(s, window.location.href);
      }
    } catch (e) {
      console.info('[MusicExt] 路径无法解析：' + s, e);
      return '';
    }
    u.search = '';
    u.hash = '';
    if (u.pathname.charAt(u.pathname.length - 1) !== '/') {
      u.pathname = u.pathname + '/';
    }
    return u.href;
  }

  function tailPath(pathname, n) {
    n = n || 3;
    var decoded;
    try { decoded = decodeURIComponent(pathname); }
    catch (e) { decoded = pathname; }
    var parts = decoded.split('/');
    var keep = [];
    for (var i = 0; i < parts.length; i++) {
      if (parts[i]) keep.push(parts[i]);
    }
    if (keep.length > n) keep = keep.slice(keep.length - n);
    var out = keep.join('/');
    return out || decoded;
  }

  function parsePaths(str) {
    var parts = String(str || '').split(',');
    var out = [];
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i].replace(/^\s+|\s+$/g, '');
      if (p) out.push(p);
    }
    return out;
  }

  function loadPaths() {
    try {
      var v = window.localStorage.getItem(LS_KEY);
      if (v !== null && v !== '') return v;
    } catch (e) {}
    return DEFAULT_PATHS;
  }

  function persistPaths() {
    try { window.localStorage.setItem(LS_KEY, elPaths.value); } catch (e) {}
  }

  function setStatus(text) {
    if (elStatus) elStatus.textContent = text;
  }

  function setToggleIcon(playing) {
    if (!elToggle) return;
    elToggle.textContent = playing ? '⏸' : '▶';
    elToggle.title = playing ? '暂停' : '播放';
  }

  function updateResolvedHint() {
    if (!elResolved || !elPaths) return;
    var roots = parsePaths(elPaths.value);
    if (!roots.length) { elResolved.innerHTML = ''; return; }

    var lines = [];
    var bad = 0;
    for (var i = 0; i < roots.length && i < 3; i++) {
      var u = toDirUrl(roots[i]);
      if (!u) {
        bad++;
        lines.push('<span class="mx-warn">✗ ' + escapeHtml(roots[i]) + '（无法解析）</span>');
      } else {
        lines.push('→ ' + escapeHtml(u));
      }
    }
    if (roots.length > 3) lines.push('→ …还有 ' + (roots.length - 3) + ' 个');

    if (window.location.protocol === 'file:') {
      lines.push('<span class="mx-warn">⚠️ 当前以 file:// 打开，浏览器无法列目录，请改用 http:// 访问</span>');
    } else if (bad === roots.length && roots.length > 0) {
      lines.push('<span class="mx-warn">⚠️ 所有路径都无法解析</span>');
    }

    elResolved.innerHTML = lines.join('<br>');
  }

  // ==========================================================================
  // 目录抓取
  // ==========================================================================

  async function fetchDir(url) {
    var res;
    try {
      res = await fetch(url, { cache: 'no-store' });
    } catch (e) {
      var ne = new Error('网络错误');
      ne.kind = 'network';
      ne.cause = e;
      throw ne;
    }
    if (!res.ok) {
      var he = new Error('HTTP ' + res.status);
      he.kind = 'http';
      he.status = res.status;
      throw he;
    }
    var text = await res.text();
    var doc;
    try {
      doc = new DOMParser().parseFromString(text, 'text/html');
    } catch (e2) {
      var pe = new Error('HTML 解析失败');
      pe.kind = 'parse';
      throw pe;
    }
    return { doc: doc, text: text };
  }

  // ==========================================================================
  // 扫描主流程
  // ==========================================================================
  async function doScan() {
    if (scanning) return;
    scanning = true;
    elScan.disabled = true;

    var started = Date.now();
    persistPaths();
    updateResolvedHint();

    stopAudio();
    tracks = [];
    currentIndex = -1;
    shuffleBag = [];
    elList.innerHTML = '<option value="">— 扫描中 —</option>';
    elList.value = '';
    setStatus('扫描中…');

    if (window.location.protocol === 'file:') {
      console.info('[MusicExt] file:// 协议下 fetch 目录索引通常会被浏览器拒绝。');
    }

    var queue = [];
    var seenDirs = {};
    var seenTracks = {};
    var dirCount = 0, okDirs = 0, failDirs = 0;

    var roots = parsePaths(elPaths.value);
    for (var i = 0; i < roots.length; i++) {
      var rootUrl = toDirUrl(roots[i]);
      if (!rootUrl) continue;
      if (seenDirs[rootUrl]) continue;
      seenDirs[rootUrl] = true;
      queue.push({ url: rootUrl, depth: 0 });
    }

    if (queue.length === 0) {
      scanning = false;
      elScan.disabled = false;
      renderList();
      setStatus('路径无效');
      return;
    }

    console.info('[MusicExt] ' + VERSION + ' 扫描起点：');
    for (var q = 0; q < queue.length; q++) console.info('  ' + queue[q].url);

    try {
      while (queue.length > 0 && tracks.length < MAX_TRACKS && dirCount < MAX_DIRS) {
        var dir = queue.shift();
        dirCount++;
        setStatus('扫描中… ' + tracks.length + ' 首 / ' + dirCount + ' 目录' +
                  (failDirs ? '（失败 ' + failDirs + '）' : ''));

        var parsed;
        try {
          parsed = await fetchDir(dir.url);
          okDirs++;
        } catch (err) {
          failDirs++;
          var reason = err && err.kind === 'http'    ? ('HTTP ' + err.status) :
                       err && err.kind === 'network' ? '网络/CORS 被拒' :
                       (err && err.message) || '未知错误';
          console.info('[MusicExt] 目录读取失败：' + dir.url + ' → ' + reason);
          continue;
        }

        var anchors = parsed.doc.getElementsByTagName('a');
        for (var k = 0; k < anchors.length; k++) {
          if (tracks.length >= MAX_TRACKS) break;

          var raw = anchors[k].getAttribute('href');
          if (!raw || raw.charAt(0) === '#') continue;

          var u;
          try { u = new URL(raw, dir.url); } catch (e) { continue; }
          if (u.protocol !== 'http:' && u.protocol !== 'https:' &&
              u.protocol !== 'file:') continue;

          var pname = u.pathname;
          var trimmed = pname;
          if (trimmed.charAt(trimmed.length - 1) === '/') {
            trimmed = trimmed.slice(0, -1);
          }
          var lastSlash = trimmed.lastIndexOf('/');
          var seg = trimmed.slice(lastSlash + 1);

          if (!seg || seg.charAt(0) === '.') continue;

          var isDir = pname.charAt(pname.length - 1) === '/';
          var ext = isDir ? '' : getExt(seg);

          if (!isDir && AUDIO_EXTS.indexOf(ext) >= 0) {
            if (seenTracks[u.href]) continue;
            seenTracks[u.href] = true;
            tracks.push({
              url: u.href,
              name: seg,
              label: tailPath(pname, 3)
            });
          } else if (isDir || ext === '') {
            if (dir.depth >= MAX_DEPTH) continue;
            u.search = '';
            u.hash = '';
            var childUrl = u.href;
            if (seenDirs[childUrl]) continue;
            if (childUrl.indexOf(dir.url) !== 0) continue;
            seenDirs[childUrl] = true;
            queue.push({ url: childUrl, depth: dir.depth + 1 });
          }
        }
      }
    } catch (fatal) {
      console.info('[MusicExt] 扫描异常：', fatal);
    }

    var cost = ((Date.now() - started) / 1000).toFixed(1);
    scanning = false;
    elScan.disabled = false;
    renderList();

    if (tracks.length > 0) {
      var suffix = (tracks.length >= MAX_TRACKS || dirCount >= MAX_DIRS) ? '（已达上限）' : '';
      setStatus('共 ' + tracks.length + ' 首 · 耗时 ' + cost + 's' + suffix);
      console.info('[MusicExt] 扫描完成：' + tracks.length + ' 首，访问 ' + dirCount +
                   ' 个目录（成功 ' + okDirs + ' / 失败 ' + failDirs + '）');
    } else if (okDirs === 0) {
      setStatus('目录无法访问（' + failDirs + ' 个失败）· ' + cost + 's');
      console.info('[MusicExt] 所有目录都读取失败。');
    } else {
      setStatus('目录可访问，但无音频 · ' + cost + 's');
      console.info('[MusicExt] 读到 ' + okDirs + ' 个目录，但没有音频文件。');
    }
  }

  // ==========================================================================
  // 列表渲染
  // ==========================================================================
  function renderList() {
    var html;
    if (!tracks.length) {
      html = '<option value="">— 尚未扫描 —</option>';
    } else {
      html = '<option value="">— 共 ' + tracks.length + ' 首 —</option>';
      for (var i = 0; i < tracks.length; i++) {
        var t = tracks[i];
        html += '<option value="' + i + '" title="' + escapeHtml(t.url) + '">' +
                  escapeHtml((i + 1) + '. ' + t.label) +
                '</option>';
      }
    }
    elList.innerHTML = html;
    elList.value = (currentIndex >= 0 && currentIndex < tracks.length) ? String(currentIndex) : '';
  }

  // ==========================================================================
  // 随机播放：洗牌袋
  // ==========================================================================

  function refillShuffleBag() {
    shuffleBag = [];
    for (var i = 0; i < tracks.length; i++) shuffleBag.push(i);

    for (var j = shuffleBag.length - 1; j > 0; j--) {
      var k = Math.floor(Math.random() * (j + 1));
      var tmp = shuffleBag[j]; shuffleBag[j] = shuffleBag[k]; shuffleBag[k] = tmp;
    }

    // 避免重洗后立刻又播当前这首
    if (shuffleBag.length > 1 && shuffleBag[shuffleBag.length - 1] === currentIndex) {
      var t = shuffleBag[shuffleBag.length - 1];
      shuffleBag[shuffleBag.length - 1] = shuffleBag[shuffleBag.length - 2];
      shuffleBag[shuffleBag.length - 2] = t;
    }
  }

  function popShuffle() {
    if (!tracks.length) return -1;
    if (shuffleBag.length === 0) refillShuffleBag();
    if (shuffleBag.length === 0) return -1;
    return shuffleBag.pop();
  }

  function toggleShuffle() {
    shuffleOn = !shuffleOn;
    if (elShuffle) {
      elShuffle.className = shuffleOn ? 'mx-btn mx-on' : 'mx-btn';
    }
    shuffleBag = [];

    if (!tracks.length) {
      setStatus(shuffleOn ? '随机：开' : '随机：关');
      return;
    }

    if (shuffleOn) {
      var idx = popShuffle();
      if (idx >= 0) playIndex(idx);
    } else {
      setStatus('随机：关');
    }
  }

  // ==========================================================================
  // 播放控制
  // ==========================================================================
  function stopAudio() {
    try { elAudio.pause(); } catch (e) {}
    elAudio.removeAttribute('src');
  }

  function playIndex(i) {
    if (i < 0 || i >= tracks.length) return;
    currentIndex = i;
    var t = tracks[i];

    elList.value = String(i);
    setStatus((shuffleOn ? '🔀 ' : '') + t.label);

    try {
      elAudio.src = t.url;
      var pr = elAudio.play();
      if (pr && typeof pr.then === 'function') {
        pr.then(null, function (err) {
          console.info('[MusicExt] 播放被拒绝：', err);
          setStatus('播放被拒绝（需点击页面）');
          setToggleIcon(false);
        });
      }
    } catch (e) {
      console.info('[MusicExt] 播放失败：', e);
    }
  }

  function stepTrack(delta) {
    if (!tracks.length) { setStatus('还没有曲目，先点 🔄 扫描'); return; }
    var i;
    if (currentIndex < 0) {
      i = delta > 0 ? 0 : tracks.length - 1;
    } else {
      i = (currentIndex + delta) % tracks.length;
      if (i < 0) i += tracks.length;
    }
    playIndex(i);
  }

  function goNext() {
    if (!tracks.length) { setStatus('还没有曲目，先点 🔄 扫描'); return; }
    if (shuffleOn) {
      var idx = popShuffle();
      if (idx >= 0) playIndex(idx);
    } else {
      stepTrack(1);
    }
  }

  function goPrev() {
    if (!tracks.length) { setStatus('还没有曲目，先点 🔄 扫描'); return; }
    stepTrack(-1);
  }

  function togglePlay() {
    if (!tracks.length) { setStatus('还没有曲目，先点 🔄 扫描'); return; }
    if (elAudio.paused) {
      if (currentIndex < 0 || !elAudio.getAttribute('src')) {
        if (shuffleOn) {
          var idx = popShuffle();
          if (idx >= 0) playIndex(idx);
        } else {
          playIndex(currentIndex < 0 ? 0 : currentIndex);
        }
        return;
      }
      try {
        var pr = elAudio.play();
        if (pr && typeof pr.then === 'function') {
          pr.then(null, function (err) { console.info('[MusicExt] 播放被拒绝：', err); });
        }
      } catch (e) {
        console.info('[MusicExt] 播放失败：', e);
      }
    } else {
      elAudio.pause();
    }
  }

  // ==========================================================================
  // 挂载
  // ==========================================================================
  function injectStyle() {
    if (document.getElementById('mx-style-tag')) return;
    var st = document.createElement('style');
    st.id = 'mx-style-tag';
    st.type = 'text/css';
    st.appendChild(document.createTextNode(CSS));
    var head = document.head || document.getElementsByTagName('head')[0] || document.documentElement;
    head.appendChild(st);
  }

  function mount(slot) {
    injectStyle();
    slot.innerHTML = PANEL_HTML;

    elStatus   = slot.querySelector('.mx-status');
    elPaths    = slot.querySelector('#mx-paths-input');
    elResolved = slot.querySelector('.mx-resolved');
    elScan     = slot.querySelector('#mx-btn-scan');
    elPrev     = slot.querySelector('#mx-btn-prev');
    elToggle   = slot.querySelector('#mx-btn-toggle');
    elNext     = slot.querySelector('#mx-btn-next');
    elShuffle  = slot.querySelector('#mx-btn-shuffle');
    elList     = slot.querySelector('#mx-track-list');
    elAudio    = slot.querySelector('#mx-audio');

    if (!elStatus || !elPaths || !elScan || !elPrev || !elToggle ||
        !elNext || !elShuffle || !elList || !elAudio) {
      console.warn('[MusicExt] 面板元素创建失败');
      return;
    }

    elPaths.value = loadPaths();
    updateResolvedHint();
    elPaths.addEventListener('input', updateResolvedHint);
    elPaths.addEventListener('change', function () { persistPaths(); updateResolvedHint(); });
    elPaths.addEventListener('blur', persistPaths);
    elPaths.addEventListener('keydown', function (ev) {
      if (ev.keyCode === 13) { ev.preventDefault(); elPaths.blur(); doScan(); }
    });

    elScan.addEventListener('click', function () { doScan(); });
    elPrev.addEventListener('click', goPrev);
    elToggle.addEventListener('click', togglePlay);
    elNext.addEventListener('click', goNext);
    elShuffle.addEventListener('click', toggleShuffle);

    elList.addEventListener('change', function () {
      var v = elList.value;
      if (v === '') return;
      var idx = parseInt(v, 10);
      if (!isNaN(idx)) playIndex(idx);
    });

    elAudio.addEventListener('play',    function () { setToggleIcon(true); });
    elAudio.addEventListener('playing', function () { setToggleIcon(true); });
    elAudio.addEventListener('pause',   function () { setToggleIcon(false); });
    elAudio.addEventListener('ended',   function () { goNext(); });
    elAudio.addEventListener('error',   function () {
      if (!elAudio.getAttribute('src')) return;
      console.info('[MusicExt] 音频加载失败：', elAudio.getAttribute('src'));
      setStatus('音频加载失败');
      setToggleIcon(false);
    });

    setToggleIcon(false);
    renderList();
    setStatus(VERSION + ' · 未加载');
    console.info('[MusicExt] ' + VERSION + ' loaded');
  }

  // ==========================================================================
  // 启动
  // ==========================================================================
  function boot() {
    var slot = document.getElementById('ext-music-slot');
    if (!slot) {
      console.warn('[MusicExt] 未找到挂载点 #ext-music-slot');
      return;
    }
    mount(slot);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, false);
  } else {
    boot();
  }
})();