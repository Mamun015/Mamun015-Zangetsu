// MovieNestBD provider for Zangetsu.
//
// MovieNestBD (https://movienestbd.best) is a public movie / web-series /
// anime site with server-rendered pages. Listings are <a.movie-card> cards;
// detail pages carry the title, poster, plot, year and either an episode
// list (series) or media ids (movies). Playback goes through a jiofiles /
// xcloud HLS chain that is resolved per title.
//
// Ported from the MovieNestBD CloudStream extension
// (mamun015/mamun015-cloudstream-bdix, Movienestbd module).
//
// ONE file, loaded once as sourceId `movienestbd`. Every failure degrades
// to an empty list instead of throwing, exactly like the other sources in
// this repo.

var UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';
var BASE = 'https://movienestbd.best';
var LOGO = BASE + '/favicon.png';
var VERSION = '1.0.0';
var SEARCH_TIMEOUT_MS = 7000;
var DETAIL_TIMEOUT_MS = 9000;
var PLAYER_TIMEOUT_MS = 12000;

var MAX_SOURCES = 6;

// ---------- small helpers ----------

function _trim(s) {
  return String(s == null ? '' : s).replace(/^\s+|\s+$/g, '');
}

function _stripTags(s) {
  return String(s == null ? '' : s)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^\s+|\s+$/g, '');
}

function _attr(html, name) {
  var re = new RegExp(name + '\\s*=\\s*"([^"]*)"', 'i');
  var m = re.exec(html);
  return m ? m[1] : null;
}

function _findAll(html, re) {
  var out = [], m;
  re.lastIndex = 0;
  while ((m = re.exec(html))) out.push(m[1]);
  return out;
}

function _unescapeSlashes(s) {
  return String(s).replace(/\\\//g, '/');
}

// Site data escapes slashes, e.g. "https:\/\/player.jiofiles.pics\/abc".
// CloudStream's unescape does exactly this.

// ---------- search ----------

// Each listing card: <a ... class="...movie-card..." ...> ... </a>
var RE_CARD = /<a\b[\s\S]*?\bmovie-card\b[\s\S]*?<\/a>/gi;
var RE_HREF = /href\s*=\s*"([^"]*)"/i;
var RE_H3 = /<h3[^>]*>([\s\S]*?)<\/h3>/i;
var RE_SPAN = /<span[^>]*>([\s\S]*?)<\/span>/gi;
var RE_IMG = /<img[^>]*?(?:src|data-src)\s*=\s*"([^"]*)"/i;
var RE_YEAR = /\b(19|20)\d{2}\b/;
var RE_BADGE_ANIME = /anime/i;
var RE_BADGE_SERIES = /series/i;

function _searchCards(html) {
  var cards = [], m;
  RE_CARD.lastIndex = 0;
  while ((m = RE_CARD.exec(html))) cards.push(m[0]);
  return cards;
}

function _cardItem(card, qKey) {
  var href = _attr(card, 'href');
  if (!href) return null;
  var url = href.startsWith('http', true) ? href : (href.startsWith('/') ? BASE + href : BASE + '/' + href);

  var h3m = RE_H3.exec(card);
  var heading = h3m ? h3m[1] : '';
  var yearText = '';
  var ym = RE_SPAN.exec(heading);
  if (ym) { yearText = ym[1]; RE_SPAN.lastIndex = 0; heading = heading.replace(ym[0], ' '); }
  var title = _stripTags(heading);
  if (!title) {
    var alt = _attr(card, 'alt');
    title = _trim(alt || '');
  }
  if (!title) return null;

  var poster = _attr(card, 'src') || _attr(card, 'data-src') || null;
  if (poster && poster.startsWith('/')) poster = BASE + poster;

  var type = 'movie';
  if (RE_BADGE_ANIME.test(card)) type = 'anime';
  else if (RE_BADGE_SERIES.test(card)) type = 'series';

  var y = null;
  var ym2 = RE_YEAR.exec(yearText);
  if (ym2) y = Number(ym2[0]);

  var item = {
    id: url,
    url: url,
    title: title,
    type: type,
    cover: poster || null,
    description: null,
    sourceId: 'movienestbd',
    year: y
  };
  return item;
}

function search(query, page, opts) {
  var q = _trim(String(query || ''));
  if (!q) return Promise.resolve([]);
  var url = BASE + '/search?q=' + encodeURIComponent(q).replace(/%20/g, '+');
  var timeoutMs = (opts && opts.timeoutMs) || SEARCH_TIMEOUT_MS;

  return fetch(url, { headers: { 'User-Agent': UA }, timeoutMs: timeoutMs })
    .then(function (r) {
      if (!r || !r.ok) return [];
      var html = String(r.body || '');
      var cards = _searchCards(html);
      var out = [];
      for (var i = 0; i < cards.length; i++) {
        var it = _cardItem(cards[i]);
        if (it) out.push(it);
      }
      return out;
    })
    .catch(function () { return []; });
}

// ---------- detail ----------

var RE_MAIN_H1 = /<main[\s\S]*?<h1[^>]*>([\s\S]*?)<\/h1>/i;
var RE_OG_IMAGE = /<meta[^>]*property\s*=\s*"og:image"[^>]*content\s*=\s*"([^"]*)"/i;
var RE_DESC = /<meta[^>]*name\s*=\s*"description"[^>]*content\s*=\s*"([^"]*)"/i;
var RE_YEAR_SPAN = /<span[^>]*class="[^"]*bg-white\/10[^"]*"[^>]*>([\s\S]*?)<\/span>/i;
var RE_SCORE = /#display-rating-score[\s\S]*?([\d.]+)/i;
var RE_GENRE = /<a[^>]*href\s*=\s*"\/[^"]*\/genre\/[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
var RE_LANG = /<a[^>]*href\s*=\s*"\/[^"]*\/language\/[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
var RE_ACTOR = /<a[^>]*href\s*=\s*"\/[^"]*\/actor\/[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;

// Episode block inside the detail page script: rawEpisodes = [ {...}, {...} ];
var RE_EPISODES_BLOCK = /rawEpisodes\s*=\s*\[([\s\S]*?)\];/;
var RE_EPISODE_ENTRY = /\{\s*name\s*:\s*"([^"]*)"\s*,\s*link\s*:\s*"([^"]*)"/g;

// Movie source entries in the detail page script.
var RE_LINK_ENTRY = /\{\s*name\s*:\s*"[^"]*"\s*,\s*link\s*:\s*"([^"]*)"\s*,\s*quality\s*:\s*"([^"]*)"/g;
var RE_EMBED_ID = /(?:embed|player)\.jiofiles\.pics\/([a-zA-Z0-9]{24})/;
var RE_ID24 = /[a-zA-Z0-9]{24}/;

function _mediaIdFromLink(link) {
  if (!link || link.indexOf('/file/', 0) >= 0) return null;
  var m = RE_ID24.exec(link);
  return m ? m[0] : null;
}

function _episodesFromBlock(block, url) {
  var out = [];
  if (!block) return out;
  var season = 1;
  var sm = /-s(\d{1,2})(?:$|\/)/i.exec(url);
  if (sm) season = Number(sm[1]);
  RE_EPISODE_ENTRY.lastIndex = 0;
  var m, n = 0;
  while ((m = RE_EPISODE_ENTRY.exec(block))) {
    var id = _mediaIdFromLink(m[2]);
    if (!id) continue;
    var label = _trim(m[1]);
    var num = /\d+/.exec(label);
    num = num ? Number(num[0]) : ++n;
    out.push({ id: id, url: id, title: label || ('Episode ' + num), number: num, season: season });
  }
  return out;
}

function _movieMediaIds(html) {
  var ids = [], seen = {}, m;
  RE_LINK_ENTRY.lastIndex = 0;
  while ((m = RE_LINK_ENTRY.exec(html))) {
    var id = _mediaIdFromLink(m[1]);
    if (id && !seen[id]) { seen[id] = true; ids.push(id); }
  }
  RE_EMBED_ID.lastIndex = 0;
  while ((m = RE_EMBED_ID.exec(html))) {
    if (!seen[m[1]]) { seen[m[1]] = true; ids.push(m[1]); }
  }
  return ids.slice(0, MAX_SOURCES);
}

function getDetail(id) {
  var url = String(id || '');
  if (!url) return Promise.resolve(null);
  return fetch(url, { headers: { 'User-Agent': UA }, timeoutMs: DETAIL_TIMEOUT_MS })
    .then(function (r) {
      if (!r || !r.ok) return null;
      var html = String(r.body || '');
      var title = '';
      var hm = RE_MAIN_H1.exec(html);
      if (hm) title = _stripTags(hm[1]);
      if (!title) return null;

      var pm = RE_OG_IMAGE.exec(html);
      var poster = pm ? pm[1] : null;
      if (!poster) {
        var wm = /<div[^>]*class="[^"]*w-48[^"]*"[\s\S]*?<img[^>]*src\s*=\s*"([^"]*)"/i.exec(html);
        poster = wm ? wm[1] : null;
      }
      if (poster && poster.startsWith('/')) poster = BASE + poster;

      var plot = null;
      var dm = RE_DESC.exec(html);
      if (dm) plot = _trim(dm[1]);

      var year = null;
      var ym = RE_YEAR_SPAN.exec(html);
      if (ym) { var y2 = RE_YEAR.exec(ym[1]); if (y2) year = Number(y2[0]); }

      var score = null;
      var sc = RE_SCORE.exec(html);
      if (sc) score = Number(sc[1]);

      var genres = _findAll(html, RE_GENRE).map(function (g) { return _trim(g); }).filter(Boolean);
      var langs = _findAll(html, RE_LANG).map(function (g) { return _trim(g); }).filter(Boolean);

      var block = RE_EPISODES_BLOCK.exec(html);
      block = block ? block[1] : null;
      var eps = _episodesFromBlock(block, url);
      var isSeries = eps.length > 0 || /isSeries\s*=\s*true/i.test(html);
      var isAnime = /isAnime\s*=\s*true/i.test(html);

      if (isSeries) {
        if (eps.length === 0) return null;
        return {
          id: url, url: url, title: title, type: isAnime ? 'anime' : 'series',
          cover: poster, plot: plot, year: year, rating: score,
          genres: genres, languages: langs,
          episodes: eps
        };
      }

      var mediaIds = _movieMediaIds(html);
      if (mediaIds.length === 0) return null;
      return {
        id: url, url: url, title: title, type: 'movie',
        cover: poster, plot: plot, year: year, rating: score,
        genres: genres, languages: langs,
        mediaIds: mediaIds
      };
    })
    .catch(function () { return null; });
}

function getEpisodes(url, opts) {
  return getDetail(url).then(function (d) {
    if (!d) return [];
    if (d.episodes) return d.episodes;
    // Movie: a single playable "episode".
    var ids = d.mediaIds || [];
    if (ids.length === 0) return [];
    return ids.map(function (id, i) {
      return { id: id, url: id, title: 'Episode ' + (i + 1), number: i + 1, season: 1 };
    });
  }).catch(function () { return []; });
}

// ---------- playback ----------

// xcloud iframe inside /player/<id>
var RE_IFRAME = /<iframe[^>]*?src\s*=\s*"([^"]+)"/gi;
// Direct stream page (fallback): https://.../stream_<16 hex>
var RE_STREAM_URL = /https?:\/\/[a-zA-Z0-9.-]+\/[a-zA-Z0-9_\/_-]*stream_[0-9a-f]{16}/i;
// Inside the stream / xcloud page:
var RE_HLS_URL = /hlsUrl\s*:\s*"([^"]+)"/i;
var RE_DRIVE_ID = /encodedDriveId\s*:\s*"([^"]+)"/i;
var RE_WORKERS = /workerPools\s*:\s*\[([^\]]*)\]/i;
var RE_WORKER_URL = /https:[^"',\s]+/i;

var JSON_HEADERS = {
  'User-Agent': UA,
  'Accept-Encoding': 'identity',
  'Content-Type': 'application/json'
};

function _absolute(href) {
  if (!href) return null;
  if (href.startsWith('http', true)) return href;
  if (href.startsWith('//')) return 'https:' + href;
  if (href.startsWith('/')) return BASE + href;
  return BASE + '/' + href;
}

function _resolveHls(streamUrl) {
  return fetch(streamUrl, { headers: JSON_HEADERS, timeoutMs: PLAYER_TIMEOUT_MS })
    .then(function (r) {
      if (!r || !r.ok) return null;
      var page = _unescapeSlashes(String(r.body || ''));
      var direct = RE_HLS_URL.exec(page);
      if (direct) return direct[1];
      var drive = RE_DRIVE_ID.exec(page);
      var poolM = RE_WORKERS.exec(page);
      var pool = null;
      if (poolM) {
        var wm = RE_WORKER_URL.exec(poolM[1]);
        if (wm) pool = wm[0];
      }
      if (!drive || !pool) return null;
      var body = JSON.stringify({ driveid: drive[1] });
      return fetch(pool + '/api/encode', {
        method: 'POST',
        headers: JSON_HEADERS,
        body: body,
        timeoutMs: PLAYER_TIMEOUT_MS
      }).then(function (rr) {
        if (!rr || !rr.ok) return null;
        try { var j = JSON.parse(String(rr.body || '')); } catch (e) { return null; }
        if (!j || j.status !== 'success') return null;
        var hls = j.hls || (j.data && j.data.hls) || null;
        return hls || null;
      });
    });
}

function _resolveMediaId(mediaId) {
  if (!mediaId || !RE_ID24.test(mediaId)) return Promise.resolve(null);
  var playerUrl = BASE + '/player/' + mediaId;
  return fetch(playerUrl, { headers: JSON_HEADERS, timeoutMs: PLAYER_TIMEOUT_MS })
    .then(function (r) {
      if (!r || !r.ok) return null;
      var page = String(r.body || '');
      var im = RE_IFRAME.exec(page);
      if (im) {
        var streamUrl = _absolute(im[1]);
        if (streamUrl) return _resolveHls(streamUrl);
      }
      // Fallback: direct embed page.
      return fetch('https://embed.jiofiles.pics/' + mediaId, {
        headers: JSON_HEADERS, timeoutMs: PLAYER_TIMEOUT_MS
      }).then(function (rr) {
        if (!rr || !rr.ok) return null;
        var direct = _unescapeSlashes(String(rr.body || ''));
        var sm = RE_STREAM_URL.exec(direct);
        if (!sm) return null;
        return _resolveHls(sm[0]);
      });
    })
    .catch(function () { return null; });
}

function _source(url, quality, label) {
  return {
    url: url,
    quality: quality || null,
    label: label || null,
    container: 'unknown',
    headers: { 'User-Agent': UA },
    kind: 'raw',
    audioLang: null,
    subtitles: []
  };
}

function getVideoSources(url, fast) {
  var mediaId = String(url || '');
  if (!RE_ID24.test(mediaId)) return Promise.resolve([]);
  return _resolveMediaId(mediaId)
    .then(function (hls) {
      if (!hls) return [];
      var out = [];
      var q = null;
      var m = /(\d{3,4})p/i.exec(hls);
      if (m) q = m[1] + 'p';
      out.push(_source(hls, q, q || 'HLS'));
      return out;
    })
    .catch(function () { return []; });
}

// ---------- manifest ----------

function getInfo() {
  return {
    name: 'MovieNestBD',
    lang: 'en',
    baseUrl: BASE,
    logo: LOGO,
    type: 'movie',
    version: VERSION
  };
}

// Home rows: optional. Kept empty so the app falls back to search; the
// site's own category pages are reachable through search anyway.
function getHome(opts) {
  return Promise.resolve([]);
}
