import psycopg2
conn = psycopg2.connect('postgresql://spotify_atlas:spotify_atlas_password@127.0.0.1:5433/spotify_atlas')
cur = conn.cursor()

# Manual archetype corrections for vibe layer
# Format: (cluster_id, correct_archetype)
corrections = [
    # Festival Regular fixes
    (4,  'Late Night Romantic'),    # OVOXO - Drake/Weeknd
    (16, 'Terminally Online'),      # SoundCloud 2021
    (19, 'Desi Household'),         # Dil Chahta Hai Era
    (23, 'Terminally Online'),      # Fabric Room Two - DnB
    (26, 'Rap Canon Devotee'),      # Black Panther Tribute - Kendrick
    (28, 'Terminally Online'),      # U8 Hermannplatz - Berlin techno
    (34, 'Festival Regular'),       # Strawberry Fields Sydney - keep Festival
    (35, 'Late Night Romantic'),    # Frank's Blonded Radio
    (36, 'Indie Main Character'),   # Val De Marne Circuit
    (50, 'Side Quest Soul'),        # Crunchyroll Waiting Room
    (52, 'Rap Canon Devotee'),      # BET Hip Hop Awards 2009
    (54, 'Terminally Online'),      # Sigilkore Discord
    (62, 'Late Night Romantic'),    # White Ferrari
    (63, 'Side Quest Soul'),        # Ninja Academy Courtyard
    (69, 'Side Quest Soul'),        # Animal Crossing at 8PM
    (93, 'Trap Dynasty'),           # QC Playlist - Migos
    (96, 'Trap Dynasty'),           # Houston Freeway
    (101,'Trap Dynasty'),           # 808 Mafia Session

    # Indie Main Character fixes
    (57, 'Festival Regular'),       # La Da Dee La Da Da - FISHER
    (65, 'Terminally Online'),      # Bleach Arc Transition
    (71, 'Side Quest Soul'),        # Dearly Beloved - game OST
    (77, 'Festival Regular'),       # XS Nightclub Vegas
    (78, 'Festival Regular'),       # Cream Ibiza
    (87, 'Festival Regular'),       # Printworks Closing Night
    (88, 'Side Quest Soul'),        # Thousand Sunny Lofi
    (90, 'Side Quest Soul'),        # 4AM Study Hall
    (92, 'Trap Dynasty'),           # Virgil Abloh Sample - Pop Smoke
    (100,'Rap Canon Devotee'),      # Rap Caviar Adjacent

    # Rap Canon Devotee fixes
    (18, 'Desi Household'),         # Arijit Singh Unplugged
    (24, 'Festival Regular'),       # Sao Paulo After Dark
    (25, 'Terminally Online'),      # Drift King Playlist
    (27, 'Trap Dynasty'),           # Opium Collective - Carti
    (43, 'Festival Regular'),       # A State of Trance

    # Side Quest Soul fixes
    (85, 'Rap Canon Devotee'),      # Donda Sessions
    (94, 'Trap Dynasty'),           # Culture Tape - Migos
    (95, 'Trap Dynasty'),           # Quavo Interlude
    (98, 'Rap Canon Devotee'),      # Late Night Kanye

    # Late Night Romantic fixes
    (59, 'Side Quest Soul'),        # Shinigami Eyes
    (60, 'Side Quest Soul'),        # Shingeki Academy - anime OST
    (68, 'Indie Main Character'),   # NME Class of 2001
    (70, 'Side Quest Soul'),        # Piano Collections
    (73, 'Side Quest Soul'),        # Chillhop Records
    (74, 'Side Quest Soul'),        # Crate & Barrel
    (75, 'Festival Regular'),       # TRL Countdown - Rihanna/pop
    (80, 'Trap Dynasty'),           # Nawfside Tunnel
    (81, 'Trap Dynasty'),           # Huncho Jack Interlude
    (84, 'Side Quest Soul'),        # Thousand Sunny Deck

    # Terminally Online fixes
    (3,  'K-Pop Citizen'),          # BLACKPINK Lightstick
    (9,  'Side Quest Soul'),        # Route 209 - anime lofi
    (12, 'Festival Regular'),       # Ibiza Season
    (29, 'Festival Regular'),       # Printworks Closing Set
    (39, 'Festival Regular'),       # HARD Summer Mainstage
    (53, 'Rap Canon Devotee'),      # TA13OO Carnival - Denzel
    (72, 'Side Quest Soul'),        # Mii Plaza - lofi
    (76, 'Festival Regular'),       # Electric Zoo 2012
    (99, 'Trap Dynasty'),           # Glock 19 - Pop Smoke

    # Trap Dynasty fixes
    (6,  'Festival Regular'),       # Boiler Room - Fred again..
    (10, 'Terminally Online'),      # Halo Theme Drop
    (13, 'Terminally Online'),      # Hybrid Theory Kid
    (14, 'Terminally Online'),      # Fabric London
    (15, 'Terminally Online'),      # Newgrounds Alumni
    (17, 'Side Quest Soul'),        # Subwoofer Lullaby - Minecraft
    (20, 'Desi Household'),         # AP Dhillon Aesthetic
    (21, 'Desi Household'),         # Desi Swag
    (31, 'Terminally Online'),      # Koishi Komeiji Plugg
    (32, 'Festival Regular'),       # De School Amsterdam
    (33, 'Terminally Online'),      # SoundCloud Discovery Feed
    (37, 'Festival Regular'),       # Robert Johnson Offenbach
    (38, 'Side Quest Soul'),        # Nausicaa Requiem
    (40, 'Terminally Online'),      # Tim Westwood Freestyle
    (41, 'Festival Regular'),       # Tresor Berlin
    (42, 'Festival Regular'),       # Printworks Main Room
    (44, 'Festival Regular'),       # Output Brooklyn
    (46, 'Side Quest Soul'),        # Coffee Shop Closing Time
    (48, 'Rap Canon Devotee'),      # Nujabes Soul
    (51, 'Rap Canon Devotee'),      # Shady 2.0 - Griselda
    (55, 'Terminally Online'),      # SoundCloud 2018
    (58, 'Indie Main Character'),   # Top of the Pops 1983
    (66, 'Terminally Online'),      # ISOxo Discord Mosh
    (79, 'Festival Regular'),       # Stadium EDM Row
    (82, 'Terminally Online'),      # Late Night SoundCloud
    (89, 'Side Quest Soul'),        # Velvet Room Visitor
    (91, 'Side Quest Soul'),        # Greymoor
]

updated = 0
for cluster_id, archetype in corrections:
    cur.execute("""
        UPDATE cluster_labels 
        SET cluster_archetype = %s
        WHERE cluster_layer = 'vibe' AND cluster_id = %s
    """, (archetype, cluster_id))
    if cur.rowcount > 0:
        updated += 1

conn.commit()
print(f"Updated {updated} communities")

# Final summary
cur.execute("""
    SELECT cluster_archetype, COUNT(*) 
    FROM cluster_labels 
    WHERE cluster_layer = 'vibe'
    GROUP BY cluster_archetype 
    ORDER BY COUNT(*) DESC
""")
print("\nFinal vibe archetype distribution:")
for row in cur.fetchall():
    print(f"  {str(row[0]):<25} {row[1]}")

conn.close()
