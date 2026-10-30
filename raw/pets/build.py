import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'anim_tools'))
import numpy as np
from PIL import Image
import clips

OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'assets', 'pets')
TARGET_H = {'wolf': 130, 'raven': 130, 'stone': 130, 'merchant': 230}
for name in sys.argv[1:]:
    im = np.array(Image.open(os.path.join(os.path.dirname(__file__), name + '_raw.png')).convert('RGB'))
    rgba = clips.key(im)
    ys, xs = np.where(rgba[:, :, 3] > 40)
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    crop = Image.fromarray(rgba[y0:y1, x0:x1], 'RGBA')
    h = TARGET_H[name]
    w = round(crop.width * h / crop.height)
    crop = crop.resize((w, h), Image.LANCZOS)
    crop.save(os.path.join(OUT, name + '.png'))
    print(name, crop.size)
