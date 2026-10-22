# letsgetbuilding

## Valriche Estate 3D

An interactive 3D model of **Heritage Villas Valriche** and the wider Domaine de Bel Ombre on the south-west coast of Mauritius. It is built only from public open data, and the place listings have been fact-checked.

- **Explore**: orbit, pan and zoom over the estate. Click a building or a place label for details.
- **Drive cart**: drive a 4-seater golf cart (top speed 24 km/h) on the terrain. Use W A S D or the arrow keys, Space to brake, C to switch to the driver's view and R to get back on a road. Phones get on-screen pedals. The cart can't go through buildings or into the lagoon.
- **Cart tour**: autopilot around a 7.5 km loop of the estate roads at 1×, 3× or 8× speed, with "now passing" call-outs.
- **Filters**: buildings by area (Valriche, Château & clubhouse, resorts, villages), by footprint source (OSM, Microsoft, Google) and by storeys. Fade everything outside Valriche. Ground layers (golf, cane, water, reserves, roads). Terrain exaggeration. Places by category, fact-check status and search.

### Run it

```sh
python3 -m http.server 8000
# open http://localhost:8000/
```

three.js r128 loads from jsDelivr. Everything else is in this repo.

### Data

| Layer | Source | Licence |
|---|---|---|
| Building footprints (2,835) | Overture Maps `2026-10-21.0`: OpenStreetMap, Microsoft ML Buildings, Google Open Buildings | ODbL / CC BY 4.0 |
| Roads, golf course detail, land use, water | OpenStreetMap via Overture | ODbL, © OpenStreetMap contributors |
| Places (87 kept) | Overture Places (Meta, Microsoft) | CDLA-Permissive-2.0 |
| Terrain | Copernicus GLO-30 DSM | © DLR / Airbus, provided under COPERNICUS by the EU and ESA |

To rebuild `data/scene.json`:

```sh
pip install pyarrow s3fs shapely rasterio networkx numpy
python3 tools/fetch_overture.py RAW building segment place land_use water
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
- Roofs are modelled.
- Machine-learned footprints can split one villa into several shapes.
- The elevation model is a surface model, so it includes the tree canopy.
