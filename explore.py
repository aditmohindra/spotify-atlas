import psycopg2
conn = psycopg2.connect('postgresql://spotify_atlas:spotify_atlas_password@127.0.0.1:5433/spotify_atlas')
cur = conn.cursor()
cur.execute("SELECT name, scene_document, sound_document, behavior_document FROM tracks WHERE name ILIKE '%Goosebumps%' LIMIT 1")
row = cur.fetchone()
if row:
    print('=== TRACK:', row[0], '===')
    print('\n--- SCENE ---')
    print(row[1])
    print('\n--- SOUND ---')
    print(row[2])
    print('\n--- BEHAVIOR ---')
    print(row[3])
conn.close()
