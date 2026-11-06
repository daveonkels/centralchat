# Central Chat interchange identity

Four routes meet at one station: a place to return to conversations from different
sources. The route colors identify this brand; they are not vendor logos or a
promise that a particular provider is supported.

`interchange.json` is the canonical geometry and palette. The route positions,
station, and proportions stay the same in both themes. Dark mode brightens the
routes and reverses the station ring; it does not use a different symbol.

- In-app marks have transparent backgrounds and follow the selected app theme.
- Browser icons have opaque cream/navy fields. The initial SVG follows system
  appearance; the running app selects its light/dark variant explicitly.
- Apple touch icons are opaque 180px squares. iOS supplies the rounded mask.
- Web manifests provide standard and maskable PNGs. Maskable artwork uses extra
  padding to keep the full route strokes inside the circular 80%-diameter safe zone.
- No animations, gradients, generic layer icons, or monogram substitutes.

## Rebuild

No dependency installation is needed. SVG/manifest generation and ICO packaging
use Python's standard library; PNG rendering uses macOS Core Graphics via Swift:

```sh
python3 scripts/generate_brand_assets.py
swift -module-cache-path /tmp/central-chat-swift-module-cache scripts/render_brand_icons.swift
python3 scripts/generate_brand_assets.py --ico
```

The output is `frontend/public/brand/v1/`, plus the conventional root
`frontend/public/favicon.ico`. SVGs can also be rasterized with another trusted
SVG renderer on non-macOS hosts. Keep the palette in sRGB and preserve geometry.

When changing the identity, increment the asset directory version and the paths
in `BrandMark.tsx`, `utils/brand.ts`, and `index.html` to avoid stale icon caches.
Copy the generated assets and shared brand components into the demo repository;
retain its own demo-specific app logic and metadata.

## Installation behavior

A browser's home-screen shortcut can cache its icon independently of the site.
Select the desired light/dark theme before using Add to Home Screen. Existing
shortcuts may need to be removed and added again. Web metadata does not guarantee
that an already-installed iPhone icon will automatically change with app theme.

The manifests add installation metadata, not offline data access. This app still
needs its server connection. Test installation on real devices before claiming
native iOS appearance switching or offline support.
