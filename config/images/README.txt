IMAGE FILES FOR BEDWARS OVERLAY
================================

Place your images in the appropriate subfolder, then reference them
in config/config.js using a relative path from the config/ folder.

Example:
  A file at:  config/images/maps/aquila.png
  Becomes:    imageUrl: "images/maps/aquila.png"

FOLDER STRUCTURE:
  maps/     — Map thumbnail images (shown in map reveal animation)
              Recommended size: 480×270px (16:9)

  icons/    — Phase icon images (shown next to the game timer)
              Recommended size: 64×64px (square, transparent PNG)
              Files: diamond.png, emerald.png, bed.png, bedgone.png, skull.png

  logos/    — Event logos for Starting and BRB screens
              Recommended size: Up to 400×200px (transparent PNG or WebP)

  bg/       — Background images or videos for overlay screens
              Supported: .jpg, .png, .webp, .mp4, .webm

SUPPORTED FORMATS:
  Images: .png, .jpg, .jpeg, .webp, .gif, .svg
  Videos: .mp4, .webm
