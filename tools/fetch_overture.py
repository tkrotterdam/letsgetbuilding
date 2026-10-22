import os, sys, json, s3fs, pyarrow.dataset as ds, pyarrow.compute as pc
from shapely import wkb
REL='overturemaps-us-west-2/release/2026-10-21.0'
W,S,E,N=57.36,-20.535,57.45,-20.45
out=sys.argv[1]
fs=s3fs.S3FileSystem(anon=True, client_kwargs={'region_name':'us-west-2'}, config_kwargs={'proxies':{'https':os.environ['HTTPS_PROXY']}})
def fetch(theme,typ,cols):
    d=ds.dataset(f'{REL}/theme={theme}/type={typ}', filesystem=fs, format='parquet')
    f=(pc.field('bbox','xmin')<E)&(pc.field('bbox','xmax')>W)&(pc.field('bbox','ymin')<N)&(pc.field('bbox','ymax')>S)
    names=d.schema.names
    t=d.to_table(columns=[c for c in cols if c in names]+['geometry'], filter=f)
    feats=[]
    for r in t.to_pylist():
        g=wkb.loads(r.pop('geometry'))
        feats.append({'type':'Feature','geometry':g.__geo_interface__,'properties':r})
    json.dump({'type':'FeatureCollection','features':feats}, open(f'{out}/{typ}.geojson','w'), default=str)
    print(typ,len(feats),flush=True)
jobs=sys.argv[2:]
spec={'building':('buildings',['id','names','class','subtype','height','num_floors','sources']),
 'segment':('transportation',['id','names','class','subtype','road_surface','sources']),
 'place':('places',['id','names','categories','confidence','sources','websites']),
 'land_use':('base',['id','names','class','subtype','sources']),
 'land':('base',['id','names','class','subtype']),
 'water':('base',['id','names','class','subtype']),
 'infrastructure':('base',['id','names','class','subtype']),
 'land_cover':('base',['id','subtype'])}
for j in jobs: fetch(spec[j][0], j, spec[j][1])
