// DhakaFlix provider for Zangetsu.
//
// DhakaFlix is a BDIX file server (nginx + h5ai 0.29) reachable from a
// BDIX-connected line. Besides the HTML directory table the server serves
// h5ai's JSON API, including a recursive server-side regex search — that is
// what makes instant search possible here.
//
// ONE file, loaded once per sourceId: dhakaflix_movies / dhakaflix_series /
// dhakaflix_anime. The sourceId decides which category folders this source
// exposes.
//
// Reachable only from a BDIX-connected line. Every failure degrades to an
// empty list instead of an exception.

var UA = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

var SOURCE_ID = (typeof __SOURCE_ID !== 'undefined' && __SOURCE_ID) ? String(__SOURCE_ID) : 'dhakaflix_movies';

// Public TMDB v3 key (the same one the CloudStream BDIX extensions use). It
// only enriches a title with a poster, a plot and a rating; if TMDB is
// unreachable the local files are used exactly as before. Replace it with your
// own key if you want to.
var TMDB_KEY = 'e6333b32409e02a4a6eba6fb7ff866bb';

// --- Servers ----------------------------------------------------------------
// The content hosts. A "share" is one published folder on that host.
var SERVERS = [
  { id: '7',  host: 'http://172.16.50.7',  share: 'DHAKA-FLIX-7',  media: true },
  { id: '8',  host: 'http://172.16.50.8',  share: 'DHAKA-FLIX-8',  media: false }, // games, software
  { id: '10', host: 'http://172.16.50.10', share: 'DHAKA-FLIX-10', media: true },
  { id: '12', host: 'http://172.16.50.12', share: 'DHAKA-FLIX-12', media: true },
  { id: '14', host: 'http://172.16.50.14', share: 'DHAKA-FLIX-14', media: true }
];

// Where a search runs. Scoping it to the published folders instead of the
// whole share cuts the answer from seconds to a fraction of a second: the
// big shares hold tens of thousands of files, and a share-wide pattern also
// matches every episode file of every show.
var SEARCH_SCOPES = {
  movies: [
    { host: 'http://172.16.50.7',  href: '/DHAKA-FLIX-7/English%20Movies/' },
    { host: 'http://172.16.50.7',  href: '/DHAKA-FLIX-7/Foreign%20Language%20Movies/' },
    { host: 'http://172.16.50.7',  href: '/DHAKA-FLIX-7/Kolkata%20Bangla%20Movies/' },
    { host: 'http://172.16.50.7',  href: '/DHAKA-FLIX-7/3D%20Movies/' },
    { host: 'http://172.16.50.14', href: '/DHAKA-FLIX-14/English%20Movies%20%281080p%29/' },
    { host: 'http://172.16.50.14', href: '/DHAKA-FLIX-14/Hindi%20Movies/' },
    { host: 'http://172.16.50.14', href: '/DHAKA-FLIX-14/SOUTH%20INDIAN%20MOVIES/' },
    { host: 'http://172.16.50.14', href: '/DHAKA-FLIX-14/IMDb%20Top-250%20Movies/' }
  ],
  series: [
    { host: 'http://172.16.50.12', href: '/DHAKA-FLIX-12/TV-WEB-Series/' },
    { host: 'http://172.16.50.14', href: '/DHAKA-FLIX-14/KOREAN%20TV%20%26%20WEB%20Series/' },
    { host: 'http://172.16.50.10', href: '/DHAKA-FLIX-10/Anime%20%26%20Cartoon%20TV%20Series/' },
    { host: 'http://172.16.50.10', href: '/DHAKA-FLIX-10/Awards%20%26%20TV%20Shows/' },
    { host: 'http://172.16.50.10', href: '/DHAKA-FLIX-10/WWE%20%26%20AEW%20Wrestling/' },
    { host: 'http://172.16.50.10', href: '/DHAKA-FLIX-10/Documentary/' }
  ],
  anime: [
    { host: 'http://172.16.50.10', href: '/DHAKA-FLIX-10/Anime%20%26%20Cartoon%20TV%20Series/' },
    { host: 'http://172.16.50.14', href: '/DHAKA-FLIX-14/Animation%20Movies/' },
    { host: 'http://172.16.50.14', href: '/DHAKA-FLIX-14/Animation%20Movies%20%281080p%29/' }
  ]
};

// --- Categories -------------------------------------------------------------
// Top-level folders on the servers, as published by the BDIX operator.
// `kind` decides which source (movies / series / anime) exposes it.
var CATEGORIES = [
  // Movies
  { id: 'en',        kind: 'movies', host: 'http://172.16.50.7',  path: '/DHAKA-FLIX-7/English%20Movies/',                 name: 'English Movies' },
  { id: 'en1080',    kind: 'movies', host: 'http://172.16.50.14', path: '/DHAKA-FLIX-14/English%20Movies%20%281080p%29/',   name: 'English Movies 1080p' },
  { id: 'hindi',     kind: 'movies', host: 'http://172.16.50.14', path: '/DHAKA-FLIX-14/Hindi%20Movies/',                    name: 'Hindi Movies' },
  { id: 'south',     kind: 'movies', host: 'http://172.16.50.14', path: '/DHAKA-FLIX-14/SOUTH%20INDIAN%20MOVIES/South%20Movies/', name: 'South Indian Movies' },
  { id: 'southhd',   kind: 'movies', host: 'http://172.16.50.14', path: '/DHAKA-FLIX-14/SOUTH%20INDIAN%20MOVIES/Hindi%20Dubbed/', name: 'South Movies Hindi Dubbed' },
  { id: 'bangla',    kind: 'movies', host: 'http://172.16.50.7',  path: '/DHAKA-FLIX-7/Kolkata%20Bangla%20Movies/',          name: 'Kolkata Bangla Movies' },
  { id: 'foreign',   kind: 'movies', host: 'http://172.16.50.7',  path: '/DHAKA-FLIX-7/Foreign%20Language%20Movies/',        name: 'Foreign Language Movies' },
  { id: 'imdb',      kind: 'movies', host: 'http://172.16.50.14', path: '/DHAKA-FLIX-14/IMDb%20Top-250%20Movies/',           name: 'IMDb Top 250' },
  { id: 'threeD',    kind: 'movies', host: 'http://172.16.50.7',  path: '/DHAKA-FLIX-7/3D%20Movies/',                         name: '3D Movies' },
  // Foreign language, split by language folder
  { id: 'fl_jp',     kind: 'movies', host: 'http://172.16.50.7',  path: '/DHAKA-FLIX-7/Foreign%20Language%20Movies/Japanese%20Language/', name: 'Japanese Movies' },
  { id: 'fl_kr',     kind: 'movies', host: 'http://172.16.50.7',  path: '/DHAKA-FLIX-7/Foreign%20Language%20Movies/Korean%20Language/',   name: 'Korean Movies' },
  { id: 'fl_cn',     kind: 'movies', host: 'http://172.16.50.7',  path: '/DHAKA-FLIX-7/Foreign%20Language%20Movies/Chinese%20Language/',   name: 'Chinese Movies' },
  { id: 'fl_bd',     kind: 'movies', host: 'http://172.16.50.7',  path: '/DHAKA-FLIX-7/Foreign%20Language%20Movies/Bangla%20Dubbing%20Movies/', name: 'Bangla Dubbing Movies' },
  { id: 'fl_pk',     kind: 'movies', host: 'http://172.16.50.7',  path: '/DHAKA-FLIX-7/Foreign%20Language%20Movies/Pakistani%20Movie/',      name: 'Pakistani Movies' },

  // Series
  { id: 'tv',        kind: 'series', host: 'http://172.16.50.12', path: '/DHAKA-FLIX-12/TV-WEB-Series/',                     name: 'TV & Web Series' },
  { id: 'korean',    kind: 'series', host: 'http://172.16.50.14', path: '/DHAKA-FLIX-14/KOREAN%20TV%20%26%20WEB%20Series/',   name: 'Korean TV & Web Series' },
  { id: 'cartoon',   kind: 'series', host: 'http://172.16.50.10', path: '/DHAKA-FLIX-10/Anime%20%26%20Cartoon%20TV%20Series/', name: 'Cartoon TV Series' },
  { id: 'awards',    kind: 'series', host: 'http://172.16.50.10', path: '/DHAKA-FLIX-10/Awards%20%26%20TV%20Shows/',           name: 'Awards & TV Shows' },
  { id: 'wwe',       kind: 'series', host: 'http://172.16.50.10', path: '/DHAKA-FLIX-10/WWE%20%26%20AEW%20Wrestling/',          name: 'WWE & AEW Wrestling' },
  { id: 'documentary', kind: 'series', host: 'http://172.16.50.10', path: '/DHAKA-FLIX-10/Documentary/',                        name: 'Documentary' },

  // Anime
  { id: 'anime',     kind: 'anime',  host: 'http://172.16.50.10', path: '/DHAKA-FLIX-10/Anime%20%26%20Cartoon%20TV%20Series/', name: 'Anime TV Series' },
  { id: 'animemov',  kind: 'anime',  host: 'http://172.16.50.14', path: '/DHAKA-FLIX-14/Animation%20Movies/',                name: 'Animation Movies' },
  { id: 'anime1080', kind: 'anime',  host: 'http://172.16.50.14', path: '/DHAKA-FLIX-14/Animation%20Movies%20%281080p%29/',  name: 'Animation Movies 1080p' }
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

function _catUrl(c) { return c.host + c.path; }

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
  // Every parenthetical goes: the type marker ("(TV Cartoon 2019\u20132024)"),
  // the year, and the alternate title ("Money Heist (La Casa de Papel)"). The
  // app compares the WHOLE title after stripping only its own decorations, so
  // any leftover bracket would make the match fail.
  n = n.replace(/\([^)]*\)/g, ' ');
  // Platform tags the app's decoration rule does not know about.
  n = n.replace(/\s(?:AMZN|NF|HMAX|HBO|PRIME|DISNEY|APPLE|SONY|PARAMOUNT|PEACOCK)(?=\s*[\[(]|$)/gi, ' ');
  n = n.replace(/\s*[-_.]+\s*$/g, ' ').replace(/^[\s\-_.]+/, '');
  n = n.replace(/\s*[-\u2013]\s*[A-Za-z0-9]{2,12}$/, '');   // trailing "-GalaxyRG"/"-MsMod"
  n = n.replace(/\s{2,}/g, ' ');
  return _trim(n);
}

// A title as a catalogue would show it: "Title (Year)" and nothing else.
function _titleOnly(name) {
  var n = _pretty(name);
  n = n.replace(/^\d{1,3}\.\s*/, '');                     // "001. The Godfather"
  n = n.replace(/\s*\((?:TV\s*(?:Series|Cartoon|Mini Series|Documentary)\s*)?\d{4}[^)]*\)\s*$/i, '');
  n = n.replace(/\s*\([^)]*\d{4}[^)]*\).*$/, '');
  return _trim(n.replace(/\s{2,}/g, ' '));
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

function _isSeriesName(s) {
  return /\bTV\s*(Series|Cartoon|Mini Series|Serial|Show)\b/i.test(String(s || '')) ||
         /\(TV\b/i.test(String(s || ''));
}

function _episodeNumber(name) {
  var m = String(name).match(/[Ss](\d{1,2})[\s._-]?[Ee][Pp]?(\d{1,3})/);
  if (m) return parseInt(m[2], 10);
  m = String(name).match(/\b(\d{1,2})x(\d{2,3})\b/);
  if (m) return parseInt(m[2], 10);
  m = String(name).match(/(?:^|[\s._\-\[])Ep?(?:isode)?[\s._-]*(\d{1,4})\b/i);
  return m ? parseInt(m[1], 10) : null;
}

function _seasonNumber(name) {
  var m = String(name).match(/[Ss](\d{1,2})[\s._-]?[Ee][Pp]?\d{1,3}/) ||
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


// A title key: the name without year, quality tags or brackets. "Dune (2021)
// 1080p HMAX" and "Dune (2021) 720p [Dual Audio]" both reduce to "dune", so
// the same film can be found in another folder (often a 720p H.264 release of
// a 1080p HEVC one).
function _titleKey(name) {
  var n = _cleanName(name);
  n = n.replace(/\[[^\]]*\]/g, ' ');
  n = n.replace(/\([^)]*\)/g, ' ');
  for (var i = 0; i < 2; i++) n = n.replace(RE_TAG, ' ');
  n = n.replace(/[^A-Za-z0-9\u0980-\u09FF ]+/g, ' ');
  return _trim(n.replace(/\s+/g, ' ')).toLowerCase();
}

function _yearOfName(name) {
  var m = _cleanName(name).match(/\b((?:19|20)\d{2})\b/);
  return m ? parseInt(m[1], 10) : null;
}

// Can a phone actually decode this? HEVC 10-bit is the one that reliably
// fails on budget Android, and the app has no software-decode fallback for a
// remote stream (its fallback only covers local files).
function _isTenBitHevc(name) {
  var n = String(name).toLowerCase();
  return (/10[ _-]?bit/.test(n)) && (/x265|h[._]?265|hevc/.test(n));
}

function _isPlayable(name) {
  return !_isTenBitHevc(name);
}

// --- Item shapes ------------------------------------------------------------
function _item(name, url, cat) {
  return {
    id: url, title: _pretty(name), url: url, _path: _path(url).replace(/\/+$/, ''),
    type: KIND === 'anime' ? 'anime' : 'movie',
    sourceId: SOURCE_ID, cover: null, description: null,
    _year: _yearOf(name), _cat: cat ? cat.id : null
  };
}

// Internal fields never reach the app.
function _stripInternal(items) {
  for (var i = 0; i < items.length; i++) {
    delete items[i]._path;
    delete items[i]._year;
    delete items[i]._cat;
  }
  return items;
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

// --- Posters ----------------------------------------------------------------
// The server keeps a poster inside each title folder ("a_AL_.jpg" / "a_VL_.jpg",
// sometimes "a11.jpg"). One recursive search per folder finds them all at once,
// so cards can show real artwork without one request per title.
var _coverCache = {};

function _coversFor(dirUrl) {
  var key = String(dirUrl);
  if (_coverCache[key]) return Promise.resolve(_coverCache[key]);
  var href = _path(dirUrl).replace(/\/+$/, '') + '/';
  var promise = _h5ai(dirUrl, { action: 'get', search: { href: href, pattern: '\\.(jpe?g|png)$', ignorecase: true } })
    .then(function (j) {
      var hits = j.search || [], map = {};
      for (var i = 0; i < hits.length; i++) {
        var h = hits[i] && hits[i].href;
        if (!h || /\/$/.test(h)) continue;
        var parent = h.replace(/\/[^\/]*$/, '');
        var name = _segName(h).toLowerCase();
        // "a_AL_"/"a_VL_" are the real posters; anything else is a fallback.
        if (/^a_(al|vl)_/.test(name)) map[parent] = _origin(dirUrl) + h;
        else if (!map[parent]) map[parent] = _origin(dirUrl) + h;
      }
      _coverCache[key] = map;
      return map;
    })
    .catch(function () { return {}; });
  _coverCache[key] = promise;
  return promise;
}

function _applyCovers(items, covers) {
  for (var i = 0; i < items.length; i++) {
    var c = covers[items[i]._path];
    if (c) items[i].cover = c;
  }
  return items;
}

// --- TMDB enrichment --------------------------------------------------------
// A real poster, a plot and a rating make a file list look like a catalogue.
// Purely optional: every call is wrapped, and a failure leaves the local data
// exactly as it was.
function _tmdbSearch(title, isTv) {
  var q = encodeURIComponent(title);
  var kind = isTv ? 'tv' : 'movie';
  return fetch('https://api.themoviedb.org/3/search/' + kind + '?api_key=' + TMDB_KEY + '&query=' + q,
               { headers: { 'Accept': 'application/json' } })
    .then(function (r) { return r && r.ok ? JSON.parse(r.body) : null; })
    .then(function (j) {
      if (!j || !j.results || !j.results.length) return null;
      return j.results[0];
    })
    .catch(function () { return null; });
}

function _tmdbDetails(id, isTv) {
  var kind = isTv ? 'tv' : 'movie';
  return fetch('https://api.themoviedb.org/3/' + kind + '/' + id + '?api_key=' + TMDB_KEY + '&append_to_response=credits',
               { headers: { 'Accept': 'application/json' } })
    .then(function (r) { return r && r.ok ? JSON.parse(r.body) : null; })
    .catch(function () { return null; });
}

// TMDB happily returns a different film with a similar name ("40 Acres" is a
// 2025 movie, while the BDIX folder is the 2024 one). A match is only used
// when the title and the year agree.
function _normTitle(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9\u0980-\u09ff]+/g, ' ').trim();
}

function _tmdbMatches(localTitle, localYear, meta) {
  if (!meta) return false;
  if (localYear && meta.year) {
    // The year has to match exactly: "40 Acres" exists both as a 2024 BDIX
    // release and as a 2025 film, and the wrong one must not win.
    if (localYear !== parseInt(meta.year, 10)) return false;
  }
  var a = _normTitle(localTitle), b = _normTitle(meta.title);
  if (a && b && a !== b) {
    if (b.indexOf(a) !== 0 && a.indexOf(b) !== 0) return false;
  }
  return true;
}

function _tmdbFor(title, rawName) {
  var clean = _titleOnly(rawName || title);
  if (!clean || clean.length < 2) return Promise.resolve(null);
  var isTv = _isSeriesName(rawName || title);
  var localYear = _yearOf(rawName || title);
  return _tmdbSearch(clean, isTv).then(function (hit) {
    if (!hit || !hit.id) return null;
    return _tmdbDetails(hit.id, isTv).then(function (full) {
      var d = full || hit;
      var cast = [];
      if (d.credits && d.credits.cast) {
        for (var i = 0; i < d.credits.cast.length && i < 12; i++) {
          if (d.credits.cast[i] && d.credits.cast[i].name) cast.push(d.credits.cast[i].name);
        }
      }
      var year = null;
      var date = d.release_date || d.first_air_date || '';
      if (date) year = String(date).split('-')[0];
      return {
        title: d.title || d.name || clean,
        overview: d.overview || null,
        poster: d.poster_path ? 'https://image.tmdb.org/t/p/w500' + d.poster_path : null,
        backdrop: d.backdrop_path ? 'https://image.tmdb.org/t/p/w1280' + d.backdrop_path : null,
        year: year,
        rating: d.vote_average || null,
        cast: cast,
        id: d.id,
        isTv: isTv
      };
    });
  }).then(function (meta) {
    return _tmdbMatches(clean, localYear, meta) ? meta : null;
  }).catch(function () { return null; });
}


// The same film often exists in more than one folder: a 1080p HEVC release
// and a 720p H.264 one. When the folder we are playing has no file a phone
// can decode, look for the other release and offer it too, so the viewer can
// pick a playable source instead of a black screen.
function _alternativeFolders(folderUrl, folderName) {
  var key = _titleKey(folderName);
  if (!key || key.length < 3) return Promise.resolve([]);
  var year = _yearOfName(folderName);
  var pattern = _regexEscape(key);
  var scopes = _scopesForKind();
  return _mapLimit(scopes, 6, function (sc) { return _searchScopeTree(sc, pattern, false); }).then(function (lists) {
    var hits = [], seen = {};
    for (var i = 0; i < lists.length; i++) {
      var list = lists[i] || [];
      for (var k = 0; k < list.length; k++) {
        var h = list[k];
        if (h.url.replace(/\/$/, '') === String(folderUrl).replace(/\/$/, '')) continue;
        if (_titleKey(h.name) !== key) continue;
        var hy = _yearOfName(h.name);
        if (year && hy && hy !== year) continue;
        var norm = h.url.replace(/\/$/, '').toLowerCase();
        if (seen[norm]) continue;
        seen[norm] = 1;
        hits.push(h);
      }
    }
    return hits.slice(0, 4);
  });
}

function _videosOfFolder(url) {
  return _list(url).then(function (children) { return _videos(children); });
}

// The alternative-release lookup costs a couple of seconds (a search per
// server plus a folder listing), so it is cached per folder: every episode of
// a season lives in the same folder and pays the price only once.
var _altCache = {};

// The same film often exists in more than one folder: a 1080p HEVC release
// and a 720p H.264 one, for instance. When the folder we are playing has
// nothing a phone can decode (or nothing better than 720p), look for the
// other release and offer it too, so the viewer gets a stream that plays
// instead of a black screen.
//
// The lookup costs a couple of seconds (a search per server plus a folder
// listing), so it is cached per folder: every episode of a season lives in
// the same folder and pays the price only once.
function _alternativeFiles(folderUrl, folderName) {
  var key = String(folderUrl).replace(/\/$/, '');
  if (_altCache[key]) return Promise.resolve(_altCache[key]);
  var promise = _alternativeFolders(key, folderName).then(function (folders) {
    return _mapLimit(folders, 4, function (f) {
      return _videosOfFolder(f.url).then(function (fv) { return fv; }).catch(function () { return []; });
    }).then(function (groups) {
      var files = [];
      for (var i = 0; i < groups.length; i++) {
        var g = groups[i] || [];
        for (var k = 0; k < g.length; k++) files.push(g[k]);
      }
      return files;
    });
  }).catch(function () { return []; });
  _altCache[key] = promise;
  return promise;
}


// A promise that gives up after a while and answers with a fallback. The
// Auto Resolve probe has five seconds for match + episodes + sources, so the
// hunt for another release gets a slice of that instead of all of it.
function _withTimeout(promise, ms, fallback) {
  return new Promise(function (resolve) {
    var done = false;
    var timer = setTimeout(function () {
      if (done) return;
      done = true;
      resolve(fallback);
    }, ms);
    promise.then(function (v) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(v);
    }).catch(function () {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(fallback);
    });
  });
}

// --- Provider API -----------------------------------------------------------
function getInfo() {
  var names = { movies: 'DhakaFlix Movies', series: 'DhakaFlix Series', anime: 'DhakaFlix Anime' };
  return {
    name: names[KIND], lang: 'en', baseUrl: 'http://172.16.50.4/',
    logo: 'https://raw.githubusercontent.com/Mamun015/Mamun015-Zangetsu/main/logo.png',
    type: KIND === 'anime' ? 'anime' : 'movie', version: '1.4.2'
  };
}

// One row per category; row items are that category's year or letter groups, so
// the home screen costs one request per category and nothing is pre-indexed.
function getHome(opts) {
  var cats = _myCategories(), rows = [];
  return _mapLimit(cats, 3, function (c) {
    var load = KIND === 'series' ? _seriesTitles(c) : _homeItems(c);
    return load.then(function (items) {
      if (items.length) rows.push({ title: c.name, items: items });
    });
  }).then(function () { return rows; });
}

// Movie / anime home row: real film titles, not year buckets. One request for
// the category, one each for the two newest year folders — so the row shows
// "40 Acres (2024)" instead of "(2024)". Older years stay reachable by search
// and through the year cards on a bucket's own page.
function _homeItems(c) {
  return _list(_catUrl(c)).then(function (children) {
    var buckets = [], titles = [];
    for (var i = 0; i < children.length; i++) {
      var e = children[i];
      if (!e.folder) continue;
      if (_looksLikeBucket(e.name)) buckets.push(e); else titles.push(e);
    }
    var directTitles = titles.slice(0, 120).map(function (e) { return _item(e.name, e.url, c); });
    if (!buckets.length) {
      return _coversFor(_catUrl(c)).then(function (cov) { return _applyCovers(directTitles, cov); });
    }

    buckets.sort(function (a, b) {
      var ay = _bucketYear(a.name), by = _bucketYear(b.name);
      if (ay === by) return a.name < b.name ? 1 : -1;
      return (by == null ? -1 : by) - (ay == null ? -1 : ay);
    });

    var out = [];
    return _mapLimit(buckets.slice(0, 2), 2, function (b) {
      return _list(b.url).then(function (inner) {
        var items = [];
        for (var k = 0; k < inner.length; k++) {
          if (inner[k].folder) items.push(_item(inner[k].name, inner[k].url, c));
        }
        return _coversFor(b.url).then(function (cov) {
          _applyCovers(items, cov);
          out = out.concat(items);
        });
      });
    }).then(function () {
      return out.concat(directTitles).slice(0, 60);
    });
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
      var direct = titles.slice(0, 200).map(function (e) { return _item(e.name, e.url, c); });
      return _coversFor(_catUrl(c)).then(function (cov) { return _applyCovers(direct, cov); });
    }
    var out = [];
    return _mapLimit(groups, 4, function (g) {
      return _list(g.url).then(function (inner) {
        var items = [];
        for (var k = 0; k < inner.length; k++) {
          if (inner[k].folder) items.push(_item(inner[k].name, inner[k].url, c));
        }
        return _coversFor(g.url).then(function (cov) {
          _applyCovers(items, cov);
          out = out.concat(items);
        });
      });
    }).then(function () {
      var all = out.concat(titles.slice(0, 200).map(function (e) { return _item(e.name, e.url, c); }));
      return all.slice(0, 200);
    });
  });
}

// "TV Series \u2605 0 \u2014 9" / "(2024)" / "A \u2014 F" style bucket folders.
function _looksLikeBucket(name) {
  var n = _cleanName(name);
  if (/^\(\d{4}/.test(n)) return true;                     // "(2024)", "(1995) & Before"
  if (/^\d{4}$/.test(n)) return true;                        // "2001"
  if (/^\d{4}\s*&\s*(before|after)$/i.test(n)) return true;  // "2000 & Before"
  if (/^\d{4}\s*[-\u2013]\s*\d{4}$/.test(n)) return true;    // "1960-1994"
  if (n.indexOf('\u2014') >= 0) return true;                 // "TV Series \u2605 0 \u2014 9"
  if (/^\d{1,2}$/.test(n)) return true;
  return false;
}

// The year a bucket folder stands for, so the home row can start at the
// newest one. "(2024)", "(1995) & Before", "(2023) 1080p" all yield a year.
function _bucketYear(name) {
  var n = _cleanName(name);
  var m = n.match(/\((\d{4})/) || n.match(/^(\d{4})\s*&/i) || n.match(/^(\d{4})/);
  return m ? parseInt(m[1], 10) : null;
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
    return _stripInternal(out.slice(0, 60));
  });
}

// Server-side recursive regex search, one call per server share — the whole
// server is covered, including folders this provider does not know about yet.
function _regexEscape(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function _searchInScope(scope, pattern) {
  return _h5ai(scope.host + scope.href, { action: 'get', search: { href: scope.href, pattern: pattern, ignorecase: true } })
    .then(function (j) {
      var hits = j.search || [], out = [];
      for (var i = 0; i < hits.length; i++) {
        var h = hits[i];
        if (!h || !h.href) continue;
        // A title is a FOLDER (size null); a file is an episode or a movie
        // file, and a search result must be openable as a title.
        if (h.size !== null && h.size !== undefined) continue;
        if (!/\/$/.test(h.href)) continue;
        out.push({ name: _segName(h.href), url: scope.host + h.href });
      }
      return out;
    }).catch(function () { return []; });
}

function _scopesForKind() {
  return SEARCH_SCOPES[KIND] || SEARCH_SCOPES.movies;
}

// A category folder often holds letter or year buckets, and a bucket is a much
// smaller tree to scan than the whole category. When there are only a few
// buckets, the search runs inside each of them — the server answers in a
// fraction of the time, which is what keeps the Auto Resolve probe inside its
// five seconds. Many buckets (a year list of thirty) are left alone.
// The bucket list of a scope hardly ever changes, so it is remembered: every
// later search skips that listing request.
var _scopeBuckets = {};

// Always answers with a flat list of hits.
function _searchScopeTree(scope, pattern, split) {
  if (split === false) return _searchInScope(scope, pattern);
  var cached = _scopeBuckets[scope.href];
  if (cached) return _searchBuckets(cached, pattern);
  return _list(scope.host + scope.href).then(function (children) {
    var buckets = [];
    for (var i = 0; i < children.length; i++) {
      if (children[i].folder && _looksLikeBucket(children[i].name)) buckets.push(children[i]);
    }
    if (buckets.length < 2 || buckets.length > 12) {
      _scopeBuckets[scope.href] = null;
      return _searchInScope(scope, pattern);
    }
    for (var bi = 0; bi < buckets.length; bi++) buckets[bi].host = scope.host;
    _scopeBuckets[scope.href] = buckets;
    return _searchBuckets(buckets, pattern);
  }).catch(function () { return []; });
}

function _searchBuckets(buckets, pattern) {
  // Each bucket answers on its own: a slow one is dropped, the others still
  // deliver their titles. That keeps one busy folder from emptying the whole
  // search.
  return _mapLimit(buckets, 6, function (b) {
    return _withTimeout(_searchInScope({ host: b.host, href: b.href }, pattern), 2000, []);
  }).then(function (groups) {
    var out = [];
    for (var i = 0; i < groups.length; i++) {
      var g = groups[i] || [];
      for (var k = 0; k < g.length; k++) out = out.concat(g[k]);
    }
    return out;
  });
}

var _searchCache = {};

// Only the servers that actually hold this kind of content. Searching all
// four doubled the wait, and Auto Resolve gives a source five seconds for the
// whole match -> episodes -> sources chain.

var STOPWORDS = { the: 1, and: 1, of: 1, a: 1, an: 1, to: 1, in: 1, is: 1, it: 1, for: 1, on: 1, at: 1, be: 1, no: 1, vs: 1 };

// The catalogue title rarely matches the folder name word for word ("Kimetsu no
// Yaiba" vs "Demon Slayer (TV Cartoon 2018)"). A pattern that matches ANY of
// the significant words finds the folder, and it is also much cheaper for the
// server than a multi-word literal — "Demon Slayer" took 9s on the big share,
// "Demon|Slayer" took 1.3s.
// The words of a query that carry meaning: three letters or more, and not a
// filler word. A one-letter word like the "x" in "Hunter x Hunter" is noise
// as a search term and poison as a scoring term.
function _queryWords(q) {
  return String(q).split(/[^A-Za-z0-9\u0980-\u09FF]+/).filter(function (w) {
    return w.length >= 3 && !STOPWORDS[w.toLowerCase()];
  });
}

function _searchPattern(q) {
  var words = _queryWords(q);
  if (!words.length) return _regexEscape(q);
  var parts = [], seen = {};
  for (var i = 0; i < words.length && parts.length < 3; i++) {
    var w = words[i].toLowerCase();
    if (seen[w]) continue;
    seen[w] = 1;
    parts.push(_regexEscape(words[i]));
  }
  return parts.join('|');
}

// How close a result's title is to the query: every query word that shows up
// in the title counts, and a title that starts with the query counts more.
function _titleScore(title, queryWords, queryNorm) {
  var low = String(title).toLowerCase();
  var score = 0;
  for (var i = 0; i < queryWords.length; i++) {
    if (low.indexOf(queryWords[i]) >= 0) score += 10;
  }
  if (queryWords.length && low.indexOf(queryWords[0]) === 0) score += 6;
  // The whole query in the title ("Hunter x Hunter") beats a title that
  // merely mentions one of its words.
  if (queryNorm && low.indexOf(queryNorm) >= 0) score += 20;
  return score;
}

function search(query, page, opts) {
  var q = _trim(String(query || ''));
  if (!q) return Promise.resolve([]);
  var key = q.toLowerCase();
  if (_searchCache[key]) return Promise.resolve(_searchCache[key]);
  var pattern = _searchPattern(q);
  var qWords = _queryWords(q).map(function (w) { return w.toLowerCase(); });
  var qNorm = _normTitle(q);
  var scopes = _scopesForKind();
  // A scope that takes too long is dropped rather than held up: the folders
  // that answer in time are enough, and Auto Resolve has five seconds for the
  // whole chain.
  return _mapLimit(scopes, 6, function (sc) {
    return _withTimeout(_searchScopeTree(sc, pattern), 4500, []);
  }).then(function (lists) {
    var out = [], seen = {};
    for (var i = 0; i < lists.length; i++) {
      var list = lists[i] || [];
      for (var k = 0; k < list.length; k++) {
        var r = list[k];
        var norm = r.url.replace(/\/+$/, '').toLowerCase();
        if (seen[norm]) continue;
        seen[norm] = 1;
        var tkey = _pretty(r.name).toLowerCase();
        if (seen['t:' + tkey]) continue;
        seen['t:' + tkey] = 1;
        out.push(_item(r.name, r.url, null));
      }
    }
    // Closest title first: the app picks its match from this list, so the
    // folder that really is the requested title has to be at the top.
    out.sort(function (a, b) {
      var as = _titleScore(a.title, qWords, qNorm), bs = _titleScore(b.title, qWords, qNorm);
      if (as !== bs) return bs - as;
      return a.title < b.title ? -1 : a.title > b.title ? 1 : 0;
    });
    var capped = _stripInternal(out.slice(0, 80));
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
  return _detailFor(url, true);
}

function _detailFor(url, withMeta) {
  var u = String(url);
  return _list(u).then(function (children) {
    var rawTitle = _segName(u);
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
        return _detail(u, title, rawTitle, poster, _numbered(eps, title), withMeta);
      });
    }

    // A title folder that holds exactly one movie file: label the episode with
    // the folder title ("Dune (1984)"), not the release filename.
    if (vids.length === 1 && !folders.length) {
      return _detail(u, title, rawTitle, poster, [{
        id: vids[0].url, title: title, number: 1, url: vids[0].url
      }], withMeta);
    }

    // Group / year / letter folder: every child folder is a title card, plus
    // any video file sitting loose in the group (a real thing on this server).
    var cards = [];
    for (var f = 0; f < folders.length; f++) {
      cards.push({
        id: folders[f].url, title: _pretty(folders[f].name), number: cards.length + 1,
        url: folders[f].url, _n: null, _size: 0, _season: null
      });
    }
    for (var i = 0; i < vids.length; i++) cards.push(_epFromFile(vids[i], cards.length + 1));
    return _detail(u, title, rawTitle, poster, _numbered(cards, title), withMeta);
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
          t = t.replace(/^[\s\u00b7.\-]+/, '');
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

function _poster(entries) {
  for (var i = 0; i < entries.length; i++) {
    var e = entries[i];
    if (e.file && IMAGE_EXT.test(e.name)) {
      var n = e.name.toLowerCase();
      if (/^a_(al|vl)_/.test(n)) return e.url;
    }
  }
  for (var j = 0; j < entries.length; j++) {
    if (entries[j].file && IMAGE_EXT.test(entries[j].name)) return entries[j].url;
  }
  return null;
}

function _detail(url, title, rawTitle, poster, episodes, withMeta) {
  var year = _yearOf(rawTitle || title);
  var base = {
    id: url, title: title, url: url, description: null,
    cover: poster || null, banner: null, status: 'unknown', genres: [], studios: [],
    type: KIND === 'anime' ? 'anime' : 'movie', sourceId: SOURCE_ID,
    // MediaDetail.year is a String? in the app — a number here makes the whole
    // detail fail to parse, which shows up as an empty episode list.
    episodes: episodes, year: (year == null ? null : String(year)),
    cast: [], tmdbId: null, tmdbIsTv: false
  };
  if (!withMeta) return base;
  // TMDB fills in a poster, a plot, a rating and the tracking id. It is a
  // nice-to-have: a failure leaves the local detail untouched.
  return _tmdbFor(title, rawTitle).then(function (meta) {
    if (!meta) return base;
    if (meta.poster) base.cover = meta.poster;
    if (meta.backdrop) base.banner = meta.backdrop;
    if (meta.overview) base.description = meta.overview;
    if (meta.year) base.year = meta.year;
    if (meta.cast && meta.cast.length) base.cast = meta.cast;
    if (meta.id) { base.tmdbId = meta.id; base.tmdbIsTv = !!meta.isTv; }
    if (meta.title && base.episodes.length === 1 && base.episodes[0].title === base.title) {
      base.title = meta.title;
      base.episodes[0].title = meta.title;
    }
    return base;
  }).catch(function () { return base; });
}

// The episode LIST is what Auto Resolve probes, and it has five seconds for
// the whole chain — so this path skips the TMDB lookup entirely and answers
// with the local files only.
function getEpisodes(url, opts) {
  return _detailFor(url, false).then(function (d) { return d ? d.episodes : []; });
}

// A direct file plays as-is. A folder resolves to its biggest videos (a title
// card reached straight from a group listing). nginx serves these statically
// with Range support, so seeking works without any proxy.
function getVideoSources(episodeUrl, fast) {
  var u = String(episodeUrl);
  // The app asks for a fast answer while it resolves playback (the Auto
  // Resolve probe has five seconds for match + episodes + sources) and for the
  // full list when it downloads. The slow part is the hunt for another release
  // of the same title, so that is what a fast call skips.
  // A trailing slash is the usual folder marker, but the app is free to strip
  // it — the real test is whether the path names a media file at all. Missing
  // that made a card resolve to a folder URL and the player fail to open it.
  var looksLikeFile = VIDEO_EXT.test(_safeDecode(u).split('?')[0]);
  if (looksLikeFile) {
    var name = _segName(u);
    var parent = u.replace(/\/[^\/]*$/, '');
    var own = [{ name: name, url: u, size: 0 }];
    // A 10-bit HEVC file cannot be decoded by most phones, and a 720p file is
    // a waste when a 1080p H.264 release of the same title exists elsewhere
    // on the server. Look for it either way.
    var playable = _isPlayable(name);
    // A file the phone cannot decode (10-bit HEVC) is worth waiting for: the
    // other release of the same title is the difference between a picture and
    // a black screen.
    if (!playable) {
      var altPromise = _alternativeFiles(parent, _segName(parent));
      if (fast) {
        return _withTimeout(altPromise, 1800, []).then(function (alt) {
          return _sourcesFromFiles(alt.concat(own));
        });
      }
      return altPromise.then(function (alt) {
        return _sourcesFromFiles(alt.concat(own));
      });
    }
    // A fast answer skips the hunt for a BETTER release (a 720p file when a
    // 1080p one exists elsewhere) — that is a nicety, not a fix.
    if (fast) return Promise.resolve(_sourcesFromFiles(own));
    if (_quality(name) !== '1080p') {
      return _alternativeFiles(parent, _segName(parent)).then(function (alt) {
        return _sourcesFromFiles(alt.concat(own));
      });
    }
    return Promise.resolve(_sourcesFromFiles(own));
  }
  return _list(u).then(function (children) {
    var vids = _videos(children);
    if (vids.length) {
      var best1080 = false;
      for (var p = 0; p < vids.length; p++) {
        if (_isPlayable(vids[p].name) && _quality(vids[p].name) === '1080p') { best1080 = true; break; }
      }
      if (best1080) return _sourcesFromFiles(vids);
      var anyPlayable = false;
      for (var q = 0; q < vids.length; q++) if (_isPlayable(vids[q].name)) { anyPlayable = true; break; }
      // Nothing here plays: the other release of this title is worth the wait.
      if (!anyPlayable) {
        var altPromise2 = _alternativeFiles(u, _segName(u));
        if (fast) {
          return _withTimeout(altPromise2, 1800, []).then(function (alt) {
            return _sourcesFromFiles(alt.concat(vids));
          });
        }
        return altPromise2.then(function (alt) {
          return _sourcesFromFiles(alt.concat(vids));
        });
      }
      if (fast) return _sourcesFromFiles(vids);
      return _alternativeFiles(u, _segName(u)).then(function (alt) {
        return _sourcesFromFiles(alt.concat(vids));
      });
    }
    var subs = [];
    for (var i = 0; i < children.length; i++) if (children[i].folder) subs.push(children[i]);
    if (!subs.length) throw new Error('DhakaFlix: এই ফোল্ডারে কোনো ভিডিও ফাইল নেই');
    // Never fan out over a whole year/list folder: a card that is really a
    // bucket would fire hundreds of requests and look like "won't play".
    if (subs.length > 8) subs = subs.slice(0, 3);
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
      return _sourcesFromFiles(found);
    });
  });
}

// One list of files in, one list of sources out: playable files first, then
// the ones a budget phone cannot decode. A 10-bit HEVC file carries no
// quality hint, so the app (which sorts by quality) does not start on it —
// the label still names the resolution, so it stays one tap away in the
// Sources sheet for anyone whose device can play it.
function _sourcesFromFiles(files) {
  var playable = [], rest = [], seen = {};
  for (var i = 0; i < files.length; i++) {
    var u = String(files[i].url);
    if (seen[u]) continue;
    seen[u] = 1;
    if (_isPlayable(files[i].name)) playable.push(files[i]); else rest.push(files[i]);
  }
  playable.sort(function (a, b) { return _scoreFile(b.name) - _scoreFile(a.name); });
  rest.sort(function (a, b) { return _scoreFile(b.name) - _scoreFile(a.name); });
  var out = [];
  for (var p = 0; p < playable.length && out.length < 4; p++) {
    out.push(_source(playable[p].url, _quality(playable[p].name), _labelFor(playable[p].name)));
  }
  for (var r = 0; r < rest.length && out.length < 5; r++) {
    out.push(_source(rest[r].url, null, _labelFor(rest[r].name)));
  }
  return out;
}

// BDIX folders hold one release per quality, usually HEVC/x265 10-bit in an
// .mkv — a codec a lot of phones cannot decode, and the player then reports a
// link that "failed to open". So rank the files: an .mp4 with H.264 goes
// first, 10-bit HEVC last, and every alternative is offered as its own source
// so the viewer can switch in the Sources sheet.
function _scoreFile(name) {
  var n = String(name).toLowerCase();
  var s = 0;
  if (/\.mp4$/.test(n)) s += 100;
  else if (/\.mkv$/.test(n)) s += 60;
  else if (/\.(m4v|mov)$/.test(n)) s += 50;
  else s -= 20;
  if (/x264|h[._]?264|avc/.test(n)) s += 40;
  if (/x265|h[._]?265|hevc/.test(n)) s -= 10;
  if (/10[ _-]?bit/.test(n)) s -= 25;
  if (/8[ _-]?bit/.test(n)) s += 10;
  if (/\.(avi|wmv|flv|ts|m2ts)$/.test(n)) s -= 30;
  var q = _quality(name);
  if (q === '1080p') s += 8;
  else if (q === '720p') s += 5;
  else if (q === '1440p') s -= 30;
  // 1080p is the ceiling: a 4K file is heavy to decode and heavy on the
  // battery, and it is the first thing to break on a budget phone.
  else if (q === '2160p' || q === '4k') s -= 70;
  return s;
}

function _labelFor(name) {
  var n = String(name).toLowerCase();
  var bits = [];
  var q = _quality(name);
  if (q) bits.push(q);
  if (/\.mp4$/.test(n)) bits.push('MP4');
  else if (/\.mkv$/.test(n)) bits.push('MKV');
  if (/x264|h[._]?264|avc/.test(n)) bits.push('H.264');
  else if (/x265|h[._]?265|hevc/.test(n)) bits.push('HEVC');
  if (/10[ _-]?bit/.test(n)) bits.push('10-bit');
  else if (/8[ _-]?bit/.test(n)) bits.push('8-bit');
  return bits.join(' \u00b7 ');
}

function _source(url, quality, label) {
  var isMp4 = /\.(mp4|m4v|mov)$/i.test(url);
  return {
    url: url,
    quality: quality || null,
    label: label || null,
    container: isMp4 ? 'mp4' : 'unknown',
    // No custom headers: the server does not check them, and a header value
    // with a comma can be mangled on its way into the player.
    headers: null,
    kind: 'raw',
    audioLang: null,
    subtitles: []
  };
}
