MAP IMAGES
==========

Drop a thumbnail for each map in THIS folder, then point the map pool at it.

Recommended size: 480x270px (16:9). Formats: .png .jpg .jpeg .webp

TWO WAYS TO ADD MAP IMAGES
--------------------------

1) LIVE IN THE ADMIN (no file editing):
   Admin panel -> Theme & Config -> Map Pool -> "+ Add Map".
   Type the map name and paste any image URL (or a path like
   "images/maps/aquila.png" relative to the config/ folder).
   The image shows during the map-reveal slot machine and as the
   thumbnail in the pool list.

2) PRE-LOAD FROM config/config.js:
   a. Save your image here, e.g.  config/images/maps/aquila.png
   b. In config/config.js add it to the `maps` array:
        maps: [
          { name: "Aquila",   imageUrl: "images/maps/aquila.png" },
          { name: "Castaway", imageUrl: "images/maps/castaway.png" },
        ],
   c. In the admin: Theme & Config -> "Load config.js"
      (or just refresh the page).

The path is resolved relative to config/config.js automatically, so
the same config works whether opened from disk or hosted on the web.

A map with no image still works - it shows a placeholder during the
reveal instead of breaking.
