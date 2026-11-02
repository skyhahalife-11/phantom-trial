"""生成各动作整套图的提示词文件到 ../hero2/prompts/"""
import os

OUT = os.path.join(os.path.dirname(__file__), '..', 'hero2', 'prompts')

CHAR = ("Use the character in the reference image exactly: white shoulder-length straight hair, wine-red fitted long coat "
        "with gold buttons and gold trim, black trousers and tall black boots, white bandages on the right forearm with a "
        "gold ring at the wrist, and a huge broad greatsword with a flat square tip, dark steel blade with a gold engraved line.")

TAIL = ("Every frame: the SAME character, strict side view facing RIGHT (the body may twist, but the head and feet keep facing "
        "right; never face the camera, never turn away); identical character scale in every cell; within one row, feet on the "
        "same ground line unless the frame is airborne, in which case keep the real jump height inside the cell; whole body "
        "and whole sword inside the cell with margin. Crisp pixel art, limited palette of about 24 colors, hard-edged pixels, "
        "no anti-aliasing, no slash effects, no motion trails, no chains, no dust (effects are added in code), no background "
        "objects, no extra characters, no gravestones, no text.")


def sheet(cols, rows, intro, body, char=CHAR):
    n = cols * rows
    return ("Pixel art sprite sheet for a 2D side-scrolling action game, animated like classic 2D arcade fighting game "
            "sprites: dynamic, exaggerated, full of weight and momentum. " + char + "\n\n"
            f"Layout: a {cols} columns x {rows} rows grid of {n} equal cells on a solid pure green (#00FF00) background, "
            f"no grid lines, no text, no numbers. Read left to right, top to bottom as frames 1 to {n}. {intro}\n\n"
            + body.strip() + "\n\n" + TAIL)


SHEETS = {
    'A_idle_run': sheet(4, 3, "Row 1 is an idle loop, rows 2 and 3 are one continuous running loop.", """
Row 1, idle breathing loop (4 frames), low ready stance, knees bent, both hands on the hilt, sword angled low in front:
1. Neutral ready stance.
2. Shoulders rise slightly as he breathes in, coat tails sway.
3. Highest point of the breath, hair moves slightly.
4. Shoulders settle back down, returning toward frame 1.

Rows 2 and 3, running loop (8 frames), leaning forward, sword held in the right hand trailing low behind the body, coat tails and hair streaming back:
5. Right foot contact.
6. Pushing off, body lowest.
7. Passing pose, left knee driving forward.
8. Airborne stride, both feet off the ground.
9. Left foot contact.
10. Pushing off, body lowest.
11. Passing pose, right knee driving forward.
12. Airborne stride, leading back into frame 5.
"""),
    'B_move': sheet(4, 3, "Rows show jumping, falling with a double jump, and a ground dash.", """
Row 1, jump (rising):
1. Crouching wind-up before the jump, knees deeply bent, sword held low behind.
2. Pushing off the ground, body extending upward, feet leaving the ground.
3. Rising in the air, knees tucked, coat trailing downward.
4. Top of the jump, body compact, sword held close.

Row 2, falling, landing and double jump:
5. Falling, legs extending down, coat flaring upward.
6. Landing, deep knee bend absorbing the impact, sword low.
7. Double jump: mid-air forward somersault, body tucked into a ball, sword tucked along the body, upside down halfway.
8. Double jump: finishing the somersault, body opening up again, upright in the air.

Row 3, ground dash (a fast short burst forward):
9. Dropping low, body leaning far forward, ready to burst.
10. Dashing: body stretched horizontally forward, very low, rear leg extended far back, coat streaming straight back.
11. Still dashing, same stretched pose, slightly different leg position.
12. Braking: front foot planted, body leaning back to stop, coat swinging forward.
"""),
    'C_air_runatk': sheet(4, 3, "Rows show an air slash, a downward plunge attack, and a running thrust attack.", """
Row 1, air slash (airborne the whole time):
1. In the air, sword raised above and behind the head.
2. Swinging the sword diagonally down in front while airborne.
3. Impact: sword extended forward and down, body arched.
4. Recovering in the air, sword returning to the side.

Row 2, downward plunge attack (airborne, falling straight down):
5. In the air, lifting the sword with both hands, blade pointing straight down.
6. Diving downward, blade pointing straight down below the feet, body vertical.
7. Impact pose, blade pointing straight down, knees bent, at the lowest point of the cell.
8. Bouncing back up after the hit, body opening, sword swinging up to the side.

Row 3, running thrust attack (forward momentum):
9. Running, sword pulled back at the hip, leaning forward.
10. Lunging forward into a long thrust, sword pointing straight ahead at chest height, rear leg fully extended.
11. Full extension of the thrust, sliding forward, coat streaming back.
12. Braking and pulling the sword back to the ready stance.
"""),
    'D_hurt_death': sheet(4, 2, "Row 1 is getting hit, row 2 is a death collapse.", """
Row 1, getting hit:
1. Recoiling backward from a hit to the chest, head snapping back, sword knocked out of guard.
2. Staggering back on the rear foot, arms flung, coat flying forward.
3. Catching balance, knees bent, sword dragged low.
4. Returning to a guarded ready stance.

Row 2, death:
5. Hit hard, stumbling, dropping to one knee.
6. Kneeling, leaning on the planted sword to stay up, head down.
7. Sword slipping, body tipping forward.
8. Lying face-down on the ground, sword fallen beside him.
"""),
    'E_skills': sheet(4, 3, "Each row is one special skill.", """
Row 1, piercing dash thrust (he rockets forward through enemies):
1. Sword drawn back at the hip, body coiled low, leaning forward.
2. Exploding forward, body nearly horizontal, sword pointing straight ahead, rear leg trailing far behind.
3. Full speed, same stretched pose, coat and hair flat behind him.
4. Skidding to a stop, turning the blade outward, low stance.

Row 2, chain hook throw (an invisible chain is thrown from the right hand; the left hand holds the sword):
5. Winding up, right arm pulled far back behind the body, sword held in the left hand low.
6. Throwing, right arm whipping forward and fully extended, open hand.
7. Holding the throw, right arm extended, body leaning forward.
8. Yanking back hard, right arm pulled back to the chest, body leaning back as if pulling something heavy toward him.

Row 3, upward ground heave (he wrenches the sword up out of the ground, launching enemies):
9. Driving the sword point down into the ground in front, crouching low over it with both hands on the hilt.
10. Straining, sword buried in the ground, body coiled, knees deeply bent.
11. Impact: heaving the sword violently upward out of the ground in front, body rising.
12. Sword raised high above the head, body stretched upward on the toes.
"""),
    # v0.3.1：锁魂钩、掘墓换成掷碑·瞬身、断空。飞出去的剑由代码画，所以扔出后的帧里手上不画剑
    'J_throw_iai': sheet(4, 3, "Row 1 throws the sword away, row 2 catches it back and lands from a teleport, row 3 is a quick-draw slash.", """
Row 1, hurling the greatsword like a boomerang (after frame 1 the sword has left his hands; do NOT draw the sword in frames 2, 3 and 4):
1. Winding up: body twisted far back, both hands gripping the hilt, the greatsword cocked back over the right shoulder.
2. Hurling: body whipping forward, both arms flung forward and fully extended, hands EMPTY and open.
3. Follow-through: leaning far forward, arms still extended, hands empty, coat flaring forward.
4. Recovering into a low ready stance, EMPTY-handed, right hand open and reaching forward, waiting for the sword to return.

Row 2, catching the returning sword, then arriving from a teleport:
5. Catching: right hand snapping shut on the hilt of the returning greatsword, the blade behind him, knees bending with the impact.
6. Settling back into the low ready stance, sword in both hands, angled low in front.
7. Teleport arrival: appearing in a deep low crouch, one knee almost touching the ground, sword swept far back behind him, coat and hair still blown forward.
8. Rising out of the crouch into the ready stance, sword coming forward.

Row 3, quick-draw slash (iaido style, one blindingly fast horizontal cut):
9. Low stance, body coiled, the greatsword held horizontally against the left hip like a sheathed blade, right hand on the hilt.
10. The draw: one explosive horizontal slash, blade swept fully forward at chest height, body lunging forward, rear leg extended.
11. Follow-through: the blade has passed through and is extended far behind him, body twisted, frozen in the finished cut.
12. Calmly bringing the blade back to the left hip as if sheathing it, upright, composed.
"""),
}

DESIGN_TRANSFORMED = (
    "Pixel art character design in the same pixel art style as the reference image, the SAME character after a demonic "
    "transformation. Keep the white shoulder-length straight hair, the wine-red fitted long coat with gold buttons and gold "
    "trim, the black trousers and tall black boots. Changes: his eyes glow bright crimson with red light trailing from them; "
    "the bandages and the gold ring on the RIGHT arm have burst apart; the whole right arm is swollen to about twice the size, "
    "crimson red skin with dark cracks and bulging veins, ending in a huge clawed hand; dark red aura wisps around the arm. "
    "His greatsword has unfolded into a much larger, heavier blade: a broad slab-like blade twice as wide, flat square tip, "
    "dark steel with the engraved line now glowing blood red. He grips the giant blade with the crimson claw and rests it on "
    "his shoulder. Strict side view facing RIGHT, full body, standing in a heavy forward-leaning stance. Single character "
    "centered on a solid pure green (#00FF00) background, whole body and blade inside the frame with margin. Crisp pixel art, "
    "limited palette, hard-edged pixels, no anti-aliasing, no text, no gravestones, no background objects.")

CHAR_T = ("Image 1 is the character's TRANSFORMED form, image 2 is his normal form. Unless a frame says otherwise, draw the "
          "TRANSFORMED form from image 1 exactly: white shoulder-length hair, glowing crimson eyes, wine-red long coat with "
          "gold buttons and trim, black trousers and boots, a hugely swollen crimson right arm with dark cracks ending in a "
          "giant claw, and a giant slab-like greatsword with a flat square tip and blood-red glowing engraved runes, gripped "
          "by the claw. It is heavy and slow, every move has huge weight.")

SHEETS_T = {
    'F_transform': sheet(4, 2, "One continuous transformation sequence, from the normal form (image 2) into the transformed form (image 1).", """
1. Normal form (image 2): standing, sword held low, right fist clenched and trembling.
2. Normal form: doubling over, right arm clutched to the chest, the gold wrist ring cracking.
3. The gold ring snaps and the bandages burst off the right arm in strips; the arm starts to swell red.
4. The right arm swells huge and crimson, veins bulging; the sword in his hand begins to widen.
5. The arm becomes the giant crimson claw; the sword unfolds into the giant slab blade, held low.
6. Throwing the head back, eyes igniting crimson, the claw raised, coat flaring outward.
7. Lowering into a heavy stance, the giant blade swung onto the shoulder.
8. Final transformed idle pose exactly like image 1.
""", CHAR_T),
    'G_t_base': sheet(4, 3, "Row 1 is an idle loop, row 2 a heavy forward step, row 3 two heavy sweeping slashes.", """
Row 1, transformed idle loop, giant blade resting on the shoulder, leaning forward, breathing heavily:
1. Base pose.  2. Shoulders rise.  3. Peak of the breath, claw flexing.  4. Settling back.

Row 2, heavy stomp step forward (slow, ground-shaking):
5. Lifting the front foot high.  6. Body pitching forward over the raised foot.  7. Foot slamming down, knees bending under the weight.  8. Recovering upright, blade still on the shoulder.

Row 3, heavy horizontal sweep then a backhand return sweep:
9. Blade swung far back behind, body coiled.  10. Impact: giant horizontal sweep in front at waist height, claw arm fully extended.  11. Momentum carrying the blade back across; backhand return sweep, impact in front again.  12. Blade dragged low behind, body heaving.
""", CHAR_T),
    'H_t_claws': sheet(4, 3, "Each row is one transformed attack.", """
Row 1, claw ground slam (third basic attack):
1. Raising the crimson claw high overhead, blade held in the left hand behind.  2. Claw at the peak, body arched back.  3. Impact: slamming the open claw palm-down onto the ground in front, crouching.  4. Pulling the claw back up, rising.

Row 2, grab and throw:
5. Lunging forward, claw reaching out open.  6. Claw closing into a fist in front at chest height (as if grabbing an enemy).  7. Swinging the closed claw up and back over the shoulder.  8. Hurling forward, claw opening, arm fully extended.

Row 3, overhead blade drop (the giant blade smashed straight down):
9. Lifting the giant blade high above the head with the claw.  10. Blade at the top, body stretched.  11. Impact: the blade smashed straight down onto the ground in front, body crouched.  12. Blade buried in the ground in front, leaning on it.
""", CHAR_T),
    'I_t_finish': sheet(4, 2, "Row 1 is the jumping finisher, row 2 is the planted blade guard.", """
Row 1, jumping finisher slam:
1. Crouching low, blade gripped in both hands.  2. Leaping high, giant blade raised above the head, airborne.  3. Impact: crashing down, blade smashed into the ground with full force, deep crouch.  4. Rising slowly from the crouch, blade still in the ground.

Row 2, planted blade guard (he plants the giant blade upright in front of him as a wall):
5. Swinging the blade around to the front.  6. Slamming the blade upright into the ground in front as a wall, broad side facing right.  7. Braced behind the planted blade, shoulder and claw pressed against it, knees bent.  8. Same braced pose, straining.
""", CHAR_T),
}

if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    for k, v in {**SHEETS, **SHEETS_T}.items():
        open(os.path.join(OUT, k + '.txt'), 'w', encoding='utf-8').write(v)
    open(os.path.join(OUT, 'design_transformed.txt'), 'w', encoding='utf-8').write(DESIGN_TRANSFORMED)
    print('ok', list(SHEETS) + list(SHEETS_T) + ['design_transformed'])
