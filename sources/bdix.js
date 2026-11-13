// Circle FTP, Dflix and ICC Ftp providers for Zangetsu.
//
// Three more BDIX media servers, reached through their own HTTP APIs or
// directory pages instead of h5ai:
//   circleftp    http://new.circleftp.net  (JSON API on :5000)
//   dflix_movies https://movies.discoveryftp.net/m  (HTML, movies)
//   dflix_series https://movies.discoveryftp.net/s  (HTML, series)
//   iccftp       http://10.16.100.244/     (PHP, search + player pages)
//
// ONE file, loaded once per sourceId. The sourceId decides which site (and,
// for Dflix, which half of the site) this source exposes.
//
// These servers are only reachable from a BDIX-connected line. Every failure
// degrades to an empty list instead of an exception, exactly like
// sources/dhakaflix.js: an exception is what the app reports to the viewer as
// "did not match this title".

var UA = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

var SOURCE_ID = (typeof __SOURCE_ID !== 'undefined' && __SOURCE_ID) ? String(__SOURCE_ID) : 'circleftp';

var LOGO = 'https://raw.githubusercontent.com/Mamun015/Mamun015-Zangetsu/main/logo.png';
var VIDEO_EXT = /\.(mkv|mp4|m4v|avi|webm|mov|ts|m2ts|flv|wmv)$/i;
var VERSION = '1.7.0';

// Time budgets, in milliseconds. Auto Resolve gives the whole match ->
// episodes -> sources chain a few seconds, and the app's setTimeout is not
// dependable inside a provider call, so every request carries its own cap.
var SEARCH_TIMEOUT_MS = 3000;
var PAGE_TIMEOUT_MS = 4000;

var SITES = {
  circleftp:    { name: '(BDIX) Circle FTP',    lang: 'bn', base: 'http://new.circleftp.net' },
  dflix_movies: { name: '(BDIX) Dflix Movies',  lang: 'bn', base: 'https://movies.discoveryftp.net' },
  dflix_series: { name: '(BDIX) Dflix Series',  lang: 'bn', base: 'https://movies.discoveryftp.net' },
  iccftp:       { name: '(BDIX) ICC Ftp',       lang: 'bn', base: 'http://10.16.100.244/' }
};

var SITE = SITES[SOURCE_ID] || SITES.circleftp;
var KIND = SOURCE_ID.indexOf('series') >= 0 ? 'series' : 'movies';

// --- Naming -----------------------------------------------------------------
// Copied verbatim from sources/dhakaflix.js so every source in this repo strips
// release decorations the same way. The app compares the WHOLE title, so a
// leftover "(TV Series 2008–2013)" or "[Dual Audio]" would make a hit fail.
var RE_TAG = /(?:^|[\s._\-\[\(])(?:2160p|1080p|1080i|720p|576p|540p|480p|360p|4k|uhd|x264|x265|h264|h265|hevc|avc|xvid|divx|aac|ac3|eac3|dts|ddp|bluray|blu-ray|bdrip|brrip|webrip|web-dl|webdl|hdrip|dvdrip|dvdscr|hdtv|pdtv|amzn|nf|hmax|dsnp|atvp|zs|esub|esubs|msub|msubs|multi|proper|repack|remux|extended|unrated|10bit|8bit|5[._]1|2[._]0|7[._]1|hindi|english|dubbed)(?=$|[\s._\-\]\)])/gi;

function _trim(s) { return String(s == null ? '' : s).replace(/^\s+|\s+$/g, ''); }

function _safeDecode(s) {
  try { return decodeURIComponent(String(s)); } catch (e) { return String(s); }
}

function _stripTags(s) { return _safeDecode(String(s).replace(/<[^>]*>/g, '')); }

function _regexEscape(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function _segName(path) {
  var p = String(path || '').replace(/\/+$/, '');
  var i = p.lastIndexOf('/');
  return _safeDecode(i >= 0 ? p.slice(i + 1) : p).replace(/\+/g, ' ');
}

function _cleanName(s) {
  var n = _segName(String(s || ''));
  n = _stripTags(n);
  n = n.replace(/\.(mkv|mp4|m4v|avi|webm|mov|ts|m2ts|flv|wmv)$/i, '');
  if (n.indexOf(' ') < 0 && (n.match(/\./g) || []).length >= 3) n = n.replace(/\./g, ' ');
  n = n.replace(/_/g, ' ');
  return _trim(n.replace(/\s+/g, ' '));
}

function _pretty(name) {
  var n = _cleanName(name);
  n = n.replace(/\[[^\]]*\]/g, ' ');
  n = n.replace(/\(\s*(?:dual|multi)\s*audio\s*\)/gi, ' ');
  for (var i = 0; i < 3; i++) n = n.replace(RE_TAG, ' ');
  n = n.replace(/\([^)]*\)/g, ' ');
  n = n.replace(/\s(?:AMZN|NF|HMAX|HBO|PRIME|DISNEY|APPLE|SONY|PARAMOUNT|PEACOCK)(?=\s*[\[(]|$)/gi, ' ');
  n = n.replace(/\s*[-_.]+\s*$/g, ' ').replace(/^[\s\-_.]+/, '');
  n = n.replace(/\s*[-\u2013]\s*[A-Za-z0-9]{2,12}$/, '');
  n = n.replace(/\s{2,}/g, ' ');
  return _trim(n);
}

function _epTitle(name) {
  var m = String(name).match(/[Ss](\d{1,2})[\s._-]?[Ee][Pp]?(\d{1,3})/);
  var p = _pretty(name);
  if (!m) return p;
  var s = m[1].length < 2 ? '0' + m[1] : m[1];
  var e = m[2].length < 2 ? '0' + m[2] : m[2];
  var rest = p.replace(new RegExp('[Ss]' + m[1] + '[\\s._-]?[Ee][Pp]?' + m[2], 'i'), ' ');
  rest = rest.replace(/^[\s\u00b7.\-]+|[\s\u00b7.\-]+$/g, '');
  return rest ? 'S' + s + 'E' + e + ' \u00b7 ' + rest : 'S' + s + 'E' + e;
}

function _normTitle(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9\u0980-\u09ff]+/g, ' ').trim();
}

var STOPWORDS = { the: 1, and: 1, of: 1, a: 1, an: 1, to: 1, in: 1, is: 1, it: 1, for: 1, on: 1, at: 1, be: 1, no: 1, vs: 1 };

function _queryWords(q) {
  return String(q).split(/[^A-Za-z0-9\u0980-\u09FF]+/).filter(function (w) {
    return w.length >= 3 && !STOPWORDS[w.toLowerCase()];
  });
}

// The app's own title key: lowercase, "&" spelled out, everything that is not
// a letter or a digit dropped.
function _matchKey(s) {
  return String(s || '').toLowerCase()
    .replace(/[&\uFF06\uFE60]/g, 'and')
    .replace(/[^a-z0-9\u0980-\u09ff]+/g, '');
}

// Words that may sit around a title without changing which work it is: a
// season pack on ICC is filed as "Suits Season 02 (2012) Completed", and the
// catalogue title is "Suits".
var DECOR_WORDS = {
  season: 1, seasons: 1, episode: 1, episodes: 1, complete: 1, completed: 1,
  part: 1, parts: 1, series: 1, serial: 1, tv: 1, show: 1, volume: 1, vol: 1,
  special: 1, ova: 1, movie: 1, film: 1, collection: 1, cut: 1, version: 1,
  edition: 1, remastered: 1, extended: 1, unrated: 1, full: 1, hd: 1,
  imax: 1, dolby: 1, atmos: 1, hdr: 1, sdr: 1, uhd: 1, bdrip: 1, brrip: 1,
  dual: 1, multi: 1, audio: 1, hindi: 1, english: 1, dubbed: 1,
  web: 1, dl: 1, bluray: 1, webrip: 1, hdtv: 1, hdrip: 1, dvdrip: 1
};

// True when the result's name IS the asked title once release and packaging
// decorations are gone. Deliberately strict: a search for "Hope" also returns
// "Hope Lost (2015)", and labelling that with "Hope" would play the wrong film.
// A prefix is not enough, so "Demon Slayer-Kimetsu no Yaiba" only matches when
// the catalogue asks for the full name.
function _sameShow(name, qKey) {
  var words = _pretty(name).split(/[^A-Za-z0-9\u0980-\u09FF]+/).filter(Boolean);
  var keep = [];
  for (var i = 0; i < words.length; i++) {
    var w = words[i].toLowerCase();
    // Pure numbers are packaging too: "Season 01", "(2012)", "2".
    if (/^\d+$/.test(w)) continue;
    if (!DECOR_WORDS[w]) keep.push(words[i]);
  }
  var key = _matchKey(keep.join(' '));
  return !!key && !!qKey && key === qKey;
}

function _titleScore(title, queryWords, queryNorm, queryKey) {
  var low = String(title).toLowerCase();
  var key = _matchKey(title);
  var score = 0;
  for (var i = 0; i < queryWords.length; i++) {
    if (low.indexOf(queryWords[i]) >= 0) score += 10;
  }
  if (queryWords.length && low.indexOf(queryWords[0]) === 0) score += 6;
  if (queryNorm && low.indexOf(queryNorm) >= 0) score += 20;
  if (queryKey) {
    if (key === queryKey) score += 100;
    else if (key.indexOf(queryKey) === 0) score += 60;
    else if (queryKey.indexOf(key) === 0) score += 30;
  }
  return score;
}

function _extraWords(title, queryWords) {
  var words = _queryWords(title).map(function (w) { return w.toLowerCase(); });
  var extra = 0;
  for (var i = 0; i < words.length; i++) {
    if (queryWords.indexOf(words[i]) < 0) extra++;
  }
  return extra;
}

function _mapLimit(list, limit, fn) {
  var i = 0, out = [];
  function worker() {
    if (i >= list.length) return Promise.resolve();
    var idx = i++;
    return Promise.resolve().then(function () { return fn(list[idx]); })
      .then(function (v) { out[idx] = v; return worker(); })
      .catch(function () { out[idx] = null; return worker(); });
  }
  var workers = [];
  for (var w = 0; w < limit && w < list.length; w++) workers.push(worker());
  return Promise.all(workers).then(function () { return out; });
}

// --- Requests ---------------------------------------------------------------
// Every request carries its own timeout; nothing waits on the app's timer.

function _fetchText(url, timeoutMs, referer) {
  var headers = { 'User-Agent': UA, 'Accept': 'text/html,application/json,*/*' };
  if (referer) headers['Referer'] = referer;
  return fetch(url, { method: 'GET', headers: headers, timeoutMs: timeoutMs || PAGE_TIMEOUT_MS })
    .then(function (r) {
      if (!r || !r.ok) throw new Error('HTTP ' + (r ? r.status : '?'));
      return r.body;
    });
}

function _json(url, timeoutMs, referer) {
  return _fetchText(url, timeoutMs, referer).then(function (t) {
    try { return JSON.parse(t); } catch (e) { throw new Error('bad JSON'); }
  });
}

function _form(url, body, timeoutMs, referer) {
  return fetch(url, {
    method: 'POST',
    headers: {
      'User-Agent': UA,
      'Accept': 'application/json,text/html,*/*',
      'Content-Type': 'application/x-www-form-urlencoded',
      'Referer': referer || url
    },
    body: body,
    timeoutMs: timeoutMs || PAGE_TIMEOUT_MS
  }).then(function (r) {
    if (!r || !r.ok) throw new Error('HTTP ' + (r ? r.status : '?'));
    return r.body;
  });
}

// A detail page or search result is asked for again a moment later (search ->
// detail -> episodes). Serving the second answer from here keeps the chain
// inside Auto Resolve's budget.
var _pageCache = {};
var PAGE_TTL_MS = 60000;

function _page(url, referer) {
  var key = String(url);
  var hit = _pageCache[key];
  if (hit && (Date.now() - hit.at) < PAGE_TTL_MS) return Promise.resolve(hit.text);
  return _fetchText(key, PAGE_TIMEOUT_MS, referer).then(function (t) {
    _pageCache[key] = { at: Date.now(), text: t };
    return t;
  }).catch(function () { return ''; });
}

// --- Results ----------------------------------------------------------------

function _quality(name) {
  var m = String(name || '').match(/\b(2160p|1440p|1080p|720p|576p|540p|480p|360p|4k|8k)\b/i);
  return m ? m[1] : null;
}

// 4K and 2160p files are dropped: most phones cannot decode them, and a 4K
// pick above a working 1080p one is how "plays but stutters" happens.

function _mediaUrl(u) {
  var s = String(u || '');
  if (!s) return s;
  // Spaces break fetch/players; discoveryftp URLs arrive with literal spaces.
  s = s.replace(/ /g, '%20');
  return s;
}

function _source(url) {
  var raw = _mediaUrl(url);
  var name = _segName(raw.split('?')[0]);
  var q = _quality(name);
  if (/2160p|4k|8k/i.test(q || '')) q = null;
  return {
    url: raw,
    quality: q,
    label: null,
    container: /\.(mkv|mp4|m4v|mov|webm)$/i.test(name) ? String(name.split('.').pop()).toLowerCase() : 'unknown',
    headers: null,
    kind: 'raw',
    audioLang: null,
    subtitles: []
  };
}

function _result(name, url, cover, desc, q, qWords, qKey) {
  var item = {
    id: url,
    title: _pretty(name),
    url: url,
    type: 'movie',
    sourceId: SOURCE_ID,
    cover: cover || null,
    description: desc || null
  };
  if (q && _sameShow(name, qKey)) item.englishTitle = q;
  return item;
}

function _sortResults(list, qWords, qNorm, qKey) {
  list.sort(function (a, b) {
    var as = _titleScore(a.title, qWords, qNorm, qKey);
    var bs = _titleScore(b.title, qWords, qNorm, qKey);
    if (as !== bs) return bs - as;
    var ax = _extraWords(a.title, qWords), bx = _extraWords(b.title, qWords);
    if (ax !== bx) return ax - bx;
    return a.title < b.title ? -1 : a.title > b.title ? 1 : 0;
  });
  var out = [], seen = {};
  for (var i = 0; i < list.length; i++) {
    var key = String(list[i].url).replace(/\/+$/, '');
    if (seen[key]) continue;
    seen[key] = 1;
    out.push(list[i]);
  }
  return out.slice(0, 80);
}

var _searchCache = {};

// --- Circle FTP -------------------------------------------------------------
// JSON API on :5000. Search is one request; a title is a post, whose content is
// either the media URL (singleVideo) or a list of seasons with episodes.

var CIRCLE_API = 'http://new.circleftp.net:5000';
var CIRCLE_UP = 'http://15.1.1.50:5000';
var CIRCLE_MAIN = 'http://new.circleftp.net';

function _circleId(url) {
  var m = String(url).match(/\/content\/(\d+)/) || String(url).match(/\/api\/posts\/(\d+)/);
  return m ? m[1] : null;
}

function _circlePost(id) {
  return _json(CIRCLE_API + '/api/posts/' + id, PAGE_TIMEOUT_MS);
}

function _circleSearch(q) {
  return _json(CIRCLE_API + '/api/posts?searchTerm=' + encodeURIComponent(q) + '&order=desc', SEARCH_TIMEOUT_MS)
    .then(function (j) { return (j && j.posts) || []; });
}

function _circleItem(post, q, qWords, qKey) {
  var cover = post.imageSm ? CIRCLE_UP + '/uploads/' + post.imageSm
            : (post.image ? CIRCLE_UP + '/uploads/' + post.image : null);
  return _result(post.title, CIRCLE_MAIN + '/content/' + post.id, cover, post.metaData, q, qWords, qKey);
}

function _circleEpisodes(url) {
  var id = _circleId(url);
  if (!id) return Promise.resolve([]);
  return _circlePost(id).then(function (post) {
    if (!post) return [];
    if (post.type === 'series') {
      var seasons = post.content || [], out = [];
      for (var s = 0; s < seasons.length; s++) {
        var eps = seasons[s].episodes || [];
        for (var e = 0; e < eps.length; e++) {
          out.push({
            id: eps[e].link, title: _epTitle(_segName(eps[e].link)),
            number: out.length + 1, url: eps[e].link,
            season: parseInt(String(seasons[s].seasonName).replace(/\D+/g, ''), 10) || null
          });
        }
      }
      return out;
    }
    var media = typeof post.content === 'string' ? post.content : null;
    if (!media) return [];
    return [{ id: media, title: 'Episode 1', number: 1, url: media }];
  }).catch(function () { return []; });
}

function _circleSources(url) {
  var u = String(url);
  if (VIDEO_EXT.test(_safeDecode(u).split('?')[0])) return Promise.resolve([_source(u)]);
  var id = _circleId(u);
  if (!id) return Promise.resolve([]);
  return _circlePost(id).then(function (post) {
    if (!post) return [];
    if (typeof post.content === 'string') return [_source(post.content)];
    var seasons = post.content || [];
    for (var s = 0; s < seasons.length; s++) {
      var eps = seasons[s].episodes || [];
      if (eps.length && eps[0].link) return [_source(eps[0].link)];
    }
    return [];
  }).catch(function () { return []; });
}

// --- Dflix ------------------------------------------------------------------
// HTML site. Movies live under /m, series under /s, and each half has its own
// search endpoint. A movie's detail page links to an /m/playlist/<id> M3U whose
// last line is the media file; a series' seasons are separate pages that list
// the episodes as direct media links.

var DFLIX_MAIN = 'https://movies.discoveryftp.net';

function _fixImg(u) {
  if (!u) return null;
  u = String(u).trim();
  if (u.indexOf('//') === 0) u = 'https:' + u;
  else if (u.indexOf('http:') === 0) u = u.replace('http://', 'https://');
  else if (u.indexOf('http') !== 0) u = DFLIX_MAIN + '/' + u.replace(/^\//, '');
  return u.replace(/300\/\//g, '300/').replace(/1080\/\//g, '1080/').replace(/media\/\//g, 'media/');
}

function _blocks(html, marker) {
  var parts = String(html).split(marker);
  var out = [];
  for (var i = 1; i < parts.length; i++) out.push(parts[i].slice(0, 4000));
  return out;
}

function _first(block, re) {
  var m = String(block).match(re);
  return m ? m[1] : null;
}

function _dflixMovieSearch(q) {
  return _page(DFLIX_MAIN + '/m/find/' + encodeURIComponent(q), DFLIX_MAIN + '/m').then(function (html) {
    var out = [];
    var blocks = _blocks(html, '<div class="card');
    for (var i = 0; i < blocks.length; i++) {
      var href = _first(blocks[i], /<a[^>]*href=['\"]([^'\"]+)['\"]/);
      if (!href) continue;
      var title = _stripTags(_first(blocks[i], /<h3[^>]*>([\s\S]*?)<\/h3>/) || '');
      if (!title) continue;
      var img = _fixImg(_first(blocks[i], /<img[^>]*src=['\"]([^'\"]+)['\"]/));
      out.push({ name: title, url: /^https?:/.test(href) ? href : DFLIX_MAIN + href, cover: img });
    }
    return out;
  });
}

function _dflixSeriesSearch(q) {
  return _form(DFLIX_MAIN + '/search', 'term=' + encodeURIComponent(q) + '&types=s', SEARCH_TIMEOUT_MS, DFLIX_MAIN + '/s')
    .then(function (html) {
      var out = [];
      var blocks = _blocks(html, 'moviesearchiteam');
      for (var i = 0; i < blocks.length; i++) {
        var href = _first(blocks[i], /<a[^>]*href=['\"]([^'\"]+)['\"]/);
        if (!href) continue;
        var title = _stripTags(_first(blocks[i], /searchtitle[^>]*>([\s\S]*?)<\/div>/) || '');
        if (!title) continue;
        var img = _fixImg(_first(blocks[i], /<img[^>]*src=['\"]([^'\"]+)['\"]/));
        out.push({ name: title, url: /^https?:/.test(href) ? href : DFLIX_MAIN + href, cover: img });
      }
      return out;
    });
}

// Season links on a series page: /s/view/<id>/<season>
function _dflixSeasons(html) {
  var re = /href=['\"]([^'\"]*\/s\/view\/\d+\/\d+)['\"]/g, m, seen = {}, out = [];
  while ((m = re.exec(String(html)))) {
    if (seen[m[1]]) continue;
    seen[m[1]] = 1;
    out.push(m[1]);
  }
  return out;
}

function _dflixEpisodes(url) {
  return _page(url, DFLIX_MAIN + '/s').then(function (html) {
    // A movie detail page names its playlist; a series page names its seasons.
    var playlist = _first(html, /href=['\"](\/m\/playlist\/\d+)['\"]/);
    if (playlist) {
      return [{ id: playlist, title: 'Episode 1', number: 1, url: DFLIX_MAIN + playlist }];
    }
    var seasons = _dflixSeasons(html);
    if (!seasons.length) return [];
    return _mapLimit(seasons, 4, function (s) {
      var href = /^https?:/.test(s) ? s : DFLIX_MAIN + s;
      return _page(href, DFLIX_MAIN + '/s').then(function (sh) {
        var out = [], re = /<h5>\s*S(\d+)\s*\|\s*EP\s*(\d+)\s*<a href=['\"]([^'\"]+)['\"]/g, m;
        while ((m = re.exec(String(sh)))) {
          out.push({
            id: m[3],
            title: 'S' + (m[1].length < 2 ? '0' + m[1] : m[1]) + 'E' + (m[2].length < 2 ? '0' + m[2] : m[2]),
            number: out.length + 1,
            url: m[3],
            season: parseInt(m[1], 10)
          });
        }
        return out;
      }).catch(function () { return []; });
    }).then(function (groups) {
      var out = [];
      for (var i = 0; i < groups.length; i++) {
        var g = groups[i] || [];
        for (var k = 0; k < g.length; k++) out.push(g[k]);
      }
      // Seasons arrive out of order; the app plays them in list order.
      for (var n = 0; n < out.length; n++) out[n].number = n + 1;
      return out;
    });
  }).catch(function () { return []; });
}

function _dflixSources(url) {
  var u = String(url);
  if (VIDEO_EXT.test(_safeDecode(u).split('?')[0])) return Promise.resolve([_source(u)]);
  var playlist = u.match(/\/m\/playlist\/(\d+)/);
  if (playlist) {
    return _page(u, DFLIX_MAIN + '/m').then(function (t) {
      var lines = String(t).split(/\r?\n/), media = null;
      for (var i = lines.length - 1; i >= 0; i--) {
        var line = _trim(lines[i]);
        if (line && line.charAt(0) !== '#') { media = line; break; }
      }
      return media ? [_source(media)] : [];
    }).catch(function () { return []; });
  }
  return _page(u, DFLIX_MAIN + '/m').then(function (html) {
    var media = _first(html, /href=['\"](https?:[^'\"]+\.(?:mkv|mp4|m4v|avi|webm|mov)[^'\"]*)['\"]/i);
    return media ? [_source(media)] : [];
  }).catch(function () { return []; });
}

// --- ICC Ftp ----------------------------------------------------------------
// PHP site. Search is a form POST to command.php; a title opens player.php,
// whose download dropdown lists the episodes as direct media links.

var ICC_MAIN = 'http://10.16.100.244/';

function _iccSearch(q) {
  return _form(ICC_MAIN + 'command.php', 'cSearch=' + encodeURIComponent(q), SEARCH_TIMEOUT_MS, ICC_MAIN)
    .then(function (t) {
      try {
        var arr = JSON.parse(t);
        return Array.isArray(arr) ? arr : [];
      } catch (e) { return []; }
    });
}

function _iccMedia(html) {
  var re = /href=['\"](https?:[^'\"]+\.(?:mkv|mp4|m4v|avi|webm|mov)[^'\"]*)['\"]/gi, m, out = [];
  while ((m = re.exec(String(html)))) out.push(m[1]);
  return out;
}

function _iccEpisodes(url) {
  return _page(url, ICC_MAIN).then(function (html) {
    var h = String(html);
    // The download dropdown: <ul class="dropdown-menu"> ... <li><a href="<file>">
    var start = h.indexOf('dropdown-menu');
    if (start >= 0) {
      var end = h.indexOf('</ul>', start);
      var block = h.slice(start, end > start ? end : start + 8000);
      var re = /<a[^>]*href="([^"]+\.(?:mkv|mp4|m4v|avi|webm|mov)[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, m, out = [];
      while ((m = re.exec(block))) {
        out.push({
          id: m[1],
          title: _epTitle(_stripTags(m[2])),
          number: out.length + 1,
          url: m[1]
        });
      }
      if (out.length) return out;
    }
    var media = _iccMedia(h);
    if (media.length) {
      return [{ id: media[0], title: 'Episode 1', number: 1, url: media[0] }];
    }
    return [];
  }).catch(function () { return []; });
}

function _iccSources(url) {
  var u = String(url);
  if (VIDEO_EXT.test(_safeDecode(u).split('?')[0])) return Promise.resolve([_source(u)]);
  return _page(u, ICC_MAIN).then(function (html) {
    var media = _iccMedia(html);
    if (!media.length) return [];
    // Prefer the first: the page lists the same file once per episode, and the
    // smallest is not always the best encoded one.
    return [_source(media[0])];
  }).catch(function () { return []; });
}

// --- Dispatch ---------------------------------------------------------------

function _search(q, qWords, qKey) {
  if (SOURCE_ID === 'circleftp') {
    return _circleSearch(q).then(function (posts) {
      return posts.map(function (p) { return _circleItem(p, q, qWords, qKey); });
    }).catch(function () { return []; });
  }
  if (SOURCE_ID === 'iccftp') {
    return _iccSearch(q).then(function (posts) {
      return posts.map(function (p) {
        var img = p.image ? ICC_MAIN + 'files/' + p.image : null;
        return _result(p.name, ICC_MAIN + 'player.php?play=' + p.id, img, null, q, qWords, qKey);
      });
    }).catch(function () { return []; });
  }
  var finder = SOURCE_ID === 'dflix_series' ? _dflixSeriesSearch : _dflixMovieSearch;
  return finder(q).then(function (found) {
    return found.map(function (p) { return _result(p.name, p.url, p.cover, null, q, qWords, qKey); });
  }).catch(function () { return []; });
}

function getInfo() {
  return {
    name: SITE.name,
    lang: SITE.lang,
    baseUrl: SITE.base,
    logo: LOGO,
    type: 'movie',
    version: VERSION
  };
}

// Home rows are optional; the site's own category pages are cheap, so they are
// used where they work (ICC needs a session for its listings, so it is skipped).
function getHome(opts) {
  var page = (opts && opts.page) || 1, rows = [];
  function circle() {
    var cats = [
      ['6', 'English Movies'], ['9', 'English & Foreign TV Series'],
      ['22', 'Dubbed TV Series'], ['8', 'Foreign Language Movies'],
      ['21', 'Anime Series'], ['85', 'Documentary']
    ];
    return _mapLimit(cats, 3, function (c) {
      return _json(CIRCLE_API + '/api/posts?categoryExact=' + c[0] + '&page=' + page + '&order=desc&limit=10', SEARCH_TIMEOUT_MS)
        .then(function (j) {
          var items = ((j && j.posts) || []).map(function (p) { return _circleItem(p, '', [], ''); });
          if (items.length) rows.push({ title: c[1], items: items });
        }).catch(function () {});
    }).then(function () { return rows; });
  }
  function dflix() {
    var cats = KIND === 'series'
      ? [['Foreign', 'English'], ['Bangla', 'Bangla'], ['Hindi', 'Hindi'], ['South', 'South'], ['Animation', 'Animation'], ['Dubbed', 'Dubbed']]
      : [['English', 'English'], ['Bangla', 'Bangla'], ['Hindi', 'Hindi'], ['Tamil', 'Tamil'], ['Animation', 'Animation'], ['Others', 'Others']];
    var base = KIND === 'series' ? '/s/category/' : '/m/category/';
    return _mapLimit(cats, 2, function (c) {
      return _page(DFLIX_MAIN + base + c[0] + '/' + page, DFLIX_MAIN + (KIND === 'series' ? '/s' : '/m'))
        .then(function (html) {
          var items = [];
          if (KIND === 'series') {
            var blocks = _blocks(html, 'col-xl-4');
            for (var i = 0; i < blocks.length; i++) {
              var href = _first(blocks[i], /<a[^>]*href=['\"]([^'\"]+)['\"]/);
              var title = _stripTags(_first(blocks[i], /<div[^>]*class=['"]ftitle['"][^>]*>([\s\S]*?)<\/div>/) || '');
              if (href && title) items.push(_result(title, /^https?:/.test(href) ? href : DFLIX_MAIN + href, _fixImg(_first(blocks[i], /<img[^>]*src=['\"]([^'\"]+)['\"]/)), null, '', [], ''));
            }
          } else {
            var cb = _blocks(html, '<div class="card');
            for (var k = 0; k < cb.length; k++) {
              var h = _first(cb[k], /<a[^>]*href=['\"]([^'\"]+)['\"]/);
              var t = _stripTags(_first(cb[k], /<h3[^>]*>([\s\S]*?)<\/h3>/) || '');
              if (h && t) items.push(_result(t, /^https?:/.test(h) ? h : DFLIX_MAIN + h, _fixImg(_first(cb[k], /<img[^>]*src=['\"]([^'\"]+)['\"]/)), null, '', [], ''));
            }
          }
          if (items.length) rows.push({ title: c[1], items: items });
        }).catch(function () {});
    }).then(function () { return rows; });
  }
  var p = SOURCE_ID === 'circleftp' ? circle() : (SOURCE_ID === 'iccftp' ? Promise.resolve(rows) : dflix());
  return p.catch(function () { return rows; });
}

function search(query, page, opts) {
  var q = _trim(String(query || ''));
  if (!q) return Promise.resolve([]);
  var key = q.toLowerCase();
  if (_searchCache[key]) return Promise.resolve(_searchCache[key]);
  var qWords = _queryWords(q).map(function (w) { return w.toLowerCase(); });
  var qNorm = _normTitle(q);
  var qKey = _matchKey(q);
  return _search(q, qWords, qKey).then(function (list) {
    var out = _sortResults(list, qWords, qNorm, qKey);
    if (out.length) _searchCache[key] = out;
    return out;
  }).catch(function () { return []; });
}

function getEpisodes(url, opts) {
  if (SOURCE_ID === 'circleftp') return _circleEpisodes(url);
  if (SOURCE_ID === 'iccftp') return _iccEpisodes(url);
  return _dflixEpisodes(url);
}

function getVideoSources(url, fast) {
  if (SOURCE_ID === 'circleftp') return _circleSources(url);
  if (SOURCE_ID === 'iccftp') return _iccSources(url);
  return _dflixSources(url);
}
