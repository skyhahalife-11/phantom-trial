"""用白发的大小当尺子：量每张整套图里白发块的中位高度，按普攻三连（已定 srch=205）换算出各图的 srch"""
import sys
import numpy as np
import cv2
from PIL import Image


def hair_h(path):
    a = np.asarray(Image.open(path).convert('RGB')).astype(int)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    m = ((r > 200) & (g > 200) & (b > 200) & (np.max(a, 2) - np.min(a, 2) < 40)).astype(np.uint8)
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    n, lab, st, _ = cv2.connectedComponentsWithStats(m, connectivity=8)
    hs = [max(st[i, cv2.CC_STAT_HEIGHT], st[i, cv2.CC_STAT_WIDTH]) for i in range(1, n) if st[i, cv2.CC_STAT_AREA] > 400]
    return float(np.median(hs)) if hs else 0.0


if __name__ == '__main__':
    ref = hair_h(sys.argv[1])
    print('ref hair', ref)
    for p in sys.argv[2:]:
        h = hair_h(p)
        print(p, 'hair', round(h, 1), 'srch', round(205 * h / ref))
