# Visio Stencils

A public collection of Microsoft Visio stencils for data-center and network equipment, sorted into per-vendor folders under `stencils/<Vendor>/`.

Search the collection, including the master shapes inside modern `.vssx` files, at **https://electronreaper.github.io/visio-stencils/**

<!-- catalog-summary:start -->
**132** stencils from **21** vendors (**64** modern `.vssx`, **68** legacy `.vss`). The `.vssx` packages contain **3,239** indexed shapes.
<!-- catalog-summary:end -->

## Vendors

<!-- catalog-table:start -->
| Vendor | Stencils | .vssx | .vss | Shapes | Size |
| --- | ---: | ---: | ---: | ---: | ---: |
| [3Com](stencils/3Com) | 4 | 0 | 4 | — | 2.9 MB |
| [APC](stencils/APC) | 6 | 5 | 1 | 140 | 9.6 MB |
| [Check Point](stencils/Check%20Point) | 1 | 0 | 1 | — | 20.5 MB |
| [Cisco](stencils/Cisco) | 5 | 0 | 5 | — | 3.8 MB |
| [Cohesity](stencils/Cohesity) | 1 | 0 | 1 | — | 8.3 MB |
| [Compaq](stencils/Compaq) | 3 | 0 | 3 | — | 7.9 MB |
| [Cumulus Networks](stencils/Cumulus%20Networks) | 1 | 1 | 0 | 42 | 2.5 MB |
| [Dell](stencils/Dell) | 15 | 14 | 1 | 830 | 52.5 MB |
| [Eaton](stencils/Eaton) | 23 | 10 | 13 | 240 | 63 MB |
| [HPE](stencils/HPE) | 10 | 6 | 4 | 544 | 58.7 MB |
| [IBM](stencils/IBM) | 14 | 0 | 14 | — | 65.8 MB |
| [Mellanox](stencils/Mellanox) | 10 | 6 | 4 | 11 | 41.8 MB |
| [MikroTik](stencils/MikroTik) | 1 | 0 | 1 | — | 267 KB |
| [NetApp](stencils/NetApp) | 21 | 21 | 0 | 1,355 | 115.3 MB |
| [Nortel](stencils/Nortel) | 1 | 0 | 1 | — | 2.2 MB |
| [Panduit](stencils/Panduit) | 1 | 0 | 1 | — | 272 KB |
| [Premium-Line](stencils/Premium-Line) | 8 | 0 | 8 | — | 2.7 MB |
| [Pure Storage](stencils/Pure%20Storage) | 1 | 1 | 0 | 77 | 21 MB |
| [STI](stencils/STI) | 2 | 0 | 2 | — | 2.8 MB |
| [Sun Microsystems](stencils/Sun%20Microsystems) | 1 | 0 | 1 | — | 190 KB |
| [Tintri](stencils/Tintri) | 3 | 0 | 3 | — | 32.1 MB |
| **Total** | **132** | **64** | **68** | **3,239** | **514.2 MB** |
<!-- catalog-table:end -->

Shape counts come from `visio/masters/masters.xml` inside each `.vssx` package. Legacy `.vss` files are binary, so they are listed without a shape index. A dash in the Shapes column means the vendor has no `.vssx` files.

## Install in Visio

1. Download a stencil from the [catalog](https://electronreaper.github.io/visio-stencils/), or copy it from `stencils/` in this repository. The site has a per-vendor **Download .zip** (built when the site is published) and a link to that vendor’s folder on GitHub. The whole repository is available as a [zip archive](https://github.com/electronreaper/visio-stencils/archive/refs/heads/main.zip).
2. Put the file in `Documents\My Shapes`. Vendor subfolders work and show up as submenus.
3. In Visio, choose **More Shapes > My Shapes** and select the stencil.

### Older `.vss` files and File Block

Very old `.vss` formats may be blocked by Visio’s File Block setting (**Trust Center > File Block Settings**). They can be opened by temporarily allowing them, then saved as `.vssx`.

In current Visio, open **File > Options > Trust Center > Trust Center Settings > File Block Settings**. Temporarily allow the older binary Visio stencil types, open the file, save it as `.vssx`, and turn the block back on if you want it.

## Formats

| Extension | What it is |
| --- | --- |
| `.vssx` | Modern Open XML stencil (a zip package). The catalog reads its master list, so search can find a model by the shape name drawn in Visio. |
| `.vss` | Legacy binary stencil. Listed by file name only. |

## Regenerating the catalog

File names, sizes, and shape lists are generated from the repository. They are not maintained by hand. From the repository root:

```bash
python3 scripts/build_manifest.py
```

That rewrites `docs/stencils.json` and the vendor table in this README. The GitHub Pages workflow runs the same script on every push to `main`, and it also builds the per-vendor zip archives served by the site. Those archives are not stored in git.

## Disclaimer

The stencils are the property of their respective vendors, collected from public vendor and VisioCafe sources. Trademarks belong to their owners. This repository is not affiliated with those vendors.
