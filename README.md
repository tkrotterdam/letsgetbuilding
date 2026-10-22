# letsgetbuilding

## Valriche Estate 3D

An interactive 3D model of **Heritage Villas Valriche** and the wider Domaine de Bel Ombre on the south-west coast of Mauritius. It is built only from public open data, and the place listings have been fact-checked.

- **Explore**: orbit, pan and zoom over the estate. Click a building or a place label for details.
- **Landscape**: real Sentinel-2 satellite colour on the terrain, mowed fairways, greens with flags, about 31,600 trees placed on mapped tree cover (palms and filao on the coast), a lagoon with a moving surface, and clouds over the mountains.
- **Villas**: 129 Valriche plots drawn in detail. Plantation-style villas have hipped roofs, shutters and verandas. Contemporary villas have flat slab roofs, full-height glazing and timber screens. 100 plots have a pool terrace with a deck, pergola, loungers and an umbrella.
- **Your cart**: pick a race number (36 by default), paint and stickers (racing stripes, VALRICHE lettering, dodo, flames, chequered flag). The number shows on both sides, the bonnet, the roof and the plate.
- **Drop cart**: click anywhere on land (or "Drop cart here" on any villa or place) to start driving from that spot.
- **Drive**: the cart starts beside the Heritage Golf Club clubhouse, facing the nearest tee.
  - **Physics** (`js/vehicle.js`): an arcade vehicle model that runs at a fixed 120 Hz, so it feels the same at any frame rate. It has momentum and tyre grip, a handbrake drift on Space, and is a little slower on grass than on the paths. It rides a smoothed surface, so tree-canopy bumps in the elevation model don't rattle it, but real crests still give airtime.
  - **Collisions**: the cart scrapes along walls instead of stopping dead, and can't pass through houses or pool terraces.
  - **Gears**: Estate 24, Sport 60 or Turbo 120 km/h (keys 1, 2, 3). Shift boosts.
  - **Cameras**: chase cam (a damped spring that follows your line through drifts), cinematic or driver view. C cycles between them.
  - **Effects**: dust off the grass and skid marks on the paths.
  - **Controls**: gamepads work (stick, triggers, A drift, B boost, Y camera). Phones get a steering thumbstick and pedals.
  - `node tools/test_vehicle.js` checks acceleration, top speeds, braking distance, turning circle, no wall tunnelling at 120 km/h, wall scrapes, bump handling, airtime, drift, frame-rate independence, the tour driver and the cameras.
- **Weather & sun**: live conditions from the viewer's AccuWeather connector (cloud cover, cloud base, wind, gusts, visibility, rain) shape 3D clouds, rain, fog, the sea, swaying trees and the kites. The sun is placed with a solar-position formula for Bel Ombre at Mauritius time, with a time-of-day slider. At night, villa windows and pools light up and the cart's headlights come on. When live weather isn't available there are presets.
- **People**: golfers in golf outfits teeing off (with ball flight), putting and walking on mapped tees and greens, with their carts; kitesurfers riding across the wind in the lagoon at the Bel Ombre kite spot, with jumps.
- **Tour**: an AI driver takes the cart round a 7.5 km loop of the estate roads using the same physics, slowing for bends (cruise at 24, 40 or 60 km/h). A camera director cuts between chase, side-tracking, drone, roadside and front shots, like an edited cart video.
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
