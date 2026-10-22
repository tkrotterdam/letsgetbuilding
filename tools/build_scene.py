"""Build data/scene.json for the Bel Ombre / Villas Valriche 3D viewer.

Inputs (in RAW_DIR, produced by fetch_overture.py, fetch_imagery.py + a Copernicus DEM download):
  building.geojson segment.geojson place.geojson land_use.geojson water.geojson land.geojson
  dem.tif  (Copernicus GLO-30 tile Copernicus_DSM_COG_10_S21_00_E057_00_DEM.tif)
  sentinel_rgb.tif sentinel_scenes.json worldcover.tif

Usage: python3 tools/build_scene.py RAW_DIR data/scene.json
Also writes data/satellite.jpg next to the JSON.
"""
import json, math, sys, hashlib, os, random
import numpy as np, rasterio, networkx as nx
from rasterio.windows import from_bounds
from rasterio.warp import reproject, Resampling
from rasterio.transform import from_bounds as tf_from_bounds
from shapely.geometry import shape, Polygon, Point, box, mapping
from shapely.ops import transform, unary_union
from shapely.strtree import STRtree
from shapely import affinity
from PIL import Image, ImageEnhance

RAW, OUT = sys.argv[1], sys.argv[2]

# Scene window (lon/lat) and local origin, roughly the Château de Bel Ombre / golf club.
W, S, E, N = 57.355, -20.52, 57.47, -20.425
LON0, LAT0 = 57.4125, -20.4985
KX = 111320 * math.cos(math.radians(LAT0))  # metres per degree lon
KY = 110574                                 # metres per degree lat
CLIP = box(W, S, E, N)
FOCUS = box(57.378, -20.515, 57.448, -20.472)  # the estate, beach hotels and nearby villages


def to_xz(lon, lat):
    # three.js convention: +x east, -z north
    return (round((lon - LON0) * KX, 1), round(-(lat - LAT0) * KY, 1))


def proj(g):
    return transform(lambda x, y, z=None: ((x - LON0) * KX, -(y - LAT0) * KY), g)


def flat(coords):
    out = []
    for c in coords:
        out += [round(c[0], 1), round(c[1], 1)]
    return out


def load(name):
    return json.load(open(f'{RAW}/{name}.geojson'))['features']


def pname(p):
    return ((p.get('names') or {}).get('primary')) or None


# Approximate outline of the Heritage Villas Valriche residential precinct, traced around the
# villa clusters that wrap the Heritage (Le Château) golf course north of the coastal road.
# The estate boundary itself is not published as open data, so this is an inference.
VALRICHE_ZONE = Polygon([
    (57.4030, -20.4965), (57.4060, -20.4932), (57.4120, -20.4902), (57.4185, -20.4902),
    (57.4222, -20.4950), (57.4222, -20.5036), (57.4150, -20.5033), (57.4095, -20.5030),
    (57.4030, -20.5022)])

# ---------------------------------------------------------------- fact-checked POIs
# status: verified | unverified | flagged.  Notes summarise what independent sources say.
V, U, F = 'verified', 'unverified', 'flagged'
POI_CHECK = {
    'Heritage Villas Valriche': (V, 'estate', 'Gated villa estate in Domaine de Bel Ombre; 288 villas planned, ~170 completed by 2022 (Pam Golding).'),
    'Heritage The Villas': (V, 'estate', 'Rental arm of the Valriche villas, listed by OTAs as a Bel Ombre property.'),
    'Le Château de Bel Ombre': (V, 'heritage', 'Restored plantation house, now a restaurant. Construction date disputed in sources (1760s vs 19th c.) so not shown.'),
    'Heritage Golf Club': (V, 'golf', '18-hole par-72 Le Château course by Peter Matkovich (opened 2004) plus a 9-hole par-3.'),
    'Golf du Chateau Domaine de Bel Ombre': (V, 'golf', 'Same club as Heritage Golf Club (Le Château course).'),
    'La Réserve Golf Links': (F, 'golf', 'Course is real (Oosthuizen & Matkovich, opened Dec 2023) but this pin sits inside the Château course. OSM maps the links further east (green outline).'),
    'Heritage Le Telfair Golf and Wellness Resort': (V, 'hotel', 'Heritage resort on the estate, named after Charles Telfair, who bought Bel Ombre in 1815/16.'),
    'Heritage Awali Golf & Spa Resort': (V, 'hotel', 'Heritage all-inclusive resort on Bel Ombre beach.'),
    'C Beach Club': (V, 'food', 'Heritage beach club; access included for Valriche residents per sales listings.'),
    'Outrigger Mauritius Beach Resort': (V, 'hotel', 'Formerly Voile d\'Or, then Mövenpick (2006); Outrigger since 2013.'),
    'Mövenpick Resort & Spa': (F, 'hotel', 'Outdated: the Mövenpick became the Outrigger Mauritius Beach Resort in 2013, and this pin sits on Heritage Awali.'),
    'SO Sofitel Mauritius': (V, 'hotel', 'SO/ Sofitel Mauritius, Bel Ombre.'),
    'Tamassa': (V, 'hotel', 'Tamassa Bel Ombre, all-inclusive resort.'),
    'Le Touessrok Golf Course': (F, 'golf', 'Wrong place: Le Touessrok is on the east coast (Trou d\'Eau Douce), not in Bel Ombre.'),
    'Frédérica Nature Reserve': (F, 'nature', 'Real reserve (~1,300 ha, inland), but this pin sits on a hotel beach.'),
    'Bel Ombre Nature Reserve': (V, 'nature', 'Heritage Nature Reserve / Frédérica area, around 1,300 ha of hills and forest.'),
    'Heritage Nature Reserve, Mauritius': (V, 'nature', 'Entrance to the estate\'s nature reserve.'),
    'Plage De Bel Ombre': (V, 'nature', 'Public beach.'),
    'Bel Ombre Beach': (V, 'nature', 'Public beach.'),
    'Kaz\'alala Hosted B&B': (V, 'hotel', 'Listed by OTAs as a Bel Ombre property.'),
    'Lux* Me': (F, 'other', 'No LUX* property is in Bel Ombre; probably a spa brand mis-geocoded at Heritage Awali.'),
    'Hôtel Héritage - Île Maurice': (U, 'hotel', 'Duplicate of Heritage Awali.'),
    'Hotel Heritage Awali ***** Beach': (U, 'hotel', 'Duplicate of Heritage Awali.'),
    'Bel Ombre Ile Maurice': (U, 'other', 'Generic name pin.'),
    'Indian ocean': (F, 'other', 'Not a place: a mislabelled pin on Heritage Awali.'),
}

CAT_WORDS = [('hotel', ['resort', 'hotel', 'villas', 'b&b', 'sofitel', 'tamassa', 'outrigger']),
             ('golf', ['golf']),
             ('food', ['restaurant', 'bar', 'pub', 'food', 'snack', 'dining', 'café', 'cafe', 'wine', 'kuzini', 'zafarani', 'savana', 'gin', 'mercado', 'annabella', 'palmier', 'cavendish', 'flamboyant', 'plage', 'batelage', 'roche cari', 'coco shack', 'delices', 'sunset']),
             ('nature', ['beach', 'plage', 'reserve', 'viewpoint', 'kite', 'park', 'spot', 'horse']),
             ('wellness', ['spa', 'fitness', 'beauty'])]


def guess_cat(n):
    l = n.lower()
    for c, ws in CAT_WORDS:
        if any(w in l for w in ws):
            return c
    return 'other'


# ---------------------------------------------------------------- DEM
with rasterio.open(f'{RAW}/dem.tif') as r:
    win = from_bounds(W, S, E, N, r.transform).round_offsets().round_lengths()
    dem = r.read(1, window=win).astype(float)
    t = r.window_transform(win)
h, w = dem.shape
lon_a, lat_a = t.c + t.a / 2, t.f + t.e / 2           # centre of first pixel
x0, z0 = to_xz(lon_a, lat_a)
dem_out = {'w': w, 'h': h, 'x0': x0, 'z0': z0, 'dx': round(t.a * KX, 3), 'dz': round(-t.e * KY, 3),
           'data': [int(round(max(v, -5) * 10)) for v in dem.ravel()]}  # decimetres


# ---------------------------------------------------------------- POIs
pois, hotel_pts = [], []
for f in load('place'):
    p = f['properties']; n = pname(p)
    lon, lat = f['geometry']['coordinates']
    if not n or not CLIP.contains(Point(lon, lat)):
        continue
    status, cat, note = POI_CHECK.get(n, (U, guess_cat(n), 'Listed in Overture Places (Meta/Microsoft); not independently verified.'))
    conf = round(p.get('confidence') or 0, 2)
    if status == U and conf < 0.5:
        continue  # very low confidence and unchecked: drop
    if status == U and not FOCUS.contains(Point(lon, lat)) and conf < 0.8:
        continue  # outside the estate area keep only well-attested listings
    x, z = to_xz(lon, lat)
    srcs = sorted({s['dataset'] for s in p.get('sources') or [] if s['dataset'] != 'Overture'})
    pois.append({'n': n, 'c': cat, 'x': x, 'z': z, 'conf': conf, 'v': status, 'note': note, 'src': srcs})
    if cat == 'hotel' and status != F:
        hotel_pts.append(proj(Point(lon, lat)))

# ---------------------------------------------------------------- buildings
vz = proj(VALRICHE_ZONE)
SRC = {'OpenStreetMap': 'osm', 'Microsoft ML Buildings': 'msft', 'Google Open Buildings': 'google'}
buildings, bpolys = [], []
for f in load('building'):
    p = f['properties']
    g = shape(f['geometry'])
    if not g.intersects(CLIP):
        continue
    g = proj(g).simplify(0.4)
    poly = max(getattr(g, 'geoms', [g]), key=lambda q: q.area)
    if poly.area < 12:
        continue
    src = SRC.get(p['sources'][0]['dataset'], 'other')
    n, cls = pname(p), p.get('class')
    c = poly.centroid
    if vz.contains(c) and cls != 'hotel' and not (n and ('Chateau' in n or 'Golf' in n)):
        cat = 'valriche'
    elif cls == 'hotel' or (c.y > 560 and any(c.distance(hp) < 230 for hp in hotel_pts)):
        cat = 'resort'
    else:
        cat = 'village'
    if n and ('Chateau' in n or 'Golf Club' in n):
        cat = 'landmark'
    # Heights: Overture has no measured heights here. Use num_floors when present, otherwise an
    # estimate: villas 1-2 storeys (per estate listings), deterministic per building id.
    floors = p.get('num_floors')
    est = floors is None
    if est:
        hsh = int(hashlib.md5(p['id'].encode()).hexdigest()[:6], 16)
        if cat == 'valriche':
            floors = 1 + (hsh % 10 < 4)
        elif cat == 'resort':
            floors = 1 + (hsh % 10 < 6) + (poly.area > 600)
        else:
            floors = 1 + (hsh % 10 < 3)
    b = {'p': flat(list(poly.exterior.coords)[:-1]), 's': src, 'c': cat, 'f': int(floors), 'a': int(poly.area)}
    # Near-rectangular footprints get a hipped roof built on their oriented bounding box.
    rect = poly.minimum_rotated_rectangle
    if cat != 'resort' and poly.area < 900 and poly.area / rect.area > 0.82:
        b['r'] = flat(list(rect.exterior.coords)[:-1])
    if not est:
        b['m'] = 1
    if n:
        b['n'] = n
    if cls:
        b['k'] = cls
    buildings.append(b)
    bpolys.append(poly)

# ---------------------------------------------------------------- roads + graph
roads, road_lines, G = [], [], nx.Graph()


def key(pt):
    return (round(pt[0], 0), round(pt[1], 0))


for f in load('segment'):
    p = f['properties']
    g = shape(f['geometry']).intersection(CLIP)
    if g.is_empty:
        continue
    for line in getattr(g, 'geoms', [g]):
        if line.geom_type != 'LineString':
            continue
        line = proj(line).simplify(0.8)
        cs = list(line.coords)
        roads.append({'c': p.get('class') or 'unknown', 'n': pname(p), 'p': flat(cs),
                      'v': 1 if vz.intersects(line) else 0})
        road_lines.append((p.get('class') or 'unknown', line))
        if p.get('class') in ('footway', 'steps', 'path'):
            continue
        for a, b in zip(cs, cs[1:]):
            G.add_edge(key(a), key(b), weight=math.dist(a, b))

# Golf-cart tour: shortest paths through hand-picked waypoints on the estate roads.
WAY = [(57.4079, -20.5030), (57.4065, -20.4975), (57.4100, -20.4950), (57.4140, -20.4925),
       (57.4175, -20.4935), (57.4160, -20.4985), (57.4205, -20.4995), (57.4195, -20.5025),
       (57.4128, -20.5025), (57.4079, -20.5030)]
nodes = np.array(list(G.nodes))
comp = max(nx.connected_components(G), key=len)
nodes = np.array([n for n in G.nodes if n in comp])


def snap(lon, lat):
    x, z = to_xz(lon, lat)
    i = np.argmin(((nodes - (x, z)) ** 2).sum(1))
    return tuple(nodes[i])


tour = []
wp = [snap(*q) for q in WAY]
for a, b in zip(wp, wp[1:]):
    path = nx.shortest_path(G, a, b, weight='weight')
    tour += [list(map(float, q)) for q in (path if not tour else path[1:])]
tour_len = sum(math.dist(a, b) for a, b in zip(tour, tour[1:]))


# ---------------------------------------------------------------- land use + water
def polys(g, tol):
    g = proj(g.intersection(CLIP)).simplify(tol)
    out = []
    for q in getattr(g, 'geoms', [g]):
        if q.geom_type == 'Polygon' and q.area > 20:
            out.append([flat(list(q.exterior.coords))] + [flat(list(i.coords)) for i in q.interiors])
    return out


landuse = []
for f in load('land_use'):
    p = f['properties']
    for rings in polys(shape(f['geometry']), 1.0):
        landuse.append({'t': p.get('class'), 'g': p.get('subtype'), 'n': pname(p), 'r': rings})

water = []
for f in load('water'):
    p = f['properties']
    g = shape(f['geometry'])
    if g.geom_type in ('LineString', 'MultiLineString'):
        g2 = proj(g.intersection(CLIP)).simplify(1.5)
        for l in getattr(g2, 'geoms', [g2]):
            if l.geom_type == 'LineString' and l.length > 5:
                water.append({'t': p.get('class'), 'n': pname(p), 'l': flat(list(l.coords))})
    else:
        for rings in polys(g, 1.5):
            water.append({'t': p.get('class'), 'n': pname(p), 'r': rings})

LAND_KEEP = {'wood', 'beach', 'reef', 'scrub', 'wetland', 'bare_rock', 'cliff'}
land, osm_trees = [], []
for f in load('land'):
    p = f['properties']
    cls = p.get('class')
    g = shape(f['geometry'])
    if cls == 'tree' and g.geom_type == 'Point':
        if CLIP.contains(g):
            osm_trees.append(proj(g))
        continue
    if cls not in LAND_KEEP:
        continue
    if g.geom_type in ('LineString', 'MultiLineString'):
        g2 = proj(g.intersection(CLIP)).simplify(1.5)
        for l in getattr(g2, 'geoms', [g2]):
            if l.geom_type == 'LineString' and l.length > 5:
                land.append({'t': cls, 'l': flat(list(l.coords))})
    else:
        for rings in polys(g, 1.5):
            land.append({'t': cls, 'r': rings})

# ---------------------------------------------------------------- satellite texture
# Sentinel-2 composite resampled onto the DEM vertex extent, so UV 0..1 spans the terrain mesh.
XW, ZH = (w - 1) * t.a, (h - 1) * -t.e                   # extent in degrees
lon_b, lat_b = lon_a + XW, lat_a - ZH
SAT_W = 2048
SAT_H = round(SAT_W * (ZH * KY) / (XW * KX))
sat_t = tf_from_bounds(lon_a, lat_b, lon_b, lat_a, SAT_W, SAT_H)
with rasterio.open(f'{RAW}/sentinel_rgb.tif') as src:
    sat = np.zeros((3, SAT_H, SAT_W), dtype=np.uint8)
    for bnd in range(3):
        reproject(rasterio.band(src, bnd + 1), sat[bnd], dst_transform=sat_t, dst_crs='EPSG:4326',
                  resampling=Resampling.cubic)
img = Image.fromarray(np.moveaxis(sat, 0, -1))
# Sentinel TCI is deliberately flat; lift it slightly towards how the island reads by eye.
img = ImageEnhance.Brightness(img).enhance(1.12)
img = ImageEnhance.Contrast(img).enhance(1.12)
img = ImageEnhance.Color(img).enhance(1.18)
sat_path = os.path.join(os.path.dirname(OUT), 'satellite.jpg')
img.save(sat_path, quality=86, optimize=True, progressive=True)
sat_scenes = json.load(open(f'{RAW}/sentinel_scenes.json'))

# ---------------------------------------------------------------- exclusion raster (local metres)
from rasterio.features import rasterize
from affine import Affine
EX_RES = 2.5
ex_x0, ex_z0 = x0 - 20, z0 - 20
EXW, EXH = int((w - 1) * dem_out['dx'] / EX_RES) + 16, int((h - 1) * dem_out['dz'] / EX_RES) + 16
ex_aff = Affine(EX_RES, 0, ex_x0, 0, EX_RES, ex_z0)    # row index grows with z (south)
ROAD_W = {'primary': 8, 'secondary': 7, 'tertiary': 6, 'residential': 5, 'living_street': 4.5,
          'unclassified': 5, 'service': 3.6, 'unknown': 2.4, 'track': 3, 'footway': 1.4, 'path': 1.2, 'steps': 1.4}
shapes = [(pg.buffer(2.0), 1) for pg in bpolys]
shapes += [(ln.buffer(ROAD_W.get(c, 3) / 2 + 1.2), 1) for c, ln in road_lines]
PLAY = {'fairway', 'green', 'tee', 'bunker', 'water_hazard', 'lateral_water_hazard', 'pitch'}
for f in load('land_use'):
    if f['properties'].get('class') in PLAY:
        shapes.append((proj(shape(f['geometry'])).buffer(1.5), 1))
for f in load('water'):
    g = shape(f['geometry'])
    if g.geom_type not in ('LineString', 'MultiLineString') and f['properties'].get('class') != 'ocean':
        shapes.append((proj(g).buffer(2), 1))
excl = rasterize(shapes, out_shape=(EXH, EXW), transform=ex_aff, fill=0, dtype='uint8')


def excluded(x, z):
    c, r = int((x - ex_x0) / EX_RES), int((z - ex_z0) / EX_RES)
    return not (0 <= r < EXH and 0 <= c < EXW) or excl[r, c]


demr = dem  # raw metres


def dem_at(x, z):
    fx = (x - x0) / dem_out['dx']; fz = (z - z0) / dem_out['dz']
    j = min(max(int(fx), 0), w - 2); i = min(max(int(fz), 0), h - 2)
    u, v = fx - j, fz - i
    return (demr[i, j] * (1 - u) + demr[i, j + 1] * u) * (1 - v) + (demr[i + 1, j] * (1 - u) + demr[i + 1, j + 1] * u) * v


# ---------------------------------------------------------------- villa plots and pools
# Footprints within 5 m of each other are treated as one plot (house + pavilions). Listings state each
# villa has a private pool with a timber-decked terrace; their positions are not published, so the
# pool goes on the downhill side of the main house where it clears buildings and roads (illustrative).
vidx = [i for i, b in enumerate(buildings) if b['c'] == 'valriche']
vtree = STRtree([bpolys[i] for i in vidx])
plots_geom = unary_union([bpolys[i].buffer(5) for i in vidx])
plots_geom = list(getattr(plots_geom, 'geoms', [plots_geom]))
road_union = unary_union([ln.buffer(ROAD_W.get(c, 3) / 2 + 1.5) for c, ln in road_lines if vz.buffer(200).intersects(ln)])
all_btree = STRtree(bpolys)
villas = []
for pg in plots_geom:
    members = [vidx[k] for k in vtree.query(pg) if bpolys[vidx[k]].intersects(pg)]
    if not members:
        continue
    main = max(members, key=lambda i: bpolys[i].area)
    mp = bpolys[main]
    style = 'plantation' if 'r' in buildings[main] else 'contemporary'
    v = {'m': main, 'b': sorted(members), 'st': style}
    if mp.area >= 70:
        cx, cz = mp.centroid.x, mp.centroid.y
        gx = (dem_at(cx + 15, cz) - dem_at(cx - 15, cz)) / 30
        gz = (dem_at(cx, cz + 15) - dem_at(cx, cz - 15)) / 30
        down = np.array([-gx, -gz])
        if np.hypot(*down) < 0.01:
            down = np.array([0.0, 1.0])                    # flat: face the sea (south)
        down = down / np.hypot(*down)
        rc = list(mp.minimum_rotated_rectangle.exterior.coords)[:4]
        cands = []
        for k in range(4):
            a, b2 = np.array(rc[k]), np.array(rc[(k + 1) % 4])
            e = b2 - a; L = np.hypot(*e); e = e / L
            n = np.array([e[1], -e[0]])
            mid = (a + b2) / 2
            if np.dot(n, mid - np.array([cx, cz])) < 0:
                n = -n
            cands.append((float(np.dot(n, down)), a, b2, e, n, mid, L))
        cands.sort(key=lambda c: -c[0])
        for score, a, b2, e, n, mid, L in cands:
            pl = float(np.clip(0.55 * L, 6, 12)); pw = 4.5 if pl > 9 else 3.8
            c = mid + n * (3.0 + pw / 2)
            ang = math.atan2(e[1], e[0])
            pool = affinity.rotate(box(-pl / 2, -pw / 2, pl / 2, pw / 2), ang, use_radians=True)
            pool = affinity.translate(pool, c[0], c[1])
            zone = pool.buffer(1.4)
            if any(bpolys[j].intersects(zone) for j in all_btree.query(zone)):
                continue
            if road_union.intersects(zone) or not vz.contains(pool):
                continue
            v['pool'] = [round(c[0], 2), round(c[1], 2), round(ang, 4), round(pl, 1), pw]
            v['n'] = [round(float(n[0]), 3), round(float(n[1]), 3)]
            break
    villas.append(v)

# ---------------------------------------------------------------- trees (ESA WorldCover 2021, 10 m)
# Positions follow mapped tree cover; species mix is illustrative: coconut palms and filao (casuarina)
# along the coast, palms in the estate's landscaping, broadleaf forest inland, a few flamboyants by roads.
wc = rasterio.open(f'{RAW}/worldcover.tif')
wca = wc.read(1)
wc_inv = ~wc.transform


def wc_at(x, z):
    lon, lat = LON0 + x / KX, LAT0 - z / KY
    c, r = wc_inv * (lon, lat)
    r, c = int(r), int(c)
    if 0 <= r < wca.shape[0] and 0 <= c < wca.shape[1]:
        return int(wca[r, c])
    return 0


ocean = unary_union([proj(shape(f['geometry'])) for f in load('water') if f['properties'].get('class') == 'ocean'])
coast_band = ocean.buffer(160).difference(ocean) if not ocean.is_empty else Polygon()
coast_r = rasterize([(coast_band, 1)], out_shape=(EXH, EXW), transform=ex_aff, fill=0, dtype='uint8') if not coast_band.is_empty else np.zeros((EXH, EXW), 'uint8')
golf_r = rasterize([(proj(shape(f['geometry'])), 1) for f in load('land_use') if f['properties'].get('class') in ('golf_course', 'rough')],
                   out_shape=(EXH, EXW), transform=ex_aff, fill=0, dtype='uint8')
vz_r = rasterize([(vz, 1)], out_shape=(EXH, EXW), transform=ex_aff, fill=0, dtype='uint8')
road_r = rasterize([(ln.buffer(14), 1) for c, ln in road_lines if c in ('primary', 'secondary', 'residential', 'tertiary')],
                   out_shape=(EXH, EXW), transform=ex_aff, fill=0, dtype='uint8')


def cell(arr, x, z):
    c, r = int((x - ex_x0) / EX_RES), int((z - ex_z0) / EX_RES)
    return 0 <= r < EXH and 0 <= c < EXW and arr[r, c]


rng = random.Random(42)
DENSE = (-1400, 1700, -1100, 1300)   # x0, x1, z0, z1 around the estate and beach
PALM, BROAD, FILAO, FLAMB = 0, 1, 2, 3
P_COVER = {10: 0.7, 20: 0.22, 30: 0.04, 40: 0.0, 50: 0.06, 60: 0.0, 80: 0.0, 90: 0.1, 95: 0.6}
trees = []


def add_tree(x, z, kind, s):
    trees.extend([int(round(x * 10)), int(round(z * 10)), kind * 100 + int(round(s * 50))])


xmin, xmax = x0, x0 + (w - 1) * dem_out['dx']
zmin, zmax = z0, z0 + (h - 1) * dem_out['dz']
for dense in (True, False):
    sp = 12.0 if dense else 55.0
    xa, xb, za, zb = DENSE if dense else (xmin, xmax, zmin, zmax)
    zz = za
    while zz < zb:
        xx = xa
        while xx < xb:
            x = xx + rng.uniform(-0.45, 0.45) * sp; z = zz + rng.uniform(-0.45, 0.45) * sp
            xx += sp
            inside_dense = DENSE[0] <= x <= DENSE[1] and DENSE[2] <= z <= DENSE[3]
            if not dense and inside_dense:
                continue
            if dem_at(x, z) <= 0.6 or excluded(x, z):
                continue
            cls = wc_at(x, z)
            p = P_COVER.get(cls, 0)
            coast, golf, estate = cell(coast_r, x, z), cell(golf_r, x, z), cell(vz_r, x, z)
            if golf:
                p = max(p, 0.10)
            if coast:
                p = max(p, 0.35)
            if rng.random() > p:
                continue
            if coast:
                kind = PALM if rng.random() < 0.55 else FILAO
            elif golf or estate:
                kind = PALM if rng.random() < 0.55 else BROAD
            elif cell(road_r, x, z) and rng.random() < 0.18:
                kind = FLAMB
            else:
                kind = BROAD if rng.random() < 0.9 else PALM
            add_tree(x, z, kind, rng.uniform(0.75, 1.3))
        zz += sp
n_cover = len(trees) // 3
for pt in osm_trees:
    if not excluded(pt.x, pt.y):
        add_tree(pt.x, pt.y, PALM if cell(coast_r, pt.x, pt.y) else BROAD, 1.1)
# Garden palms by each pool (illustrative landscaping)
for v in villas:
    if 'pool' not in v:
        continue
    cx, cz, ang, pl, pw = v['pool']
    ca, sa = math.cos(ang), math.sin(ang)
    for sx, sz in ((-1, 1), (1, 1)):
        lx, lz = sx * (pl / 2 + 3.2), sz * (pw / 2 + 2.6)
        x, z = cx + lx * ca - lz * sa, cz + lx * sa + lz * ca
        if not excluded(x, z):
            add_tree(x, z, PALM, rng.uniform(0.85, 1.15))

scene = {
    'meta': {'origin': [LON0, LAT0], 'bounds': [W, S, E, N], 'kx': KX, 'ky': KY,
             'overture_release': '2026-10-21.0', 'dem': 'Copernicus GLO-30 DSM (2021 release)',
             'tour_m': round(tour_len), 'sentinel': sat_scenes, 'trees_from_cover': n_cover},
    'dem': dem_out, 'valriche': flat([to_xz(*c) for c in VALRICHE_ZONE.exterior.coords]),
    'sat': os.path.basename(sat_path),
    'buildings': buildings, 'roads': roads, 'landuse': landuse, 'water': water, 'land': land, 'pois': pois,
    'villas': villas, 'trees': trees,
    'tour': [[round(a, 1), round(b, 1)] for a, b in tour],
}
json.dump(scene, open(OUT, 'w'), separators=(',', ':'))

from collections import Counter
print('dem', w, h, 'buildings', len(buildings), Counter(b['c'] for b in buildings),
      'roads', len(roads), 'landuse', len(landuse), 'water', len(water), 'land', len(land), 'pois', len(pois),
      Counter(p['v'] for p in pois), 'tour pts', len(tour), 'tour m', round(tour_len))
print('villas', len(villas), 'with pool', sum('pool' in v for v in villas), Counter(v['st'] for v in villas),
      'trees', len(trees) // 3, Counter(t // 100 for t in trees[2::3]), 'sat', SAT_W, SAT_H)
