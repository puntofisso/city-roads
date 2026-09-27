# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

city-roads renders every road in a city (from OpenStreetMap) in the browser using WebGL. It is a static Vue 3 + Vite single-page app with no backend. This checkout is a fork (`origin` = `puntofisso/city-roads`) of `anvaka/city-roads`, modified to render **building footprints as filled shapes** (white on black) instead of roads.

## Commands

```bash
npm install
npm run dev      # Vite dev server on http://localhost:8080
npm run build    # production build into ./dist (also emits stats.html bundle report via rollup-plugin-visualizer)
npm run lint     # eslint with --fix over .vue/.js/.cjs/.mjs
```

There is no test suite.

`deploy.sh` builds and force-pushes `dist/` to the **upstream** `anvaka/city-roads` `gh-pages` branch and pushes a release tag. Don't run it from this fork without changing the target remote.

## Architecture

### Data loading pipeline

Two paths lead to a `Grid` (the in-memory road network, `src/lib/Grid.js`):

1. **Search UI** (`src/components/FindPlace.vue`): the user's text goes to Nominatim (`lib/findBoundaryByName.js`), which returns candidate places. OSM relation/way ids are converted to Overpass area ids (`+3600000000` / `+2400000000`).
   - When caching is on (disable with `?cache=0`) and there is an `areaId`, it first fetches a prebuilt protobuf from `config.areaServer` (`<areaServer>/<areaId>.pbf`) and decodes it with `src/proto/place.js` (pbf-generated code, don't hand-edit) → `Grid.fromPBF`. In this fork `areaServer` is `../cache`: a git-ignored `cache/` folder at the repo root holding **buildings** files (e.g. `cache/3600175342.pbf` = Greater London). The upstream CloudFront cache contains roads only, so don't point back at it. Cache files use the format written by anvaka/index-large-cities (`version`, `id`, `name`, `date`, `nodes{id,lat,lon}`, `ways{nodes}`).
   - If that misses, or caching is off, it falls back to `Query.runFromOptions(new LoadOptions({...}))`.
2. **Console/scripting API** (`scene.load(wayFilter, options)` in `lib/createScene.js`): `LoadOptions.parse` normalizes a place name, `{areaId}`, `{bbox}` or `{layer}` (which inherits another layer's bounds and projector) into a query template.

The Overpass query limits in `LoadOptions` (`timeout` 180 s, `maxsize` 512 MB) are deliberate: overpass-api.de refuses larger reservations (e.g. the original 900 s / 1 GB) with a "Dispatcher_Client ... timeout" 504. overpass-api.de also answers 406 to requests without browser-like `User-Agent`/`Referer` headers, which matters when testing with curl.

`lib/Query.js` expands `{{geocodeArea:...}}`-style placeholders through Nominatim (one request per second, per Nominatim's usage policy), then `lib/postData.js` POSTs the Overpass QL. It works through a hard-coded list of Overpass mirrors in order and moves to the next one on failure. It sets `err.allServersFailed` when all of them fail and `err.cancelled` when the user cancels. `Grid.fromOSMResponse` builds the grid. Predefined way filters live as static fields on `Query` (`Road`, `RoadStrict`, `RoadBasic`, `Building`, `All`).

`lib/request.js` is the XHR wrapper used everywhere. It reports progress through a `Progress` token (`lib/Progress.js`), which is also how requests are cancelled.

### Rendering

- `lib/createScene.js` wraps the `w-gl` WebGL scene and returns the public, eventified `sceneAPI` (layers, colors, `load`, `saveToPNG`/`saveToSVG`).
- `lib/GridLayer.js` binds a `Grid` to the scene as two collections sharing one color and offset (`moveBy`): a `WireCollection` of outlines, and a `PolygonCollection` (`lib/PolygonCollection.js`, a custom `GLCollection`/`defineProgram` shader) of fills. Fills come from `Grid.forEachClosedWay`, triangulated with `earcut`. w-gl's SVG export only understands line collections, so SVG exports contain outlines only; PNG export includes fills. Large cities (London: 1.16M buildings) block the main thread for up to about a minute while triangulating and adding vertices one by one.
- `App.vue` owns the scene lifecycle. It sets `window.scene`, while `main.js` sets `window.Query` and `window.requireModule` (d3-require). These globals are a **public console API** documented in `API.md` and used by external scripts (anvaka/city-script), so keep their shape stable.
- There are two event channels. `lib/bus.js` is a global ngraph.events bus for UI sync (`scene-transform`, `line-color`, `background-color`); `sceneAPI` fires its own events for API consumers (`layer-added`, `layer-removed`, `color-change`, `dispose`).
- Export: `lib/saveFile.js` (PNG/SVG, printable canvas with label), `lib/svgExport.js`, `lib/protobufExport.js`, `lib/getZazzleLink.js` (mug printing).

### State

`lib/appState.js` persists state in the URL query string (via `query-state`): `areaId`, `osm_id`, `bbox`, `cache`, and so on. `FindPlace.vue` restores the selected place from it on load.

### Misc

- `src/config.js` holds the cache server URL and default colors (`createScene` reads the background from here).
- `src/components/vue3-color/` is a vendored Vue 3 port of a color picker.
- Styles are Stylus (`src/vars.styl`); the `@` alias resolves to `src/`.
