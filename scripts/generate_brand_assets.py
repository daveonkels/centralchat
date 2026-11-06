#!/usr/bin/env python3
"""Generate all SVG/manifest sources from one mark. No third-party packages.

Run the Swift renderer next, then this script with --ico to package PNG fallbacks.
"""
from pathlib import Path
import json
import struct
import sys

ROOT = Path(__file__).resolve().parents[1]
SPEC = json.loads((ROOT / 'branding/interchange.json').read_text())
OUT = ROOT / 'frontend/public/brand/v1'
OUT.mkdir(parents=True, exist_ok=True)


def svg(theme, tile=True, adaptive=False, maskable=False):
    palette = SPEC['themes'][theme]
    variables = ';'.join(f'--{key}:{value}' for key, value in palette.items())
    style = f':root{{{variables}}}'
    if adaptive:
        dark = ';'.join(f'--{k}:{v}' for k, v in SPEC['themes']['dark'].items())
        style += f'@media(prefers-color-scheme:dark){{:root{{{dark}}}}}'
    items = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><style>{style}</style>']
    if tile:
        items.append('<path fill="var(--background)" d="M0 0h32v32H0z"/>')
    # Radius-40% circular mask safe zone, including round stroke caps.
    scale = .72 if maskable else .9
    offset = 16 * (1 - scale)
    items.append(f'<g transform="translate({offset} {offset}) scale({scale})">')
    for route in SPEC['routes']:
        d = ' '.join(' '.join(str(value) for value in command) for command in route['commands'])
        items.append(f'<path d="{d}" fill="none" stroke="var(--{route["color"]})" stroke-width="{SPEC["strokeWidth"]}" stroke-linecap="round" stroke-linejoin="round"/>')
    station = SPEC['station']
    items.append(f'<circle cx="{station["cx"]}" cy="{station["cy"]}" r="{station["radius"]}" fill="var(--station)" stroke="var(--outline)" stroke-width="{station["strokeWidth"]}"/></g></svg>')
    return ''.join(items) + '\n'


if '--ico' in sys.argv:
    for theme in SPEC['themes']:
        sizes = [16, 32, 48]
        pngs = [(OUT / f'favicon-{size}-{theme}.png').read_bytes() for size in sizes]
        offset = 6 + 16 * len(sizes)
        directory = b''
        for size, png in zip(sizes, pngs):
            assert png[:8] == b'\x89PNG\r\n\x1a\n'
            assert struct.unpack('>II', png[16:24]) == (size, size)
            directory += struct.pack('<BBBBHHII', size, size, 0, 0, 1, 32, len(png), offset)
            offset += len(png)
        (OUT / f'favicon-{theme}.ico').write_bytes(struct.pack('<HHH', 0, 1, len(sizes)) + directory + b''.join(pngs))
    (ROOT / 'frontend/public/favicon.ico').write_bytes((OUT / 'favicon-dark.ico').read_bytes())
else:
    for theme in SPEC['themes']:
        (OUT / f'mark-{theme}.svg').write_text(svg(theme, tile=False))
        (OUT / f'icon-{theme}.svg').write_text(svg(theme))
        (OUT / f'maskable-{theme}.svg').write_text(svg(theme, maskable=True))
        manifest = {
            'id': '/', 'name': 'Central Chat', 'short_name': 'Central Chat',
            'description': 'Your searchable conversation archive',
            'start_url': '/', 'scope': '/', 'display': 'standalone',
            'background_color': '#101011' if theme == 'dark' else '#ffffff',
            'theme_color': '#101011' if theme == 'dark' else '#ffffff',
            'icons': [
                {'src': f'icon-{size}-{theme}.png', 'sizes': f'{size}x{size}', 'type': 'image/png', 'purpose': 'any'}
                for size in (192, 384, 512)
            ] + [
                {'src': f'maskable-{size}-{theme}.png', 'sizes': f'{size}x{size}', 'type': 'image/png', 'purpose': 'maskable'}
                for size in (192, 512)
            ],
        }
        (OUT / f'site-{theme}.webmanifest').write_text(json.dumps(manifest, indent=2) + '\n')
    (OUT / 'favicon.svg').write_text(svg('light', adaptive=True))
print(f'Generated brand assets in {OUT}')
