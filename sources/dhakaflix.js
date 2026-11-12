// DhakaFlix provider for Zangetsu.
//
// DhakaFlix is a BDIX file server (nginx + h5ai 0.29). Besides the HTML
// directory table it serves h5ai's private JSON API, including a recursive
// server-side regex search — that is what makes instant search possible here.
//
// ONE file, loaded once per sourceId: dhakaflix_movies / dhakaflix_series /
// dhakaflix_anime. The sourceId decides which category folders this source
// exposes.
//
// Reachable only from a BDIX-connected line. Every failure degrades to an
// empty list instead of an exception.

var UA = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

var SOURCE_ID = (typeof __SOURCE_ID !== 'undefined' && __SOURCE_ID) ? String(__SOURCE_ID) : 'dhakaflix_movies';

// --- Categories -------------------------------------------------------------
// Top-level folders as linked from http://172.16.50.4/, each with the content
// host that actually serves it.
var CATEGORIES = [
  { id: 'en',        kind: 'movies', server: 'http://172.16.50.7',  path: '/DHAKA-FLIX-7/English%20Movies/',                  name: 'English Movies' },
  { id: 'en1080',    kind: 'movies', server: 'http://172.16.50.14', path: '/DHAKA-FLIX-14/English%20Movies%20%281080p%29/',    name: 'English Movies 1080p' },
  { id: 'hindi',     kind: 'movies', server: 'http://172.16.50.14', path: '/DHAKA-FLIX-14/Hindi%20Movies/',                   name: 'Hindi Movies' },
  { id: 'south',     kind: 'movies', server: 'http://172.16.50.14', path: '/DHAKA-FLIX-14/SOUTH%20INDIAN%20MOVIES/South%20Movies/', name: 'South Indian Movies' },
  { id: 'southhd',   kind: 'movies', server: 'http://172.16.50.14', path: '/DHAKA-FLIX-14/SOUTH%20INDIAN%20MOVIES/Hindi%20Dubbed/', name: 'South Movies Hindi Dubbed' },
  { id: 'bangla',    kind: 'movies', server: 'http://172.16.50.7',  path: '/DHAKA-FLIX-7/Kolkata%20Bangla%20Movies/',         name: 'Kolkata Bangla Movies' },
  { id: 'foreign',   kind: 'movies', server: 'http://172.16.50.7',  path: '/DHAKA-FLIX-7/Foreign%20Language%20Movies/',       name: 'Foreign Language Movies' },
  { id: 'imdb',      kind: 'movies', server: 'http://172.16.50.14', path: '/DHAKA-FLIX-14/IMDb%20Top-250%20Movies/',          name: 'IMDb Top 250' },
  { id: 'threeD',    kind: 'movies', server: 'http://172.16.50.7',  path: '/DHAKA-FLIX-7/3D%20Movies/',                       name: '3D Movies' },

  { id: 'tv',        kind: 'series', server: 'http://172.16.50.12', path: '/DHAKA-FLIX-12/TV-WEB-Series/',                    name: 'TV & Web Series' },
  { id: 'korean',    kind: 'series', server: 'http://172.16.50.14', path: '/DHAKA-FLIX-14/KOREAN%20TV%20%26%20WEB%20Series/',  name: 'Korean TV & Web Series' },
  { id: 'cartoon',   kind: 'series', server: 'http://172.16.50.10', path: '/DHAKA-FLIX-10/Anime%20%26%20Cartoon%20TV%20Series/', name: 'Cartoon TV Series' },

  { id: 'anime',     kind: 'anime',  server: 'http://172.16.50.10', path: '/DHAKA-FLIX-10/Anime%20%26%20Cartoon%20TV%20Series/', name: 'Anime TV Series' },
  { id: 'animemov',  kind: 'anime',  server: 'http://172.16.50.14', path: '/DHAKA-FLIX-14/Animation%20Movies/',               name: 'Animation Movies' },
  { id: 'anime1080', kind: 'anime',  server: 'http://172.16.50.14', path: '/DHAKA-FLIX-14/Animation%20Movies%20%281080p%29/',  name: 'Animation Movies 1080p' }
];

var VIDEO_EXT = /\.(mkv|mp4|m4v|avi|webm|mov|ts|m2ts|flv|wmv)$/i;
var IMAGE_EXT = /\.(jpe?g|png|webp)$/i;

var KIND = SOURCE_ID.indexOf('series') >= 0 ? 'series' : (SOURCE_ID.indexOf('anime') >= 0 ? 'anime' : 'movies');

function _myCategories() {
  var out = [];
  for (var i = 0; i < CATEGORIES.length; i++) {
    var c = CATEGORIES[i];
    if (c.kind !== KIND) continue;
    // The anime/cartoon share is listed once per source, not twice.
    if (c.id === 'cartoon' && KIND !== 'series') continue;
    if (c.id === 'anime' && KIND === 'series') continue;
    out.push(c);
  }
  return out;
}

function _catUrl(c) { return c.server + c.path; }

// --- HTTP -------------------------------------------------------------------
function _origin(url) {
  var m = String(url).match(/^(https?:\/\/[^\/]+)/i);
  return m ? m[1] : '';
}

function _path(url) {
  var o = _origin(url);
  var p = o ? String(url).slice(o.length) : String(url);
  return p || '/';
}

function _decode(s) {
  return String(s)
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&#x27;/gi, "'")
    .replace(/&nbsp;/g, ' ');
}

function _stripTags(s) { return _decode(String(s).replace(/<[^>]*>/g, '')); }

function _trim(s) { return String(s == null ? '' : s).replace(/^\s+|\s+$/g, ''); }

function _safeDecode(s) {
  try { return decodeURIComponent(String(s)); } catch (e) { return String(s); }
}

function _segName(path) {
  var p = String(path || '').replace(/\/+$/, '');
  var i = p.lastIndexOf('/');
  return _safeDecode(i >= 0 ? p.slice(i + 1) : p).replace(/\+/g, ' ');
}

function _h5ai(dirUrl, payload) {
  return fetch(dirUrl, {
    method: 'POST',
    headers: { 'User-Agent': UA, 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify(payload)
  }).then(function (r) {
    if (!r || !r.ok) throw new Error('DhakaFlix: HTTP ' + (r ? r.status : '?'));
    var j;
    try { j = JSON.parse(r.body); } catch (e) { throw new Error('DhakaFlix: bad JSON'); }
    if (!j || j.code) throw new Error('DhakaFlix: ' + ((j && j.code) || 'error'));
    return j;
  });
}

// h5ai's items[] returns the ancestors too; keep only the direct children.
function _children(dirUrl) {
  var href = _path(dirUrl);
  var want = href.replace(/\/+$/, '') + '/';
  return _h5ai(dirUrl, { action: 'get', items: { href: want, what: 1 } }).then(function (j) {
    var items = j.items || [], out = [];
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (!it || !it.href || it.href === want) continue;
      var parent = it.href.replace(/\/[^\/]*\/?$/, '/');
      if (parent !== want) continue;
      out.push(_toEntry(it, _origin(dirUrl)));
    }
    return out;
  });
}

function _toEntry(it, server) {
  var href = String(it.href);
  var isFolder = (it.size === null || it.size === undefined) && /\/$/.test(href);
  return {
    name: _segName(href), href: href, url: server + href,
    folder: isFolder, file: !isFolder,
    size: isFolder ? 0 : Number(it.size || 0), date: ''
  };
}

// Fallback: the HTML <noscript> table h5ai also prints. Used if the JSON API
// ever gets locked down.
var RE_H5AI = /<td class="fb-i"><img src="[^"]*" alt="([^"]*)"\s*\/?><\/td><td class="fb-n"><a href="([^"]*)">([\s\S]*?)<\/a><\/td><td class="fb-d">([\s\S]*?)<\/td><td class="fb-s">([\s\S]*?)<\/td>/g;

function _childrenHtml(dirUrl) {
  return fetch(dirUrl, { headers: { 'User-Agent': UA, 'Accept': 'text/html' } }).then(function (r) {
    if (!r || !r.ok) throw new Error('DhakaFlix: HTTP ' + (r ? r.status : '?'));
    var html = String(r.body || ''), out = [], m;
    var origin = _origin(dirUrl);
    RE_H5AI.lastIndex = 0;
    while ((m = RE_H5AI.exec(html)) !== null) {
      if (/parent/i.test(m[1]) || !m[2] || m[2] === '..') continue;
      var href = /^https?:/i.test(m[2]) ? _path(m[2]) : m[2];
      var isFolder = m[1] === 'folder';
      out.push({
        name: _trim(_stripTags(m[3])), href: href, url: origin + href,
        folder: isFolder, file: !isFolder, size: _sizeBytes(m[5]), date: _trim(m[4])
      });
    }
    return out;
  });
}

function _list(dirUrl) {
  return _children(dirUrl).then(function (items) {
    if (items.length) return items;
    return _childrenHtml(dirUrl);
  }).catch(function () { return _childrenHtml(dirUrl); });
}

// "1150185 KB" / "1.2 GB" / "180 KB" -> bytes
function _sizeBytes(s) {
  var m = String(s || '').match(/([0-9]+(?:\.[0-9]+)?)\s*(B|KB|MB|GB|TB)?/i);
  if (!m) return 0;
  var n = parseFloat(m[1]), u = (m[2] || 'B').toUpperCase();
  var mul = u === 'KB' ? 1024 : u === 'MB' ? 1048576 : u === 'GB' ? 1073741824 : u === 'TB' ? 1099511627776 : 1;
  return Math.round(n * mul);
}

function _videos(entries) {
  var out = [];
  for (var i = 0; i < entries.length; i++) {
    var e = entries[i];
    if (e.file && VIDEO_EXT.test(e.name)) out.push(e);
  }
  return out;
}

function _poster(entries) {
  for (var i = 0; i < entries.length; i++) {
    if (entries[i].file && IMAGE_EXT.test(entries[i].name)) return entries[i].url;
  }
  return null;
}

// --- Naming -----------------------------------------------------------------
// Release tags stripped so the app shows "Dune (1984)" instead of
// "Dune 1984 EXTENDED 1080p BluRay x265 HEVC 10bit ESub-Joy".
var RE_TAG = /(?:^|[\s._\-\[\(])(?:2160p|1080p|1080i|720p|576p|540p|480p|360p|4k|uhd|x264|x265|h264|h265|hevc|avc|xvid|divx|aac|ac3|eac3|dts|ddp|bluray|blu-ray|bdrip|brrip|webrip|web-dl|webdl|hdrip|dvdrip|dvdscr|hdtv|pdtv|amzn|nf|hmax|dsnp|atvp|zs|esub|esubs|msub|msubs|multi|proper|repack|remux|extended|unrated|10bit|8bit|5[._]1|2[._]0|7[._]1|hindi|english|dubbed)(?=$|[\s._\-\]\)])/gi;

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
  n = n.replace(/\[[^\]]*\]/g, ' ');                       // [Dual Audio][Hindi 5.1+English 5.1]
  n = n.replace(/\(\s*(?:dual|multi)\s*audio\s*\)/gi, ' '); // (Dual Audio)
  for (var i = 0; i < 3; i++) n = n.replace(RE_TAG, ' ');   // repeated: adjacent tags
  n = n.replace(/\s*[-_.]+\s*$/g, ' ').replace(/^[\s\-_.]+/, '');
  n = n.replace(/\s*[-\u2013]\s*[A-Za-z0-9]{2,12}$/, '');   // trailing "-GalaxyRG"/"-MsMod"
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

function _yearOf(s) {
  var m = String(s || '').match(/\((\d{4})(?:\s*[-\u2013]\s*(\d{4})?)?\)/);
  if (m) return parseInt(m[1], 10);
  m = String(s || '').match(/\b(19|20)\d{2}\b/);
  return m ? parseInt(m[0], 10) : null;
}

function _episodeNumber(name) {
  var m = String(name || '').match(/[Ss](\d{1,2})[\s._-]?[Ee][Pp]?(\d{1,3})/);
  if (m) return parseInt(m[2], 10);
  m = String(name || '').match(/\b(\d{1,2})x(\d{2,3})\b/);
  if (m) return parseInt(m[2], 10);
  m = String(name || '').match(/(?:^|[\s._\-\[])Ep?(?:isode)?[\s._-]*(\d{1,4})\b/i);
  return m ? parseInt(m[1], 10) : null;
}

function _seasonNumber(name) {
  var m = String(name || '').match(/[Ss](\d{1,2})[\s._-]?[Ee][Pp]?\d{1,3}/) ||
          String(name || '').match(/Season[\s._-]*(\d{1,2})/i);
  return m ? parseInt(m[1], 10) : null;
}

function _quality(name) {
  var m = String(name || '').match(/\b(2160p|1440p|1080p|720p|576p|540p|480p|360p|4k|8k)\b/i);
  return m ? m[1] : null;
}

function _sortByEpisode(a, b) {
  var an = a._n == null ? 100000 : a._n, bn = b._n == null ? 100000 : b._n;
  if (an !== bn) return an - bn;
  return a.title < b.title ? -1 : a.title > b.title ? 1 : 0;
}

// --- Item shapes ------------------------------------------------------------
function _item(name, url, cat) {
  return {
    id: url, title: _pretty(name), url: url,
    type: KIND === 'anime' ? 'anime' : 'movie',
    sourceId: SOURCE_ID, cover: null, description: null,
    _year: _yearOf(name), _cat: cat ? cat.id : null
  };
}

// --- Concurrency ------------------------------------------------------------
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

// --- Provider API -----------------------------------------------------------
function getInfo() {
  var names = { movies: 'DhakaFlix Movies', series: 'DhakaFlix Series', anime: 'DhakaFlix Anime' };
  return {
    name: names[KIND], lang: 'en', baseUrl: 'http://172.16.50.4/',
    logo: 'https://mamun015.github.io/zangetsu-dhakaflix/logo.png',
    type: KIND === 'anime' ? 'anime' : 'movie', version: '1.1.0'
  };
}

// One row per category; row items are that category's year / letter groups, so
// the home screen costs one request per category and nothing is pre-indexed.
function getHome(opts) {
  var cats = _myCategories(), rows = [];
  return _mapLimit(cats, 3, function (c) {
    var load = KIND === 'series' ? _seriesTitles(c) : _groupItems(c);
    return load.then(function (items) {
      if (items.length) rows.push({ title: c.name, items: items });
    });
  }).then(function () { return rows; });
}

// Movie / anime home row: the category's year or letter groups. Tapping one
// lists its films as cards, which play straight away.
function _groupItems(c) {
  return _list(_catUrl(c)).then(function (children) {
    var items = [], seen = {};
    for (var i = 0; i < children.length && items.length < 120; i++) {
      var e = children[i];
      if (!e.folder || seen[e.url]) continue;
      seen[e.url] = 1;
      var it = _item(e.name, e.url, c);
      it.title = c.name + ' \u00b7 ' + it.title;
      items.push(it);
    }
    return items;
  });
}

// Series home row: real shows, not letter buckets. One request for the
// category, one per bucket (4-5 buckets), so the row is honest and cheap.
function _seriesTitles(c) {
  return _list(_catUrl(c)).then(function (children) {
    var groups = [], titles = [];
    for (var i = 0; i < children.length; i++) {
      var e = children[i];
      if (!e.folder) continue;
      if (_looksLikeBucket(e.name)) groups.push(e); else titles.push(e);
    }
    if (!groups.length) {
      return titles.map(function (e) { return _item(e.name, e.url, c); });
    }
    var out = [];
    return _mapLimit(groups, 4, function (g) {
      return _list(g.url).then(function (inner) {
        for (var k = 0; k < inner.length; k++) {
          if (inner[k].folder) out.push(_item(inner[k].name, inner[k].url, c));
        }
      });
    }).then(function () {
      var all = out.concat(titles.map(function (e) { return _item(e.name, e.url, c); }));
      return all.slice(0, 200);
    });
  });
}

// "TV Series \u2605 0 \u2014 9" / "(2024)" / "A \u2014 F" style bucket folders.
function _looksLikeBucket(name) {
  var n = _cleanName(name);
  if (/^\(\d{4}/.test(n)) return true;
  if (n.indexOf('\u2014') >= 0) return true;
  if (/^\d{1,2}$/.test(n)) return true;
  return false;
}

function popular(opts) {
  var cats = _myCategories();
  return _mapLimit(cats, 3, function (c) {
    return _list(_catUrl(c)).then(function (children) {
      var out = [];
      for (var i = children.length - 1; i >= 0 && out.length < 20; i--) {
        if (!children[i].folder) continue;
        out.push(_item(children[i].name, children[i].url, c));
      }
      return out;
    });
  }).then(function (lists) {
    var out = [];
    for (var i = 0; i < lists.length; i++) out = out.concat(lists[i]);
    return out.slice(0, 60);
  });
}

// Server-side recursive regex search, one call per category. h5ai returns both
// folders and files; a folder that matches is a title, a file is a loose video
// in one of them.
function _regexEscape(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function _searchCategory(c, pattern) {
  var href = _path(_catUrl(c)).replace(/\/+$/, '') + '/';
  return _h5ai(_catUrl(c), { action: 'get', search: { href: href, pattern: pattern, ignorecase: true } })
    .then(function (j) {
      var hits = j.search || [], out = [];
      for (var i = 0; i < hits.length; i++) {
        var h = hits[i];
        if (!h || !h.href) continue;
        var isFolder = /\/$/.test(h.href);
        if (!isFolder) continue;                 // files handled via their folder
        out.push({ name: _segName(h.href), url: c.server + h.href, cat: c, size: 0, folder: true });
      }
      return out;
    }).catch(function () { return []; });
}

var _searchCache = {};

function search(query, page, opts) {
  var q = _trim(String(query || ''));
  if (!q) return Promise.resolve([]);
  var key = q.toLowerCase();
  if (_searchCache[key]) return Promise.resolve(_searchCache[key]);
  var pattern = _regexEscape(key);
  var cats = _myCategories();
  return _mapLimit(cats, 3, function (c) { return _searchCategory(c, pattern); }).then(function (lists) {
    var out = [], seen = {};
    for (var i = 0; i < lists.length; i++) {
      for (var k = 0; k < lists[i].length; k++) {
        var r = lists[i][k];
        var norm = r.url.replace(/\/+$/, '').toLowerCase();
        if (seen[norm]) continue;
        seen[norm] = 1;
        var tkey = _pretty(r.name).toLowerCase();
        if (seen['t:' + tkey]) continue;
        seen['t:' + tkey] = 1;
        out.push(_item(r.name, r.url, r.cat));
      }
    }
    // Title matches rank above path matches ("Dune" before "The Sand Dune").
    var low = key;
    out.sort(function (a, b) {
      var at = a.title.toLowerCase().indexOf(low) === 0 ? 0 : 1;
      var bt = b.title.toLowerCase().indexOf(low) === 0 ? 0 : 1;
      if (at !== bt) return at - bt;
      return a.title < b.title ? -1 : a.title > b.title ? 1 : 0;
    });
    var capped = out.slice(0, 80);
    if (capped.length) _searchCache[key] = capped;
    return capped;
  });
}

function _isSeasonName(name) {
  return /^(season\s*\d+|s\d{1,2}\b|complete\b|specials?\b|extras?\b|bonus\b)/i.test(_cleanName(name));
}

// Detail works for three shapes:
//   group folder (year / letter range) -> child folders as episode cards
//   title folder with video files      -> those files as episodes
//   title folder with season folders   -> the files inside those seasons
function getDetail(url, opts) {
  var u = String(url);
  return _list(u).then(function (children) {
    var title = _pretty(u);
    var poster = _poster(children);
    var vids = _videos(children);
    var folders = [];
    for (var j = 0; j < children.length; j++) if (children[j].folder) folders.push(children[j]);
    var seasons = [];
    for (var s = 0; s < folders.length; s++) if (_isSeasonName(folders[s].name)) seasons.push(folders[s]);

    // A title folder's children are its seasons ("Season 1", "Complete …").
    if (folders.length && seasons.length >= Math.ceil(folders.length * 0.6)) {
      var eps = [];
      return _mapLimit(seasons, 4, function (sf) {
        return _list(sf.url).then(function (inner) {
          var files = _videos(inner);
          if (!files.length) {
            // Episodes one level deeper (Extras / Subs). One level only —
            // deeper would make a browse page into a hundred requests.
            var subs = [];
            for (var i = 0; i < inner.length; i++) if (inner[i].folder) subs.push(inner[i]);
            if (subs.length !== 1) return;
            return _list(subs[0].url).then(function (deep) {
              var d = _videos(deep);
              for (var q = 0; q < d.length; q++) _pushFile(eps, d[q], sf);
            }).catch(function () {});
          }
          for (var k = 0; k < files.length; k++) _pushFile(eps, files[k], sf);
        }).catch(function () {});
      }).then(function () {
        return _detail(u, title, poster, _numbered(eps, title));
      });
    }

    // Group / year / letter folder: every child folder is a title card, plus
    // any video file sitting loose in the group (a real thing on this server).
    // A title folder that holds exactly one movie file: label the episode
    // with the folder title ("Dune (1984)"), not the release filename.
    if (vids.length === 1 && !folders.length) {
      return _detail(u, title, poster, [{
        id: vids[0].url, title: title, number: 1, url: vids[0].url,
        _n: 1, _size: vids[0].size || 0, _season: null
      }]);
    }

    var cards = [];
    for (var f = 0; f < folders.length; f++) {
      cards.push({
        id: folders[f].url, title: _pretty(folders[f].name), number: cards.length + 1,
        url: folders[f].url, _n: null, _size: 0, _season: null
      });
    }
    for (var i = 0; i < vids.length; i++) cards.push(_epFromFile(vids[i], cards.length + 1));
    return _detail(u, title, poster, _numbered(cards, title));
  }).catch(function () {
    return null;
  });
}

function _pushFile(eps, file, seasonFolder) {
  var ep = _epFromFile(file, eps.length + 1);
  ep._season = _seasonNumber(file.name) || (seasonFolder ? _seasonNumber(seasonFolder.name) : null);
  eps.push(ep);
}

function _epFromFile(e, n) {
  return {
    id: e.url, title: _epTitle(e.name), number: n, url: e.url,
    _n: _episodeNumber(e.name), _size: e.size || 0, _season: null
  };
}

function _numbered(eps, showTitle) {
  eps.sort(_sortByEpisode);
  var out = [];
  for (var i = 0; i < eps.length; i++) {
    var e = eps[i], t = e.title;
    // "Naruto S01E01 Naruto E001 …" -> drop the repeated show name.
    if (showTitle) {
      var names = [showTitle, String(showTitle).split(' (')[0]];
      for (var ni = 0; ni < names.length; ni++) {
        var nm = _trim(names[ni]);
        if (nm.length < 4) continue;
        var lowE = t.toLowerCase(), at = lowE.indexOf(nm.toLowerCase());
        if (at >= 0) {
          t = (t.slice(0, at) + ' ' + t.slice(at + nm.length)).replace(/\s{2,}/g, ' ');
          t = t.replace(/^[\s\u00b7.\-–]+/, '');
          break;
        }
      }
    }
    if (e._season && !/^S\d+/.test(t)) {
      var n = e._n;
      t = (n != null && n > 0)
        ? 'S' + e._season + 'E' + (n < 10 ? '0' + n : n) + ' \u00b7 ' + t
        : 'S' + e._season + ' \u00b7 ' + t;
    }
    out.push({ id: e.id, title: t, number: i + 1, url: e.url });
  }
  return out;
}

function _detail(url, title, poster, episodes) {
  return {
    id: url, title: title, url: url, description: null,
    cover: poster || null, status: 'unknown', genres: [], studios: [],
    type: KIND === 'anime' ? 'anime' : 'movie', sourceId: SOURCE_ID,
    episodes: episodes, year: _yearOf(title)
  };
}

function getEpisodes(url, opts) {
  return getDetail(url, opts).then(function (d) { return d ? d.episodes : []; });
}

// A direct file plays as-is. A folder resolves to its biggest videos (a title
// card reached straight from a group listing). nginx serves these statically
// with Range support, so seeking works without any proxy.
function getVideoSources(episodeUrl) {
  var u = String(episodeUrl);
  if (!/\/$/.test(u)) return Promise.resolve([_source(u, _quality(_safeDecode(u)))]);
  return _list(u).then(function (children) {
    var vids = _videos(children);
    if (vids.length) return _sourcesFrom(vids);
    var subs = [];
    for (var i = 0; i < children.length; i++) if (children[i].folder) subs.push(children[i]);
    if (!subs.length) throw new Error('DhakaFlix: \u098f\u0987 \u09ab\u09cb\u09b2\u09cd\u09a1\u09be\u09b0\u09c7 \u0995\u09cb\u09a8\u09cb \u09ad\u09bf\u09a1\u09bf\u0993 \u09ab\u09be\u0987\u09b2 \u09a8\u09c7\u0987');
    // A show's card resolves to its first season only: mixing seasons into
    // one source list would label unrelated episodes as one stream.
    var seasonSubs = [];
    for (var sIdx = 0; sIdx < subs.length; sIdx++) if (_isSeasonName(subs[sIdx].name)) seasonSubs.push(subs[sIdx]);
    if (seasonSubs.length > 1) subs = [seasonSubs[0]];
    var found = [];
    return _mapLimit(subs, 4, function (sf) {
      return _list(sf.url).then(function (inner) {
        var f = _videos(inner);
        for (var k = 0; k < f.length; k++) found.push(f[k]);
      }).catch(function () {});
    }).then(function () {
      if (!found.length) throw new Error('DhakaFlix: এই ফোল্ডারে কোনো ভিডিও ফাইল নেই');
      return _sourcesFrom(found);
    });
  });
}

function _sourcesFrom(vids) {
  vids.sort(function (a, b) { return b.size - a.size; });
  var out = [];
  for (var i = 0; i < vids.length && out.length < 5; i++) out.push(_source(vids[i].url, _quality(vids[i].name)));
  return out;
}

function _source(url, quality) {
  var isMp4 = /\.(mp4|m4v|mov)$/i.test(url);
  return {
    url: url,
    quality: quality || null,
    label: null,
    container: isMp4 ? 'mp4' : 'unknown',
    headers: { 'User-Agent': UA },
    kind: 'raw',
    audioLang: null,
    subtitles: []
  };
}
