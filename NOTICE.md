# NOTICE

## Third-party material

### Redowan-CloudStream (BDIX extensions)

The server list, the published folder paths and the category layout used in
`sources/dhakaflix.js` were cross-checked against the CloudStream BDIX
extensions in:

- redowan99/Redowan-CloudStream — `BdixDhakaFlix` (GPL-3.0)
  <https://github.com/redowan99/Redowan-CloudStream>

That project is the reference implementation for browsing these BDIX servers
and is licensed under the GNU General Public License v3.0 — the same license
this repository uses, so the material can be reused here under its terms.
No code was copied from it; the paths, the server addresses and the API
call shape were re-derived and re-implemented in JavaScript for Zangetsu's own
provider contract.

### TMDB

Title metadata (poster, backdrop, plot, rating, cast and the tracking id) is
fetched from The Movie Database (TMDB). The public API key used here is the
one the CloudStream extensions ship with; replace `TMDB_KEY` in
`sources/dhakaflix.js` with your own key from <https://www.themoviedb.org/settings/api>
if you prefer.

This product uses the TMDB API but is not endorsed or certified by TMDB.

### Zangetsu

The provider contract (`getInfo`, `getHome`, `popular`, `search`, `getDetail`,
`getEpisodes`, `getVideoSources`) and the manifest format follow the
Zangetsu app by Spyou — GPL-3.0:
<https://github.com/Spyou/Zangetsu>
