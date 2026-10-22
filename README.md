# letsgetbuilding

## Valriche Estate 3D

An interactive 3D model of **Heritage Villas Valriche** and the wider Domaine de Bel Ombre on the south-west coast of Mauritius. It is built only from public open data, and the place listings have been fact-checked.

- **Explore**: orbit, pan and zoom over the estate. Click a building or a place label for details.
- **Landscape**: real Sentinel-2 satellite colour on the terrain, mowed fairways, greens with flags, about 31,600 trees placed on mapped tree cover (palms and filao on the coast), a lagoon with a moving surface, and clouds over the mountains.
- **Villas**: 129 Valriche plots drawn in detail. Plantation-style villas have hipped roofs, shutters and verandas. Contemporary villas have flat slab roofs, full-height glazing and timber screens. 100 plots have a pool terrace with a deck, pergola, loungers and an umbrella.
- **Your cart**: pick a race number (36 by default), paint and stickers (racing stripes, VALRICHE lettering, dodo, flames, chequered flag). The number shows on both sides, the bonnet, the roof and the plate.
- **Drop cart**: click anywhere on land (or "Drop cart here" on any villa or place) to start driving from that spot.
- **Drive**: Estate 24, Sport 60 or Turbo 120 km/h (keys 1, 2, 3). W A S D or the arrow keys steer, Shift boosts, Space brakes, C switches camera, R returns to the nearest road and P drops the cart somewhere new. The cart can get airborne over crests, can't drive through buildings or into the lagoon, and phones get on-screen pedals.
- **Tour**: autopilot around a 7.5 km loop of the estate roads at 1×, 3× or 8× speed.
- **Filters**: buildings by area (Valriche, Château & clubhouse, resorts, villages), by footprint source (OSM, Microsoft, Google) and by storeys. Fade everything outside Valriche. Landscape layers (satellite, golf detail, trees, pools, roads, clouds, land use, reserves). Terrain exaggeration. Places by category, fact-check status and search.

### Run it

```sh
python3 -m http.server 8000
# open http://localhost:8000/
```

three.js r128 loads from jsDelivr. Everything else is in this repo.

### Data

| Layer | Source | Licence |
|---|---|---|
| Building footprints (5,669) | Overture Maps `2026-10-21.0`: OpenStreetMap, Microsoft ML Buildings, Google Open Buildings | ODbL / CC BY 4.0 |
| Roads, golf course detail, land use, water | OpenStreetMap via Overture | ODbL, © OpenStreetMap contributors |
| Places (130 kept) | Overture Places (Meta, Microsoft) | CDLA-Permissive-2.0 |
| Terrain | Copernicus GLO-30 DSM | © DLR / Airbus, provided under COPERNICUS by the EU and ESA |
| Satellite colour | Copernicus Sentinel-2 L2A, median of 6 clear passes 2025–26 | Contains modified Copernicus Sentinel data |
| Tree positions | ESA WorldCover 2021 (10 m) + OSM single trees | CC BY 4.0 |

To rebuild `data/scene.json`:

```sh
pip install pyarrow s3fs shapely rasterio networkx numpy
BBOX=57.35,-20.53,57.48,-20.42 python3 tools/fetch_overture.py RAW building segment place land_use water land
python3 tools/fetch_imagery.py RAW        # Sentinel-2 composite + WorldCover
curl -o RAW/dem.tif https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_S21_00_E057_00_DEM/Copernicus_DSM_COG_10_S21_00_E057_00_DEM.tif
python3 tools/build_scene.py RAW data/scene.json
```

### Fact-check

Each place pin in `tools/build_scene.py` (`POI_CHECK`) has a status of verified, unverified or flagged, with a note. Findings from the check:

- **Flagged**: "Le Touessrok Golf Course" (that course is on the east coast). "Mövenpick Resort & Spa" (it has been the Outrigger since 2013). The "Frédérica Nature Reserve" and "La Réserve Golf Links" pins (both misplaced). "Lux* Me" and "Indian ocean" (not real places here).
- **Verified**: 288 villas planned and about 170 completed by 2022. Le Château course: 18 holes, par 72, Peter Matkovich, 2004. La Réserve Golf Links opened December 2023. Charles Telfair bought the estate in 1815 or 1816.
- **Disputed, left out**: the Château's construction date.

### Limits

- The estate boundary is not open data. The orange outline is traced around the villa clusters.
- Heights are estimated: villas have 1–2 storeys, per sales listings.
- Villa facades, roof styles and pools are modelled from published descriptions: over 30 plantation-style designs, a contemporary collection by Greg Scott + Partners, and a private pool for every villa. Pool positions aren't published, so each pool sits on the downhill side of its house.
- Sentinel-2 is 10 m per pixel, so it shows the course, lagoon and reef but not individual houses.
- Tree species are illustrative; positions follow mapped tree cover.
- Machine-learned footprints can split one villa into several shapes.
- The elevation model is a surface model, so it includes the tree canopy.
