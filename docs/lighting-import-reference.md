# Lighting import JSON reference

Use [lighting-import-sample.lighting.json](lighting-import-sample.lighting.json)
as the complete schema-v1 example. It includes a 600 × 500 mm enclosure, two
rows, five placed devices, six catalog definitions, two ducts, two internal
connections, six cable entries, four bundles, and seven external cables.
The products, dimensions, terminal positions, and example image/datasheet
links are illustrative generic data. Replace them with your actual hardware.

## Document structure

The import file is one JSON object. These are its only supported root keys:

| Field | Presence | Type and limits |
| --- | --- | --- |
| `format` | Required | Exactly `"homelab-lighting-design"`. |
| `schema_version` | Required | The JSON number `1`. |
| `exported_at` | Required | A valid date string; use UTC ISO 8601, such as `"2026-10-05T12:00:00Z"`. |
| `design` | Required | Enclosure settings object described below. |
| `catalog` | Present | List of catalog snapshots; at most 3,000. |
| `rows` | Present | List of DIN rows; at most 500. |
| `components` | Present | List of placed devices; at most 2,000. |
| `ducts` | Present | List of wire ducts; at most 500. |
| `connections` | Present | List of connections between internal device terminals; at most 5,000. |
| `cable_entries` | Present | List of enclosure entry points; at most 500. |
| `cable_bundles` | Present | List of cable groups and their shared routes; at most 1,000. |
| `external_cables` | Present | List of individual external cables; at most 5,000. |

All eight collection keys must exist, even when their value is `[]`. Collection
values must be lists, rather than objects indexed by IDs. The document is
limited to 10 MiB and a JSON decoding depth of 64. JSON comments and extra
root keys such as `options` are unsupported.

The following tables use these presence terms:

- **Required:** supply a non-null value of the stated type.
- **Present, nullable:** the key must exist, and `null` is accepted.
- **Present:** the key must exist; an empty list is accepted where stated.
- **Optional, nullable:** the key may be omitted or set to `null`.

Objects have exact allowed field sets shown in their tables. Additional keys
are rejected outside the supported `metadata` fields. Use JSON numbers for
dimensions and counts, and JSON `true`/`false` for booleans. All units with an
`_mm` suffix are millimeters; use at most two decimal places to match the
application's saved geometry.

Every layout object's `portable_id` is a UUID string. IDs must be unique
across **all** rows, components, ducts, connections, entries, bundles, and
external cables, with uniqueness checked without case sensitivity. Keep the
same spelling and case whenever referencing an ID. These IDs are document
references, not database IDs; importing regenerates them while preserving
their relationships.

## Enclosure: `design`

| Field | Presence | Type and limits |
| --- | --- | --- |
| `name` | Required | String, at most 255 characters. |
| `width_mm` | Required | Number, 1–1,000,000. |
| `height_mm` | Required | Number, 1–1,000,000. |
| `depth_mm` | Present, nullable | Number, 0.01–1,000,000. |
| `margin_top_mm` | Required | Number, 0–1,000,000. |
| `margin_right_mm` | Required | Number, 0–1,000,000. |
| `margin_bottom_mm` | Required | Number, 0–1,000,000. |
| `margin_left_mm` | Required | Number, 0–1,000,000. |
| `grid_size_mm` | Required | Number, 0.1–1,000. |
| `snap_to_grid` | Required | Boolean. |
| `notes` | Present, nullable | String, at most 10,000 characters. |
| `metadata` | Optional, nullable | Arbitrary JSON object or array. |

Left plus right margins must be strictly less than the width. Top plus bottom
margins must be strictly less than the height. The application starts new
designs with a 364 × 320 mm enclosure and 20 mm margins; grid spacing defaults
to 5 mm with snapping enabled. An import requires explicit dimensions,
margins, grid settings, `depth_mm`, and `notes`; those creation defaults do
not fill missing import fields.

## Catalog definitions: `catalog[]`

Each snapshot describes one catalog family and revision. It contains no
database ID and must be referenced by at least one row, component, or duct.
Family/revision pairs must be unique within the file.

| Field | Presence | Type and limits |
| --- | --- | --- |
| `catalog_family_id` | Required | UUID string. |
| `revision` | Required | Integer, 1–2,147,483,647. |
| `manufacturer` | Required | String, at most 255 characters. |
| `model` | Required | String, at most 255 characters. |
| `display_name` | Required | String, at most 255 characters. |
| `category` | Required | Free-text string, at most 100 characters. |
| `kind` | Required | `component`, `rail`, or `duct`. |
| `sku` | Optional, nullable | String, at most 255 characters. |
| `width_mm` | Required | Number, 0.01–1,000,000. |
| `height_mm` | Required | Number, 0.01–1,000,000. |
| `depth_mm` | Optional, nullable | Number, 0.01–1,000,000. |
| `din_modules` | Optional, nullable | Number, 0.01–10,000; fractional counts are accepted. |
| `mounting_type` | Required | `din-rail`, `panel`, `pcb`, or `free`. |
| `mounting_anchor_x_mm` | Optional, nullable | Number, 0–1,000,000; must not exceed `width_mm`. |
| `mounting_anchor_y_mm` | Optional, nullable | Number, 0–1,000,000; must not exceed `height_mm`. |
| `terminals` | Present | List of terminal objects; zero to 200. |
| `metadata` | Optional, nullable | Arbitrary JSON object or array. |
| `image_url` | Optional, nullable | HTTP or HTTPS URL string, at most 4,000 characters. |
| `datasheet_url` | Optional, nullable | HTTP or HTTPS URL string, at most 4,000 characters. |
| `description` | Optional, nullable | String, at most 10,000 characters. |
| `has_local_image` | Required | Boolean indicating whether the exporting catalog had an uploaded image. |

Omitted or null mounting anchors use the center of the unrotated definition:
`width_mm / 2` and `height_mm / 2`.

`category` is not an enum. The catalog editor suggests `DIN dimmer`, `DIN
relay`, `controller / ESP32`, `I/O module`, `power supply`, `terminal block`,
`circuit protection`, `network device`, `relay / fallback relay`, `DIN rail`,
`wire duct`, and `miscellaneous`; other category strings are accepted.
Likewise, `manufacturer`, `model`, `sku`, and terminal `purpose` are free text.

`has_local_image` is informational. The JSON does not embed or copy uploaded
image bytes, and setting this flag to `true` cannot recreate an image. A newly
created definition needs its own image upload, or a usable `image_url`.
Do not include `image_path`, `local_image_url`, `image`, `remove_image`, or
`import_snapshot` in a catalog snapshot.

### Catalog references

Rows, components, and ducts reference definitions using exactly this shape:

```json
{
  "catalog_family_id": "10000000-0000-4000-8000-000000000001",
  "revision": 1
}
```

Both fields are required in a non-null reference. The UUID/revision pair must
match a snapshot in this document. `components[].catalog_ref` is required and
cannot be null. Rows and ducts must include `catalog_ref`, but may set it to
null for generic hardware. Referenced snapshots must have kind `component`,
`rail`, or `duct` for their corresponding collection. Unreferenced catalog
snapshots are rejected.

### Terminal definitions: `catalog[].terminals[]`

| Field | Presence | Type and limits |
| --- | --- | --- |
| `key` | Required | String, at most 100 characters; only letters, digits, `_`, `.`, `+`, and `-`. Unique within this definition. |
| `label` | Required | String, at most 100 characters. Labels may repeat. |
| `x_mm` | Required | Number, 0–1,000,000; must not exceed the definition's width. |
| `y_mm` | Required | Number, 0–1,000,000; must not exceed the definition's height. |
| `side` | Required | `top`, `right`, `bottom`, or `left`. |
| `purpose` | Optional, nullable | Free-text string, at most 100 characters. |
| `metadata` | Optional, nullable | Arbitrary JSON object or array. |

Coordinates are local to the unrotated definition. Usually a top terminal has
`y_mm: 0`, a right terminal has `x_mm: width_mm`, a bottom terminal has
`y_mm: height_mm`, and a left terminal has `x_mm: 0`. The validator checks
that the point fits inside the dimensions; it does not require it to lie on
the declared edge. Connections identify terminals by `key`, not `label` or
`purpose`. Different definitions can reuse keys such as `L`, `N`, and `PE`.

## DIN rows: `rows[]`

| Field | Presence | Type and limits |
| --- | --- | --- |
| `portable_id` | Required | Globally unique UUID string. |
| `catalog_ref` | Present, nullable | Catalog reference to a `rail` definition. |
| `sort_order` | Required | Integer, 0–500. |
| `x_mm` | Required | Number, −1,000,000–1,000,000. |
| `y_mm` | Required | Number, −1,000,000–1,000,000. |
| `length_mm` | Required | Number, 0.01–1,000,000. |
| `width_mm` | Required | Number, 0.01–1,000,000; the rail strip's vertical size. |

Rows run horizontally from `x_mm` to `x_mm + length_mm`. Their mounting
line is `y_mm + width_mm / 2`. A row's placed length can differ from its
catalog definition's sample length. Rows do not support `rotation`, `notes`,
or `metadata`.

## Placed devices: `components[]`

| Field | Presence | Type and limits |
| --- | --- | --- |
| `portable_id` | Required | Globally unique UUID string. |
| `catalog_ref` | Required | Non-null reference to a `component` definition. |
| `sort_order` | Required | Integer, 0–2,000. |
| `x_mm` | Required | Number, −1,000,000–1,000,000. |
| `y_mm` | Required | Number, −1,000,000–1,000,000. |
| `rotation` | Required | Integer: `0`, `90`, `180`, or `270` degrees. |
| `custom_label` | Optional, nullable | String, at most 255 characters. |
| `rail_portable_id` | Optional, nullable | UUID of an existing row in this file. |
| `notes` | Optional, nullable | String, at most 10,000 characters. |
| `metadata` | Optional, nullable | Arbitrary JSON object or array. |

Use `rail_portable_id: null` for an unattached device, including panel, PCB,
and free mounting. An attached device must use a `din-rail` definition and
rotation `0` or `180`. Its full horizontal interval must fit the row, and DIN
devices attached to the same row cannot overlap. Its rotated mounting anchor
must align with the row's mounting line. Touching adjacent devices are allowed.

## Wire ducts: `ducts[]`

| Field | Presence | Type and limits |
| --- | --- | --- |
| `portable_id` | Required | Globally unique UUID string. |
| `catalog_ref` | Present, nullable | Catalog reference to a `duct` definition. |
| `x_mm` | Required | Number, −1,000,000–1,000,000. |
| `y_mm` | Required | Number, −1,000,000–1,000,000. |
| `length_mm` | Required | Number, 0.01–1,000,000. |
| `width_mm` | Required | Number, 0.01–1,000,000. |
| `orientation` | Required | `horizontal` or `vertical`. |

A horizontal duct occupies `length_mm` in x and `width_mm` in y; a vertical
duct swaps those extents. Ducts do not support `sort_order`, `rotation`,
`notes`, or `metadata`.

## Internal connections: `connections[]`

| Field | Presence | Type and limits |
| --- | --- | --- |
| `portable_id` | Required | Globally unique UUID string. |
| `source_portable_id` | Required | UUID of a component in this file. |
| `source_terminal` | Required | Key of one of that component's terminals; string up to 100 characters. |
| `target_portable_id` | Required | UUID of a component in this file. |
| `target_terminal` | Required | Key of one of that component's terminals; string up to 100 characters. |
| `cable_type` | Required | Free-text string, at most 255 characters. |
| `color` | Optional, nullable | Six-digit hexadecimal color, such as `"#2563eb"`. |
| `gauge` | Optional, nullable | Free-text string, at most 100 characters, such as `"1.5 mm²"` or `"18 AWG"`. |
| `conductor_count` | Required | Integer, 1–1,000. |
| `route_points` | Required | List of 2–500 point objects; see geometry below. |
| `actual_length_mm` | Optional, nullable | Number, 0–100,000,000; a separately recorded physical length. |
| `notes` | Optional, nullable | String, at most 10,000 characters. |

Colors can be any `#RRGGBB` value. `cable_type` and `gauge` are not enums.
The route's first point must match the source terminal's physical position
and its last point must match the target terminal's physical position. Every
segment must be horizontal or vertical. Connections do not support
`metadata`, `cable_class`, or `direction`; those last two fields belong to
external cabling.

## Cable entries: `cable_entries[]`

| Field | Presence | Type and limits |
| --- | --- | --- |
| `portable_id` | Required | Globally unique UUID string. |
| `label` | Required | String, at most 255 characters. |
| `side` | Required | `top`, `right`, `bottom`, or `left`. |
| `offset_mm` | Required | Number, 0–1,000,000. |
| `span_mm` | Required | Number, 0.01–1,000,000. |
| `entry_type` | Required | `conduit`, `cable_gland`, `gland_plate`, `cable_tray`, `open_entry`, or `other`. |
| `notes` | Optional, nullable | String, at most 10,000 characters. |
| `metadata` | Optional, nullable | Arbitrary JSON object or array. |

Offset is measured from the left on top/bottom edges and from the top on
left/right edges. The entire span must fit its side: `offset_mm + span_mm`
cannot exceed the enclosure width for top/bottom or height for left/right.
The route anchor is the span's midpoint on the enclosure edge.

## Shared external routes: `cable_bundles[]`

| Field | Presence | Type and limits |
| --- | --- | --- |
| `portable_id` | Required | Globally unique UUID string. |
| `cable_entry_portable_id` | Required | UUID of an entry in this file. |
| `name` | Required | String, at most 255 characters. |
| `external_location` | Optional, nullable | String, at most 255 characters. |
| `cable_class` | Required | `line_voltage`, `low_voltage_control`, `data`, or `other`. |
| `direction` | Required | `incoming`, `outgoing`, or `mixed`. |
| `display_color` | Optional, nullable | Six-digit hexadecimal color, such as `"#5eead4"`. |
| `planned_count` | Optional, nullable | Integer, 0–10,000. |
| `route_points` | Required | List of 2–500 point objects. |
| `notes` | Optional, nullable | String, at most 10,000 characters. |
| `metadata` | Optional, nullable | Arbitrary JSON object or array. |

The first route point must equal the entry anchor. The last point is the
bundle's breakout, where individual branch routes start. The route must be
orthogonal. A null `display_color` lets the UI use the cable-class color.
`planned_count` records a planned quantity and does not create individual
cables or have to equal the number of cables currently in the bundle.
Multiple bundles can share one entry, and a bundle can have zero individual
cables, whether or not `planned_count` is supplied.

## Individual external cables: `external_cables[]`

| Field | Presence | Type and limits |
| --- | --- | --- |
| `portable_id` | Required | Globally unique UUID string. |
| `bundle_portable_id` | Present, nullable | UUID of a bundle in this file. |
| `cable_entry_portable_id` | Present, nullable | UUID of an entry in this file. |
| `label` | Required | String, at most 255 characters. |
| `cable_type` | Required | Free-text string, at most 255 characters. |
| `gauge` | Optional, nullable | Free-text string, at most 100 characters. |
| `conductor_count` | Required | Integer, 1–1,000. |
| `internal_component_portable_id` | Present, nullable | UUID of a component in this file. |
| `internal_terminal` | Present, nullable | Key of that component's terminal; string up to 100 characters. |
| `branch_route_points` | Present | List of 0–500 point objects, subject to the rules below. |
| `cable_class` | Present, nullable | `line_voltage`, `low_voltage_control`, `data`, or `other`. |
| `direction` | Present, nullable | `incoming`, `outgoing`, or `mixed`. |
| `notes` | Optional, nullable | String, at most 10,000 characters. |
| `metadata` | Optional, nullable | Arbitrary JSON object or array. |

Each cable has exactly one origin:

| Cable origin | `bundle_portable_id` | `cable_entry_portable_id` | `cable_class` and `direction` |
| --- | --- | --- | --- |
| Bundled | Existing bundle UUID | `null` | Both `null`; values inherit from the bundle. |
| Standalone | `null` | Existing entry UUID | Both non-null and explicitly supplied. |

Internal assignment also uses a pair: set both
`internal_component_portable_id` and `internal_terminal`, or set both to
`null`. The terminal key must exist on the referenced component definition.

An assigned cable requires at least two branch points. An unassigned cable
may use `[]`, or an unfinished route of at least two points. A one-point route
is invalid. Every nonempty branch starts at the bundle breakout or standalone
entry anchor, and every assigned branch ends at its internal terminal's
physical position. All segments must be orthogonal. An unassigned route's
final point can be a planned endpoint. External cables have no separate
`color`, `display_color`, or `actual_length_mm` field.

## Coordinates, rotations, and routes

The enclosure origin is its top-left corner. Positive x goes right and
positive y goes down. Component x/y is the top-left of its rotated bounds.
Catalog terminal and mounting-anchor x/y is measured within the unrotated
definition. For local point `(x, y)` in a definition with width `W` and
height `H`, rotate before adding the component position:

| Rotation | Rotated local x | Rotated local y | Rotated bounds |
| --- | --- | --- | --- |
| `0` | `x` | `y` | `W × H` |
| `90` | `H - y` | `x` | `H × W` |
| `180` | `W - x` | `H - y` | `W × H` |
| `270` | `y` | `W - x` | `H × W` |

A terminal's enclosure position is the rotated local point plus the placed
component's `(x_mm, y_mm)`. For an attached DIN component:

```text
component.y_mm = row.y_mm + row.width_mm / 2 - rotated_anchor.y_mm
```

For example, a 36 × 90 mm device with center anchor `(18, 45)` on a row at
`(20, 72.5)` with width `35` aligns at component y `45`. A local top terminal
`(9, 0)` on a component at `(20, 45)` becomes `(29, 45)` at rotation 0 and
`(47, 135)` at rotation 180. Rotations 90 and 270 require the component to be
unattached to a row.

Every route point is exactly:

```json
{ "x_mm": 29, "y_mm": 45 }
```

Both coordinates are required numbers in −1,000,000–1,000,000. A route from
`(29, 45)` to `(335, 45)` through a horizontal duct can be:

```json
[
  { "x_mm": 29, "y_mm": 45 },
  { "x_mm": 29, "y_mm": 165 },
  { "x_mm": 335, "y_mm": 165 },
  { "x_mm": 335, "y_mm": 45 }
]
```

Each adjacent pair shares x or y. Terminal and entry endpoint comparisons
allow a 0.01 mm tolerance, while the orthogonality check allows a 0.001 mm
tolerance. Use exact coordinates and two decimal places rather than relying
on tolerance. The geometric route length is the sum of horizontal and
vertical segment lengths; `actual_length_mm` on an internal connection can
record a different installed length.

For an entry with midpoint `m = offset_mm + span_mm / 2`, the anchor is:

| Side | Anchor x | Anchor y |
| --- | --- | --- |
| `top` | `m` | `0` |
| `right` | Enclosure width | `m` |
| `bottom` | `m` | Enclosure height |
| `left` | `0` | `m` |

## Metadata and descriptive options

Arbitrary metadata is supported on `design`, catalog definitions, terminal
definitions, placed components, cable entries, bundles, and external cables.
Prefer JSON objects such as `{ "room": "Workshop", "circuit": "L1" }`;
arrays and null are also accepted. Metadata can contain nested custom values,
but custom keys do not introduce new module behavior or alter geometry.
Rows, ducts, internal connections, and route points have no metadata field.

The catalog UI recognizes `sample_dimensions: true` and
`dimensions_status: "sample"` as hints to display its sample-dimensions
badge. Seeded catalog examples also use `sample_terminal_positions` and
`verified_dimensions`; these describe the data and are not enforced schema
options. A custom `circuit`, `voltage`, `channel`, or `room` belongs inside a
supported metadata object rather than as an extra top-level field on an item.

## Catalog preflight and importing

The file's snapshots describe required catalog revisions. Import preflight
compares them with the installed catalog and reports:

| Status | Meaning | Next step |
| --- | --- | --- |
| `exact` | The same family and revision exists with matching physical details. | Automatically usable, including an archived matching revision. |
| `missing` | The referenced family/revision has no selected matching definition. | Review/create the definition or explicitly select an existing compatible definition. |
| `conflict` | That family/revision exists with different physical details. | Review and explicitly select a compatible definition. |
| `resolved` | An existing definition was explicitly selected for this snapshot. | Usable once its kind and the resulting physical layout validate. |

Physical matching compares kind, dimensions, DIN module count, mounting type,
anchors, and terminal definitions. Product descriptions and catalog metadata
are not part of this physical comparison. Default center anchors and optional
terminal purpose/metadata are normalized when comparing; terminal order does
not matter.

Preflight does not automatically create catalog definitions from the file.
The review flow can create a missing revision from a snapshot, or create a
separate definition when physical details conflict with an existing immutable
identity. A newer revision in the same family is not automatically substituted
for the requested revision. Explicit selections must match the expected kind,
and preflight rechecks terminal positions, DIN fit, and routes against the
selected definitions. Import is blocked until every catalog entry is resolved.

Import creates a new design owned by the current user. It regenerates layout
UUIDs, restores links between objects, and uses the chosen import name. It
does not replace an existing design or change an existing catalog definition.

## Optional API request wrapper

The JSON file is the document itself. An API call to the named routes
`lighting.imports.preflight` or `lighting.imports.store` wraps that document
in a separate request object:

| Request field | Presence | Meaning |
| --- | --- | --- |
| `document` | Required | The complete import document, supplied as a parsed JSON object or a JSON string. |
| `name` | Required for import; optional for preflight | String up to 255 characters; overrides `document.design.name` for the newly imported design. |
| `resolutions` | Optional | List, at most 3,000, of explicit catalog selections; usually `[]` initially. |

Each resolution has exactly these fields:

```json
{
  "catalog_ref": {
    "catalog_family_id": "10000000-0000-4000-8000-000000000001",
    "revision": 1
  },
  "component_definition_id": 42
}
```

The catalog UUID/revision must refer to a snapshot in the document. The
definition ID is a positive integer identifying an existing local catalog
record. Resolve a snapshot at most once. These request wrapper fields and
local definition IDs do not belong in the uploaded file. Likewise,
`base_version`, `mutation_id`, `structured`, and `rails` are layout-save
concerns, not import-document options; the import uses `rows` and
`catalog_ref`.
