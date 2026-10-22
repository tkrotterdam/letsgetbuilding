"""Build a cloud-free Sentinel-2 true-colour composite and an ESA WorldCover crop.

Usage: python3 tools/fetch_imagery.py OUT_DIR
Writes OUT_DIR/sentinel_rgb.tif (EPSG:4326, uint8 RGB) and OUT_DIR/worldcover.tif (EPSG:4326, uint8 classes)
covering BBOX (lon/lat), plus OUT_DIR/sentinel_scenes.json listing the scenes used.
"""
import os, sys, json, urllib.request
import numpy as np, rasterio
from rasterio.warp import reproject, Resampling, transform_bounds
from rasterio.transform import from_bounds

OUT = sys.argv[1]
W, S, E, N = map(float, os.environ.get('BBOX', '57.355,-20.52,57.47,-20.425').split(','))
RES = 0.00009  # ~10 m
WIDTH, HEIGHT = round((E - W) / RES), round((N - S) / RES)
DST_T = from_bounds(W, S, E, N, WIDTH, HEIGHT)
BUCKET = 'https://sentinel-cogs.s3.us-west-2.amazonaws.com'
PREFIX = 'sentinel-s2-l2a-cogs/40/K/EC'
os.environ.setdefault('CURL_CA_BUNDLE', '/root/.ccr/ca-bundle.crt')
os.environ.setdefault('GDAL_DISABLE_READDIR_ON_OPEN', 'EMPTY_DIR')


def ls(prefix):
    xml = urllib.request.urlopen(f'{BUCKET}/?list-type=2&prefix={prefix}&delimiter=/').read().decode()
    import re
    return re.findall(r'<Prefix>([^<]+)</Prefix>', xml)[1:]


def warp(url, band_count, resampling):
    with rasterio.open(url) as src:
        dst = np.zeros((band_count, HEIGHT, WIDTH), dtype=src.dtypes[0])
        for b in range(band_count):
            reproject(rasterio.band(src, b + 1), dst[b], dst_transform=DST_T, dst_crs='EPSG:4326',
                      resampling=resampling)
    return dst


scenes = []
for year in ('2024', '2025', '2026'):
    for month in ls(f'{PREFIX}/{year}/'):
        for scene in ls(month):
            name = scene.rstrip('/').split('/')[-1]
            try:
                meta = json.load(urllib.request.urlopen(f'{BUCKET}/{scene}{name}.json'))
                cc = meta['properties'].get('eo:cloud_cover', 100)
            except Exception:
                continue
            scenes.append((cc, scene, name, meta['properties'].get('datetime')))
scenes.sort()
print('scenes found', len(scenes), 'best tile cloud', [round(s[0], 1) for s in scenes[:10]], flush=True)

# Local clear-sky check with the scene classification layer (SCL)
CLEAR = {4, 5, 6, 11}  # vegetation, bare, water, snow -> usable; 2 dark, 7 unclassified, 8-10 cloud, 3 shadow
cands = []
for cc, scene, name, dt in scenes[:25]:
    scl = warp(f'{BUCKET}/{scene}SCL.tif', 1, Resampling.nearest)[0]
    clear = np.isin(scl, list(CLEAR))
    frac = clear.mean()
    print(name, dt, 'tile cloud', round(cc, 1), 'local clear', round(frac, 3), flush=True)
    cands.append((frac, scene, name, dt, clear))
cands.sort(key=lambda c: -c[0])
use = cands[:6]
stack, masks = [], []
for frac, scene, name, dt, clear in use:
    rgb = warp(f'{BUCKET}/{scene}TCI.tif', 3, Resampling.bilinear).astype(float)
    rgb[:, ~clear] = np.nan
    rgb[:, rgb.sum(0) == 0] = np.nan
    stack.append(rgb)
comp = np.nanmedian(np.stack(stack), axis=0)
# fill any remaining holes from the clearest scene
best = stack[0]
comp = np.where(np.isnan(comp), np.nan_to_num(best), comp)
comp = np.nan_to_num(comp).clip(0, 255).astype(np.uint8)
prof = dict(driver='GTiff', width=WIDTH, height=HEIGHT, count=3, dtype='uint8', crs='EPSG:4326', transform=DST_T)
with rasterio.open(f'{OUT}/sentinel_rgb.tif', 'w', **prof) as d:
    d.write(comp)
json.dump([{'scene': u[2], 'datetime': u[3], 'local_clear': round(float(u[0]), 3)} for u in use],
          open(f'{OUT}/sentinel_scenes.json', 'w'), indent=1)
print('composite from', [u[2] for u in use], flush=True)

# ESA WorldCover 2021 v200, 3x3 degree tile S21E057
wc = 'https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/ESA_WorldCover_10m_2021_v200_S21E057_Map.tif'
cls = warp(wc, 1, Resampling.nearest)
prof.update(count=1)
with rasterio.open(f'{OUT}/worldcover.tif', 'w', **prof) as d:
    d.write(cls)
u, c = np.unique(cls, return_counts=True)
print('worldcover classes', dict(zip(u.tolist(), c.tolist())))
