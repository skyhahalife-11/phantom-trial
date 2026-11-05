import os
OUT = os.path.join(os.path.dirname(__file__), 'prompts'); os.makedirs(OUT, exist_ok=True)
CHAR = ("Use the creature in the reference image exactly: a hulking hooded demon in a ragged black-purple robe, two large dark-red bat wings with spiked tips, "
        "a glowing cyan horned skull for a face, and small orange skulls hanging from chains at its sides. It is big and heavy.")
TAIL = ("Every frame: the SAME creature at the SAME scale in every cell, strict side view facing RIGHT (never face the camera, never turn away); "
        "within one row the feet/robe bottom sit on the same ground line unless the frame is airborne; whole body including both wings inside the cell with margin. "
        "Crisp pixel art, limited palette of about 24 colors, hard-edged pixels, no anti-aliasing, no fire, no flames, no slash effects, no motion trails, no dust, "
        "no background objects, no extra characters, no minions, no text.")
def sheet(c, r, intro, body):
    return (f"Pixel art sprite sheet for a 2D side-scrolling action game boss, animated like classic 2D arcade fighting game sprites: dynamic, exaggerated, full of weight. {CHAR}\n\n"
            f"Layout: a {c} columns x {r} rows grid of {c*r} equal cells on a solid pure green (#00FF00) background, no grid lines, no text, no numbers. Read left to right, top to bottom as frames 1 to {c*r}. {intro}\n\n{body.strip()}\n\n{TAIL}")
S = {
 'charge': sheet(4, 2, "One continuous charge attack.", """
1. Standing ready, wings half open.
2. Crouching low, wings folding back, body coiled, head lowered.
3. Deepest crouch, wings swept far back, body pressed down like a spring about to release.
4. Charging: body stretched forward and low, wings swept straight back, leaning hard to the right.
5. Charging: same stretched pose, slightly different wing angle.
6. Braking: leaning back, wings flaring forward to stop.
7. Skidding, body upright again, wings spread wide.
8. Heaving recovery, wings drooping, body slightly hunched."""),
 'breath': sheet(4, 2, "One continuous fire-breath attack (the fire itself is NOT drawn).", """
1. Standing ready, wings half open.
2. Rearing back, chest swelling, wings lifting.
3. Fully reared back, wings spread wide and raised, head tilted up, jaw wide open.
4. Peak of the rear, wings maximum spread, about to lunge.
5. Lunging forward: head thrust down and forward with open mouth, wings swept forward, body bent.
6. Holding the exhale: head forward and low, mouth wide open, wings tensed.
7. Pulling back, wings lowering, head rising.
8. Recovered stance, wings half open."""),
 'dive': sheet(4, 2, "One continuous flying dive attack.", """
1. Crouching to take off, wings raised.
2. Launching upward, wings beating down, body stretched upward, robe trailing below.
3. Hovering high, wings spread wide, body upright, looking down.
4. Hovering, wings beating up, same pose.
5. Diving down: wings folded tight behind, body tilted head-first and downward.
6. Impact: slamming down, wings thrown wide, crouched, ground-pound pose.
7. Crouched on the ground after landing, wings drooping.
8. Rising back to standing, wings half open."""),
 'misc': sheet(4, 3, "Row 1 is a summoning spell, row 2 is exhausted/staggered and a hit reaction, row 3 is a death collapse.", """
Row 1, summon: 1. Standing, wings half open. 2. Both arms raised, wings lifting. 3. Head thrown back to the sky, arms high, wings wide. 4. Slamming both fists down toward the ground, wings snapping forward.
Row 2: 5. Staggered, kneeling on one knee, panting, wings drooping, head lowered. 6. Same kneeling pose, chest heaving, wings slightly lower. 7. Hit reaction: recoiling backward, head snapped back, wings flared. 8. Recovering from the hit, hunched.
Row 3, death collapse: 9. Staggering, wings drooping, head tilted. 10. Falling to its knees, wings crumpling. 11. Collapsing forward onto the ground, wings splayed limply. 12. Lying motionless in a heap, wings flat, skull dim."""),
}
for k, v in S.items(): open(os.path.join(OUT, k + '.txt'), 'w', encoding='utf-8').write(v)
print(list(S))
