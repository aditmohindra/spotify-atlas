import re
path = 'app/api/map.py'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()
content = content.replace(
    '_CACHE_TTL_SECONDS = 0  # TEMP: disabled — set back to 300 after verifying fresh DB reads',
    '_CACHE_TTL_SECONDS = 300'
)
with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print('Done')
