"""变身召唤物的 6 张序列帧提示词 → raw/summon/prompts/*.txt"""
import os

D = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'prompts')
os.makedirs(D, exist_ok=True)

COMMON = ('Every frame: strict side view facing RIGHT; identical scale in every cell; whole subject inside its cell with margin. '
          'Crisp pixel art in the same style and palette as the reference image (dark gothic, wine red, crimson, black, bone grey, small gold accents), '
          'limited palette of about 24 colors, hard-edged pixels, no anti-aliasing, no soft glow gradients, no grid lines, no text, no numbers, '
          'no background objects, no ground, no hero character. Background: solid pure green (#00FF00) everywhere outside the subject.')

SHADE = ('a huge spectral crimson reaper: a hooded wraith with no visible face except two burning crimson eyes inside a black hood, '
         'a tattered wine-red cloak with gold-trimmed edges echoing the hero\'s coat, two long bony arms ending in giant crimson claws with dark cracks, '
         'and NO legs: its lower body dissolves into broken black tombstone shards, rusted chains and wisps of crimson smoke')

P = {}
P['S1_shade'] = f"""Pixel art sprite sheet for a 2D side-scrolling action game. Subject: the "Blood Pact Shade", summoned behind the hero from the reference image when he transforms (like a ghost demon that floats behind a demon swordsman). It is {SHADE}. Semi-translucent ghostly feel shown with dithered pixel edges, menacing and elegant.

Layout: a 4 columns x 3 rows grid of 12 equal cells. Read left to right, top to bottom as frames 1 to 12.
Row 1, floating idle loop: 1-4. hovering, cloak and chains swaying, claws slowly flexing, slight bob up and down.
Row 2, claw swipe (it mirrors the hero's basic attack): 5. right claw drawn back high. 6. claw slashing forward and down in a huge arc, body leaning in. 7. claw fully extended forward low, fingers spread. 8. recovering back to hover.
Row 3, summon and dismiss: 9. only a swirl of crimson smoke and shards. 10. half-formed shade rising out of the smoke. 11. fully formed, both claws spread wide, roaring. 12. bursting apart into tombstone shards and smoke.

{COMMON}"""

P['S2_grave_rain'] = f"""Pixel art sprite sheet for a 2D side-scrolling action game. Subject: summoned gothic tombstones that rain down from the sky onto enemies, matching the dark gothic style of the hero in the reference image. Each tombstone is heavy black-grey cracked stone with glowing blood-red engraved runes.

Layout: a 4 columns x 3 rows grid of 12 equal cells. Read left to right, top to bottom as frames 1 to 12.
Row 1, three tombstone designs falling straight down (upright, with a short crimson smoke trail streaming upward above each): 1. rounded-top tombstone with a cross carved in it. 2. pointed gothic-arch tombstone with a skull relief. 3. tall obelisk-style tombstone with chains wrapped around it. 4. the rounded-top tombstone planted in the ground at the moment of impact, with a burst of crimson cracks at its base and dust.
Row 2, ghostly hands grabbing from the ground at the impact point (bottom of each cell is the ground line): 5. crimson ghost fingertips breaking out of the ground. 6. three skeletal ghost hands reaching up. 7. hands fully up and clutching. 8. hands sinking back, dissolving into red smoke.
Row 3, the tombstone shattering: 9. tombstone cracking with red light leaking through. 10. tombstone exploding into big stone chunks and red sparks. 11. chunks flying apart, smaller. 12. last fragments and fading crimson smoke.

{COMMON}"""

P['S3_ground_claw'] = f"""Pixel art sprite sheet for a 2D side-scrolling action game. Subject: a gigantic crimson demonic claw summoned from beneath the ground, the same claw design as the hero's transformed right arm in the reference image (swollen crimson flesh, dark cracks, glowing red veins, long black-tipped talons), but much bigger: an arm bursting up out of a crack in the ground. The bottom of each cell is the ground line; the arm always comes out of the ground at the bottom center.

Layout: a 4 columns x 3 rows grid of 12 equal cells. Read left to right, top to bottom as frames 1 to 12.
Row 1, emerge and grab: 1. ground cracking open with red light and rubble. 2. the claw erupting upward, fingers spread, rubble flying. 3. claw high and open, reaching forward. 4. claw closed into a tight fist at the top (as if gripping an enemy).
Row 2, slam: 5. fist raised high and pulled back. 6. fist swinging down in an arc. 7. impact: fist smashed onto the ground to the right, shockwave of red cracks and rubble. 8. fist lifting up again.
Row 3, toss and retreat: 9. arm swinging forward and up. 10. claw opening at the top, flinging (empty hand, the enemy is drawn separately). 11. arm sinking back into the ground. 12. only the glowing crack in the ground closing, a few pebbles.

{COMMON}"""

P['S4_blood_prison'] = f"""Pixel art sprite sheet for a 2D side-scrolling action game. Subject: "Blood Prison", a trap that erupts under an enemy's feet: crimson blood thorns and black rusted chains burst from the ground and skewer and bind the target, matching the dark gothic style of the reference image. The bottom of each cell is the ground line; the effect is centered horizontally, about as tall as a human.

Layout: a 4 columns x 2 rows grid of 8 equal cells. Read left to right, top to bottom as frames 1 to 8.
Row 1: 1. a crimson rune circle glowing on the ground. 2. sharp blood thorns shooting up from the circle, black chains whipping up. 3. a full cage of tall crimson thorns crossing each other, chains wrapped around them in an X, at full height. 4. the thorn cage pulsing, red sparks.
Row 2: 5. a bright red-white slash cutting diagonally across the cage. 6. the thorns shattering into blood shards, chains snapping. 7. shards falling, crimson mist. 8. last drops and fading rune circle.

{COMMON}"""

P['S5_finisher'] = f"""Pixel art sprite sheet for a 2D side-scrolling action game. Subject: the finishing move "Burial": {SHADE}. It lifts a COLOSSAL gothic tombstone with both claws and smashes it down onto the ground. The tombstone is black cracked stone with glowing blood-red runes, taller than the reaper. Keep the same reaper design and scale in every frame; the bottom of each cell is the ground line where the tombstone lands.

Layout: a 4 columns x 2 rows grid of 8 equal cells. Read left to right, top to bottom as frames 1 to 8.
Row 1: 1. the reaper rising, a colossal tombstone materializing from crimson smoke above its claws. 2. holding the colossal tombstone high overhead with both claws, runes blazing. 3. leaning back, tombstone at the peak, about to swing. 4. swinging the tombstone down in front of it.
Row 2: 5. impact: the tombstone slammed into the ground at the bottom right, a huge burst of red cracks, rubble and dust. 6. the tombstone breaking apart, shockwave spreading. 7. the reaper dissolving into smoke and shards, rubble everywhere. 8. only falling rubble and fading crimson smoke.

{COMMON}"""

P['S6_blood_wave'] = f"""Pixel art sprite sheet for a 2D side-scrolling action game. Subject: a blood crescent sword wave fired by the transformed hero in the reference image with each basic attack: a vertical crescent moon-shaped blade of crimson energy, curved toward the RIGHT (convex side facing right, it flies right), with a hot pink-white inner edge, a dark crimson outer edge, small black stone fragments and blood droplets trailing behind it to the left. About as tall as the hero.

Layout: a 4 columns x 2 rows grid of 8 equal cells. Read left to right, top to bottom as frames 1 to 8.
Row 1, flight loop: 1. crescent just formed, thin and bright. 2. crescent at full size, trail streaming left. 3. full size, trail flickering, droplets. 4. full size, slightly different trail shape.
Row 2, hit and fade: 5. crescent hitting something: splitting into a burst of blood splashes and red sparks in a starburst. 6. burst expanding, droplets flying. 7. droplets falling and thinning. 8. last few droplets fading.

{COMMON}"""

for k, v in P.items():
    open(os.path.join(D, k + '.txt'), 'w', encoding='utf-8').write(v)
print(len(P), 'prompts')
