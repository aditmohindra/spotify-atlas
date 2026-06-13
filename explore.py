import asyncio
import os
import sys
sys.path.insert(0, '.')
from dotenv import load_dotenv
load_dotenv()
from app.services.getsongbpm import search_song

async def test():
    # Test exact track names from your DB
    tests = [
        ("God's Plan", "Drake"),
        ("HUMBLE.", "Kendrick Lamar"),
        ("Blinding Lights", "The Weeknd"),
        ("goosebumps", "Travis Scott"),
        ("Nights", "Frank Ocean"),
        ("Self Care", "Mac Miller"),
    ]
    for track, artist in tests:
        result = await search_song(track, artist)
        if result:
            print(f"FOUND:   {track} — {artist} → id={result.get('id')} bpm={result.get('tempo')}")
        else:
            print(f"MISSING: {track} — {artist}")

asyncio.run(test())
