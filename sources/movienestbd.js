// MovieNestBD provider for Zangetsu.
//
// MovieNestBD (https://movienestbd.best) is a public movie / web-series /
// anime site with server-rendered pages. Listings are <a class="movie-card">
// cards; a detail page carries the title, poster, plot, year and either an
// episode list (series) or a quality list (movie). Playback resolves a media
// id through /player/<id> to an xcloud HLS stream.
//
// Ported from the MovieNestBD CloudStream extension
// (mamun015/mamun015-cloudstream-bdix, Movienestbd module).
//
// ONE file, loaded once as sourceId `movienestbd`. Every failure degrades
// to an empty list instead of throwing, exactly like the other sources here.

var UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';
var BASE = 'https://movienestbd.best';
var SITE = 'movienestbd';

var VERSION = '1.0.1';
var LIST_TIMEOUT_MS = 12000;
var DETAIL_TIMEOUT_MS = 12000;
var PLAYER_TIMEOUT_MS = 15000;

var MAX_QUALITIES = 4;

// ---------- small helpers ----------

function _trim(s) {
  return String(s == null ? '' : s).replace(/^\s+|\s+$/g, '');
}

function _stripTags(s) {
  return String(s == null ? '' : s)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^\s+|\s+$/g, '');
}

function _attr(tag, name) {
  var re = new RegExp(name + '\\s*=\\s*"([^"]*)"', 'i');
  var m = re.exec(String(tag));
  return m ? m[1] : null;
}

function _unescapeSlashes(s) {
  return String(s).replace(/\\\//g, '/');
}

// Site links escape slashes as "\/file\/...".
function _absolute(href) {
  var h = _trim(_unescapeSlashes(href || ''));
  if (!h) return null;
  if (h.indexOf('http') === 0) return h;
  if (h.indexOf('//') === 0) return 'https:' + h;
  if (h.charAt(0) === '/') return BASE + h;
  return BASE + '/' + h;
}

// base64url -> text. atob is not guaranteed inside the QuickJS sandbox, so the
// decoder is written out by hand.
var B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function _b64decode(s) {
  var str = String(s).replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
  var out = '', i, c1, c2, c3, c4;
  for (i = 0; i < str.length; i += 4) {
    c1 = B64_CHARS.indexOf(str.charAt(i));
    c2 = B64_CHARS.indexOf(str.charAt(i + 1));
    if (c1 < 0 || c2 < 0) break;
    out += String.fromCharCode((c1 << 2) | (c2 >> 4));
    c3 = B64_CHARS.indexOf(str.charAt(i + 2));
    if (c3 < 0) break;
    out += String.fromCharCode(((c2 & 15) << 4) | (c3 >> 2));
    c4 = B64_CHARS.indexOf(str.charAt(i + 3));
    if (c4 < 0) break;
    out += String.fromCharCode(((c3 & 3) << 6) | c4);
  }
  return out;
}

// A media id is 24 alphanumeric characters. The site hands out three shapes:
//   /file/<base64url>   -> decodes to id|slug|ts|sig
//   https://embed.jiofiles.pics/<id>
//   <id>
var RE_FILE_TOKEN = /\/file\/([A-Za-z0-9_-]+)/;

function _mediaId(link) {
  var s = _trim(_unescapeSlashes(link || ''));
  if (!s) return null;
  var fm = RE_FILE_TOKEN.exec(s);
  if (fm) {
    var decoded = _b64decode(fm[1]);
    var first = decoded.split('|')[0];
    if (/^[a-zA-Z0-9]{24}$/.test(first)) return first;
    var dm = /[a-zA-Z0-9]{24}/.exec(decoded);
    return dm ? dm[0] : null;
  }
  var m = /(?:embed|player)\.jiofiles\.[a-z]+\/([a-zA-Z0-9]{24})/i.exec(s);
  if (m) return m[1];
  var any = /[a-zA-Z0-9]{24}/.exec(s);
  return any ? any[0] : null;
}

// ---------- listing cards ----------

// Only real card anchors: an <a> whose own class list contains movie-card.
// Parsing CSS (".movie-card {") or a nav <a> was what broke search before.
var RE_CARD_OPEN = /<a\b[^>]*class="[^"]*\bmovie-card\b[^"]*"[^>]*>/gi;
var RE_IMG_SRC = /<img[^>]*\bsrc\s*=\s*"([^"]+)"/i;
var RE_H3 = /<h3[^>]*>([\s\S]*?)<\/h3>/i;
var RE_TYPE_BADGE = /<div[^>]*class="[^"]*bottom-1\.5 right-1\.5[^"]*"[^>]*>([\s\S]*?)<\/div>/i;
var RE_TRAILING_YEAR = /\((\d{4})\)\s*$/;
var RE_24_HEX = /[a-f0-9]{24}/i;

function _cards(html) {
  var out = [], m, start, end;
  RE_CARD_OPEN.lastIndex = 0;
  while ((m = RE_CARD_OPEN.exec(html))) {
    start = RE_CARD_OPEN.lastIndex;
    end = html.indexOf('</a>', start);
    if (end < 0) break;
    out.push({ open: m[0], body: html.slice(start, end) });
    RE_CARD_OPEN.lastIndex = end + 4;
  }
  return out;
}

function _cardItem(card, forceType) {
  var url = _absolute(_attr(card.open, 'href'));
  if (!url) return null;

  var h3 = RE_H3.exec(card.body);
  var title = h3 ? _stripTags(h3[1]) : '';
  var year = null;
  var ym = RE_TRAILING_YEAR.exec(title);
  if (ym) {
    year = ym[1];
    title = _trim(title.replace(/\(\d{4}\)\s*$/, ''));
  }
  if (!title) title = _trim(_attr(card.body, 'alt') || '');
  if (!title) return null;

  var poster = null;
  var im = RE_IMG_SRC.exec(card.body);
  if (im && im[1].indexOf('data:') !== 0) poster = _absolute(im[1]);

  var type = forceType || 'movie';
  if (!forceType) {
    var badge = RE_TYPE_BADGE.exec(card.body);
    var label = badge ? _stripTags(badge[1]).toUpperCase() : '';
    if (label.indexOf('ANIME') >= 0) type = 'anime';
  }

  return {
    id: url,
    url: url,
    title: title,
    type: type,
    sourceId: SITE,
    cover: poster,
    description: null,
    year: year
  };
}

function _parseCards(html, forceType) {
  var cards = _cards(html), out = [], item;
  for (var i = 0; i < cards.length; i++) {
    item = _cardItem(cards[i], forceType);
    if (item) out.push(item);
  }
  return out;
}

// ---------- search ----------

function search(query, page, opts) {
  var q = _trim(String(query || ''));
  if (!q) return Promise.resolve([]);
  var url = BASE + '/search?q=' + encodeURIComponent(q).replace(/%20/g, '+');
  if (page && Number(page) > 1) url += '&page=' + Number(page);
  var timeoutMs = (opts && opts.timeoutMs) || LIST_TIMEOUT_MS;

  return fetch(url, { headers: { 'User-Agent': UA }, timeoutMs: timeoutMs })
    .then(function (r) {
      if (!r || !r.ok) return [];
      return _parseCards(String(r.body || ''));
    })
    .catch(function () { return []; });
}

// ---------- detail ----------

var RE_H1 = /<h1[^>]*>([\s\S]*?)<\/h1>/i;
var RE_OG_IMAGE = /<meta[^>]*property\s*=\s*"og:image"[^>]*content\s*=\s*"([^"]*)"/i;
var RE_DESCRIPTION = /<meta[^>]*name\s*=\s*"description"[^>]*content\s*=\s*"([^"]*)"/i;
var RE_YEAR_SPAN = /<span[^>]*class="[^"]*bg-white\/10[^"]*"[^>]*>\s*(\d{4})\s*<\/span>/i;
var RE_SCORE_SPAN = /id="display-rating-score"[^>]*>\s*([\d.]+)/i;
var RE_IS_SERIES = /const\s+isSeries\s*=\s*(true|false)/i;
var RE_IS_ANIME = /const\s+isAnime\s*=\s*(true|false)/i;

// rawEpisodes = [ { name: "E1", link: "https:\/\/embed.jiofiles.pics\/<id>", size: "..." } ]
var RE_EPISODES_BLOCK = /rawEpisodes\s*=\s*\[([\s\S]*?)\];/;
var RE_EPISODE_ENTRY = /\{\s*name\s*:\s*"([^"]*)"\s*,\s*link\s*:\s*"([^"]*)"/g;

// rawLinks = [ { name: "E1" | "", link: "\/file\/<token>", quality: "1080P", ... } ]
var RE_LINKS_BLOCK = /rawLinks\s*=\s*\[([\s\S]*?)\];/;
var RE_LINK_ENTRY = /\{\s*name\s*:\s*"([^"]*)"\s*,\s*link\s*:\s*"([^"]*)"\s*,\s*quality\s*:\s*"([^"]*)"/g;

function _qualityRank(q) {
  var m = /(\d{3,4})/.exec(String(q || ''));
  if (m) return Number(m[1]);
  if (/4k|uhd/i.test(q)) return 2160;
  return 0;
}

function _seasonOf(pageUrl) {
  var m = /-s(\d{1,2})$/i.exec(String(pageUrl || ''));
  return m ? Number(m[1]) : 1;
}

function _episodesFromRaw(block, season) {
  var out = [], m, n = 0, label, id, num;
  if (!block) return out;
  RE_EPISODE_ENTRY.lastIndex = 0;
  while ((m = RE_EPISODE_ENTRY.exec(block))) {
    id = _mediaId(m[2]);
    if (!id) continue;
    label = _trim(m[1]);
    num = /(\d+)/.exec(label);
    n += 1;
    out.push({
      id: id,
      url: id,
      title: label || ('Episode ' + n),
      number: num ? Number(num[1]) : n,
      season: season || 1
    });
  }
  return out;
}

function _linksFromRaw(block) {
  var out = [], m, id;
  if (!block) return out;
  RE_LINK_ENTRY.lastIndex = 0;
  while ((m = RE_LINK_ENTRY.exec(block))) {
    id = _mediaId(m[2]);
    if (!id) continue;
    out.push({ name: _trim(m[1]), id: id, quality: _trim(m[3]) });
  }
  return out;
}

// A movie has one entry in the player, so all its quality links are folded into
// that one episode id: "<id>#<quality>,<id>#<quality>". getVideoSources splits
// it back apart and returns one VideoSource per quality.
function _movieEpisode(links) {
  var seen = {}, parts = [], qualities = [], i, l, key;
  for (i = 0; i < links.length; i++) {
    l = links[i];
    key = l.id + '#' + l.quality;
    if (seen[key]) continue;
    seen[key] = true;
    parts.push(key);
    if (l.quality) qualities.push(l.quality);
  }
  if (!parts.length) return null;
  return {
    id: parts.join(','),
    url: parts.join(','),
    title: qualities.length ? 'Movie \u00b7 ' + qualities.join(' / ') : 'Movie',
    number: 1
  };
}

function getDetail(url) {
  var pageUrl = _absolute(url);
  if (!pageUrl) return Promise.resolve(null);

  return fetch(pageUrl, { headers: { 'User-Agent': UA }, timeoutMs: DETAIL_TIMEOUT_MS })
    .then(function (r) {
      if (!r || !r.ok) return null;
      var html = String(r.body || '');

      var title = '';
      var hm = RE_H1.exec(html);
      if (hm) title = _stripTags(hm[1]);
      if (!title) return null;

      var poster = null;
      var pm = RE_OG_IMAGE.exec(html);
      if (pm) poster = _absolute(pm[1]);

      var plot = null;
      var dm = RE_DESCRIPTION.exec(html);
      if (dm) plot = _trim(dm[1]);

      var year = null;
      var ym = RE_YEAR_SPAN.exec(html);
      if (ym) year = ym[1];

      var score = null;
      var sm = RE_SCORE_SPAN.exec(html);
      if (sm) {
        var num = parseFloat(sm[1]);
        if (!isNaN(num)) score = Math.round(num * 10);
      }

      var seriesFlag = RE_IS_SERIES.exec(html);
      var isSeries = seriesFlag ? seriesFlag[1].toLowerCase() === 'true' : false;
      var animeFlag = RE_IS_ANIME.exec(html);
      var isAnime = animeFlag ? animeFlag[1].toLowerCase() === 'true' : false;

      var epBlock = RE_EPISODES_BLOCK.exec(html);
      var linkBlock = RE_LINKS_BLOCK.exec(html);

      var episodes = [];
      if (isSeries) {
        var season = _seasonOf(pageUrl);
        episodes = _episodesFromRaw(epBlock ? epBlock[1] : null, season);
        if (!episodes.length) {
          // Some series only list their episodes as file links.
          var all = _linksFromRaw(linkBlock ? linkBlock[1] : null);
          var used = {};
          for (var e = 0; e < all.length; e++) {
            if (!all[e].name || /^zip$/i.test(all[e].name)) continue;
            if (used[all[e].id]) continue;
            used[all[e].id] = true;
            episodes.push({
              id: all[e].id,
              url: all[e].id,
              title: all[e].name,
              number: episodes.length + 1,
              season: season
            });
          }
        }
        if (!episodes.length) return null;
      } else {
        var links = _linksFromRaw(linkBlock ? linkBlock[1] : null);
        links.sort(function (a, b) { return _qualityRank(b.quality) - _qualityRank(a.quality); });
        if (links.length > MAX_QUALITIES) links = links.slice(0, MAX_QUALITIES);
        var movie = _movieEpisode(links);
        if (!movie) return null;
        episodes = [movie];
      }

      return {
        id: pageUrl,
        url: pageUrl,
        title: title,
        type: isAnime ? 'anime' : 'movie',
        sourceId: SITE,
        cover: poster,
        description: plot,
        year: year,
        score: score,
        status: 'unknown',
        genres: [],
        studios: [],
        cast: [],
        episodes: episodes
      };
    })
    .catch(function () { return null; });
}

function getEpisodes(url, opts) {
  return getDetail(url).then(function (d) {
    return d && d.episodes ? d.episodes : [];
  }).catch(function () { return []; });
}

// ---------- playback ----------

var RE_IFRAME = /<iframe[^>]*\bsrc\s*=\s*"([^"]+)"/i;
var RE_HLS_URL = /hlsUrl\s*:\s*"([^"]+)"/;
var RE_PHOTOS_HLS = /photosHlsUrl\s*:\s*"([^"]+)"/;
var RE_DRIVE_ID = /encodedDriveId\s*:\s*"([^"]+)"/;
var RE_WORKER_POOLS = /workerPools\s*:\s*\[([^\]]*)\]/;
var RE_WORKER_URL = /https?:\/\/[^"',\s\\]+/;
var RE_STREAM_URL = /https?:\/\/[a-zA-Z0-9.-]+\/[^\s"'<>]*stream_[0-9a-f]+/;

var PLAY_HEADERS = { 'User-Agent': UA };
var API_HEADERS = {
  'User-Agent': UA,
  'Accept': 'application/json, text/plain, */*',
  'Content-Type': 'application/json',
  'Accept-Encoding': 'identity'
};

function _postEncode(worker, driveId) {
  return fetch(worker + '/api/encode', {
    method: 'POST',
    headers: API_HEADERS,
    body: JSON.stringify({ driveid: driveId }),
    timeoutMs: PLAYER_TIMEOUT_MS
  }).then(function (r) {
    if (!r || !r.ok) return null;
    var j = null;
    try { j = JSON.parse(String(r.body || '')); } catch (e) { return null; }
    if (!j) return null;
    if (j.hls) return j.hls;
    if (j.url) return j.url;
    if (j.data && j.data.hls) return j.data.hls;
    if (j.data && j.data.url) return j.data.url;
    return null;
  }).catch(function () { return null; });
}

function _hlsFromPage(page) {
  var html = _unescapeSlashes(String(page || ''));
  var direct = RE_HLS_URL.exec(html);
  if (direct) return Promise.resolve(direct[1]);
  var photos = RE_PHOTOS_HLS.exec(html);
  if (photos) return Promise.resolve(photos[1]);

  var drive = RE_DRIVE_ID.exec(html);
  var pools = RE_WORKER_POOLS.exec(html);
  if (!drive || !pools) return Promise.resolve(null);

  var workers = [], m, re = /"(https?:[^"]+)"/g;
  re.lastIndex = 0;
  while ((m = re.exec(pools[1]))) workers.push(_unescapeSlashes(m[1]));
  if (!workers.length) {
    var wm = RE_WORKER_URL.exec(_unescapeSlashes(pools[1]));
    if (wm) workers.push(wm[0]);
  }
  if (!workers.length) return Promise.resolve(null);

  // The site itself races the first three workers and takes the first answer.
  var racing = workers.slice(0, 3).map(function (w) {
    return _postEncode(w.replace(/\/+$/, ''), drive[1]);
  });
  return Promise.all(racing).then(function (list) {
    for (var i = 0; i < list.length; i++) if (list[i]) return list[i];
    return null;
  }).catch(function () { return null; });
}

function _streamPage(streamUrl) {
  return fetch(streamUrl, { headers: PLAY_HEADERS, timeoutMs: PLAYER_TIMEOUT_MS })
    .then(function (r) {
      if (!r || !r.ok) return null;
      return _hlsFromPage(r.body);
    });
}

function _resolveMediaId(mediaId) {
  if (!mediaId || !/^[a-zA-Z0-9]{24}$/.test(mediaId)) return Promise.resolve(null);
  var playerUrl = BASE + '/player/' + mediaId;
  return fetch(playerUrl, { headers: PLAY_HEADERS, timeoutMs: PLAYER_TIMEOUT_MS })
    .then(function (r) {
      if (r && r.ok) {
        var im = RE_IFRAME.exec(String(r.body || ''));
        if (im) {
          var streamUrl = _absolute(im[1]);
          if (streamUrl) {
            return _streamPage(streamUrl).then(function (hls) {
              if (hls) return hls;
              return _embedFallback(mediaId);
            });
          }
        }
      }
      return _embedFallback(mediaId);
    })
    .catch(function () { return null; });
}

function _embedFallback(mediaId) {
  return fetch('https://embed.jiofiles.pics/' + mediaId, {
    headers: PLAY_HEADERS, timeoutMs: PLAYER_TIMEOUT_MS
  }).then(function (r) {
    if (!r || !r.ok) return null;
    var page = _unescapeSlashes(String(r.body || ''));
    var sm = RE_STREAM_URL.exec(page);
    var streamUrl = sm ? sm[0] : ('https://embed.jiofiles.pics/' + mediaId);
    return _streamPage(streamUrl);
  }).catch(function () { return null; });
}

function _source(url, quality, label) {
  var isM3u8 = /\.m3u8(\?|$)/i.test(url);
  return {
    url: url,
    quality: quality || null,
    label: label || quality || 'HLS',
    container: isM3u8 ? 'hls' : 'unknown',
    headers: PLAY_HEADERS,
    kind: 'raw',
    audioLang: null,
    subtitles: []
  };
}

function getVideoSources(url, fast) {
  var raw = _trim(String(url || ''));
  if (!raw) return Promise.resolve([]);

  var entries = raw.split(',');
  var tasks = entries.map(function (entry) {
    var bits = entry.split('#');
    var mediaId = _trim(bits[0]);
    var quality = _trim(bits[1] || '');
    if (!/^[a-zA-Z0-9]{24}$/.test(mediaId)) return Promise.resolve(null);
    return _resolveMediaId(mediaId).then(function (hls) {
      if (!hls) return null;
      var label = quality ? quality + ' \u00b7 HLS' : 'HLS';
      return _source(hls, quality || null, label);
    });
  });

  return Promise.all(tasks).then(function (list) {
    var out = [], seen = {};
    for (var i = 0; i < list.length; i++) {
      if (!list[i] || seen[list[i].url]) continue;
      seen[list[i].url] = true;
      out.push(list[i]);
    }
    return out;
  }).catch(function () { return []; });
}

// ---------- manifest ----------

function getInfo() {
  return {
    name: 'MovieNestBD',
    lang: 'en',
    baseUrl: BASE,
    logo: BASE + '/favicon.png',
    type: 'movie',
    version: VERSION
  };
}

// Home rows come straight from the site's own listing pages.
function getHome(opts) {
  var page = Number((opts && opts.page) || 1);
  var qs = page > 1 ? ('?page=' + page) : '';
  var rowDefs = [
    ['Latest', '/', null],
    ['Movies', '/movies', null],
    ['Series', '/series', null],
    ['Anime', '/anime', 'anime'],
    ['Korean', '/category/korean', null]
  ];

  var tasks = rowDefs.map(function (row) {
    return fetch(BASE + row[1] + qs, {
      headers: { 'User-Agent': UA },
      timeoutMs: LIST_TIMEOUT_MS
    }).then(function (r) {
      if (!r || !r.ok) return [];
      return _parseCards(String(r.body || ''), row[2]);
    }).catch(function () { return []; });
  });

  return Promise.all(tasks).then(function (lists) {
    var out = [];
    for (var i = 0; i < rowDefs.length; i++) {
      if (lists[i] && lists[i].length) {
        out.push({ title: rowDefs[i][0], items: lists[i] });
      }
    }
    return out;
  }).catch(function () { return []; });
}
