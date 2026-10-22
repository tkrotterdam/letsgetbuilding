"""Build data/scene.json for the Bel Ombre / Villas Valriche 3D viewer.

Inputs (in RAW_DIR, produced by fetch_overture.py + a Copernicus DEM download):
  building.geojson segment.geojson place.geojson land_use.geojson water.geojson
  dem.tif  (Copernicus GLO-30 tile Copernicus_DSM_COG_10_S21_00_E057_00_DEM.tif)

Usage: python3 tools/build_scene.py RAW_DIR data/scene.json
"""
import json, math, sys, hashlib
import numpy as np, rasterio, networkx as nx
from rasterio.windows import from_bounds
from shapely.geometry import shape, Polygon, Point, box, mapping
from shapely.ops import transform

RAW, OUT = sys.argv[1], sys.argv[2]

# Scene window (lon/lat) and local origin, roughly the Château de Bel Ombre / golf club.
W, S, E, N = 57.378, -20.515, 57.448, -20.472
LON0, LAT0 = 57.4125, -20.4985
KX = 111320 * math.cos(math.radians(LAT0))  # metres per degree lon
KY = 110574                                 # metres per degree lat
CLIP = box(W, S, E, N)


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
    x, z = to_xz(lon, lat)
    srcs = sorted({s['dataset'] for s in p.get('sources') or [] if s['dataset'] != 'Overture'})
    pois.append({'n': n, 'c': cat, 'x': x, 'z': z, 'conf': conf, 'v': status, 'note': note, 'src': srcs})
    if cat == 'hotel' and status != F:
        hotel_pts.append(proj(Point(lon, lat)))

# ---------------------------------------------------------------- buildings
vz = proj(VALRICHE_ZONE)
SRC = {'OpenStreetMap': 'osm', 'Microsoft ML Buildings': 'msft', 'Google Open Buildings': 'google'}
buildings = []
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

# ---------------------------------------------------------------- roads + graph
roads, G = [], nx.Graph()


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

scene = {
    'meta': {'origin': [LON0, LAT0], 'bounds': [W, S, E, N], 'kx': KX, 'ky': KY,
             'overture_release': '2026-10-21.0', 'dem': 'Copernicus GLO-30 DSM (2021 release)',
             'tour_m': round(tour_len)},
    'dem': dem_out, 'valriche': flat([to_xz(*c) for c in VALRICHE_ZONE.exterior.coords]),
    'buildings': buildings, 'roads': roads, 'landuse': landuse, 'water': water, 'pois': pois,
    'tour': [[round(a, 1), round(b, 1)] for a, b in tour],
}
json.dump(scene, open(OUT, 'w'), separators=(',', ':'))

from collections import Counter
print('dem', w, h, 'buildings', len(buildings), Counter(b['c'] for b in buildings),
      'roads', len(roads), 'landuse', len(landuse), 'water', len(water), 'pois', len(pois),
      Counter(p['v'] for p in pois), 'tour pts', len(tour), 'tour m', round(tour_len))
