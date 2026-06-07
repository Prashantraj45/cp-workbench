#!/usr/bin/env python3
"""
Generate CP Workbench app icon.
Design: Dark editor background, teal accent bracket, lightning bolt for speed.
Outputs all required Tauri icon sizes + .icns via iconutil.
"""
import struct, zlib, os, math, subprocess

OUT = os.path.join(os.path.dirname(__file__), '..', 'src-tauri', 'icons')
ICONSET = os.path.join(OUT, 'cp-workbench.iconset')
os.makedirs(ICONSET, exist_ok=True)

# ── Colour palette ─────────────────────────────────────────────────────────────
BG        = (13,  17,  23,  255)   # #0d1117 — deep dark
CARD      = (22,  27,  34,  255)   # #161b22 — editor surface
BORDER    = (48,  54,  61,  255)   # #30363d — subtle border
TEAL      = (0,   210, 190, 255)   # accent teal
TEAL2     = (0,   180, 160, 255)   # darker teal
WHITE     = (230, 237, 243, 255)   # near-white text
GOLD      = (255, 215, 100, 255)   # lightning bolt
GREY      = (110, 118, 129, 255)   # secondary text

def lerp(a, b, t):
    return a + (b - a) * t

def clamp(v, lo=0, hi=255):
    return max(lo, min(hi, int(v)))

def rgba(r, g, b, a=255):
    return (clamp(r), clamp(g), clamp(b), clamp(a))

def blend(src, dst):
    """Alpha-blend src over dst."""
    sa = src[3] / 255
    da = dst[3] / 255
    oa = sa + da * (1 - sa)
    if oa == 0:
        return (0, 0, 0, 0)
    r = (src[0]*sa + dst[0]*da*(1-sa)) / oa
    g = (src[1]*sa + dst[1]*da*(1-sa)) / oa
    b = (src[2]*sa + dst[2]*da*(1-sa)) / oa
    return rgba(r, g, b, oa * 255)

# ── Canvas ─────────────────────────────────────────────────────────────────────
class Canvas:
    def __init__(self, w, h):
        self.w = w
        self.h = h
        self.px = [[(0,0,0,0)]*w for _ in range(h)]

    def set(self, x, y, c):
        if 0 <= x < self.w and 0 <= y < self.h:
            self.px[y][x] = blend(c, self.px[y][x])

    def fill_rect(self, x0, y0, x1, y1, c):
        for y in range(max(0,y0), min(self.h, y1)):
            for x in range(max(0,x0), min(self.w, x1)):
                self.px[y][x] = blend(c, self.px[y][x])

    def fill_rounded_rect(self, x0, y0, x1, y1, r, c):
        """Fill rounded rectangle with radius r."""
        for y in range(max(0,y0), min(self.h, y1)):
            for x in range(max(0,x0), min(self.w, x1)):
                # distance from corner
                cx = min(abs(x - x0 - r), abs(x - x1 + r + 1))
                cy = min(abs(y - y0 - r), abs(y - y1 + r + 1))
                in_corner_x = x < x0 + r or x > x1 - r - 1
                in_corner_y = y < y0 + r or y > y1 - r - 1
                if in_corner_x and in_corner_y:
                    nx = x0 + r if x < x0 + r else x1 - r - 1
                    ny = y0 + r if y < y0 + r else y1 - r - 1
                    dist = math.sqrt((x - nx)**2 + (y - ny)**2)
                    if dist > r:
                        continue
                    if dist > r - 1.2:
                        alpha = int(c[3] * (r - dist + 1.2) / 1.2)
                        self.px[y][x] = blend(rgba(c[0],c[1],c[2],alpha), self.px[y][x])
                        continue
                self.px[y][x] = blend(c, self.px[y][x])

    def draw_circle(self, cx, cy, r, c, aa=1.5):
        for y in range(int(cy-r-aa), int(cy+r+aa+1)):
            for x in range(int(cx-r-aa), int(cx+r+aa+1)):
                d = math.sqrt((x-cx)**2 + (y-cy)**2)
                if d < r - aa:
                    self.set(x, y, c)
                elif d < r + aa:
                    alpha = int(c[3] * (r + aa - d) / (2*aa))
                    self.set(x, y, rgba(c[0],c[1],c[2],alpha))

    def draw_line(self, x0, y0, x1, y1, c, thick=1):
        """Bresenham with thickness."""
        dx = abs(x1-x0); dy = abs(y1-y0)
        steps = max(dx, dy, 1)
        for i in range(steps+1):
            t = i/steps
            x = int(lerp(x0, x1, t))
            y = int(lerp(y0, y1, t))
            for tx in range(-thick, thick+1):
                for ty in range(-thick, thick+1):
                    if tx*tx + ty*ty <= thick*thick:
                        d = math.sqrt(tx*tx + ty*ty)
                        a = int(c[3] * max(0, 1 - d/max(thick,0.5)))
                        self.set(x+tx, y+ty, rgba(c[0],c[1],c[2],a))

    def fill_polygon(self, pts, c):
        """Fill convex polygon."""
        if not pts: return
        ys = [p[1] for p in pts]
        y_min, y_max = int(min(ys)), int(max(ys))
        for y in range(max(0,y_min), min(self.h, y_max+1)):
            xs = []
            n = len(pts)
            for i in range(n):
                x0,y0 = pts[i]; x1,y1 = pts[(i+1)%n]
                if (y0 <= y < y1) or (y1 <= y < y0):
                    t = (y - y0) / (y1 - y0)
                    xs.append(int(lerp(x0, x1, t)))
            xs.sort()
            for i in range(0, len(xs)-1, 2):
                for x in range(xs[i], xs[i+1]+1):
                    self.set(x, y, c)

    def to_png(self):
        # All rows must be compressed as ONE deflate stream (not per-row)
        raw = bytearray()
        for row in self.px:
            raw += b'\x00'          # filter type: None
            for px in row:
                raw += bytes(px)   # RGBA each pixel
        compressed = zlib.compress(bytes(raw), 9)

        def chunk(t, d):
            c = struct.pack('>I', len(d)) + t + d
            return c + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)

        sig  = b'\x89PNG\r\n\x1a\n'
        ihdr = chunk(b'IHDR', struct.pack('>IIBBBBB', self.w, self.h, 8, 6, 0, 0, 0))
        idat = chunk(b'IDAT', compressed)
        iend = chunk(b'IEND', b'')
        return sig + ihdr + idat + iend


def make_icon(size):
    s = size
    c = Canvas(s, s)
    sc = s / 1024  # scale factor

    def S(v):  # scale a 1024-unit value
        return int(v * sc)

    # ── Background gradient ────────────────────────────────────────────────────
    for y in range(s):
        for x in range(s):
            t = (x + y) / (2 * s)
            r = int(lerp(10, 18, t))
            g = int(lerp(13, 22, t))
            b = int(lerp(20, 35, t))
            c.px[y][x] = (r, g, b, 255)

    # ── Main card with rounded corners ────────────────────────────────────────
    pad = S(60)
    r_card = S(120)
    c.fill_rounded_rect(pad, pad, s-pad, s-pad, r_card, (22, 28, 42, 255))

    # ── Top bar (title bar simulation) ────────────────────────────────────────
    bar_h = S(80)
    c.fill_rounded_rect(pad, pad, s-pad, pad+bar_h, r_card, (28, 35, 52, 255))

    # Traffic-light dots in top bar
    dot_y = pad + S(40)
    dot_r = S(14)
    c.draw_circle(pad + S(45), dot_y, dot_r, (255, 95, 87, 220))
    c.draw_circle(pad + S(85), dot_y, dot_r, (255, 189, 46, 220))
    c.draw_circle(pad + S(125), dot_y, dot_r, (39, 201, 63, 220))

    # ── Code lines (decorative) ───────────────────────────────────────────────
    line_x = pad + S(50)
    line_y_start = pad + bar_h + S(45)
    line_gap = S(52)
    line_colors = [
        (TEAL[0], TEAL[1], TEAL[2], 200),   # keyword
        (WHITE[0], WHITE[1], WHITE[2], 160), # normal
        (WHITE[0], WHITE[1], WHITE[2], 140),
        (GOLD[0], GOLD[1], GOLD[2], 180),    # string
        (WHITE[0], WHITE[1], WHITE[2], 100),
    ]
    line_widths = [S(180), S(280), S(320), S(220), S(150)]
    for i, (lc, lw) in enumerate(zip(line_colors, line_widths)):
        ly = line_y_start + i * line_gap
        c.fill_rect(line_x, ly, line_x + lw, ly + S(18), lc)

    # indent second level
    for i, (lc, lw) in enumerate(zip(
        [(WHITE[0],WHITE[1],WHITE[2],130), (GOLD[0],GOLD[1],GOLD[2],160)],
        [S(240), S(190)]
    )):
        ly = line_y_start + (i+2) * line_gap
        c.fill_rect(line_x + S(40), ly, line_x + S(40) + lw, ly + S(18), lc)

    # ── Big "CP" glyph overlay ────────────────────────────────────────────────
    # Draw stylized ">" bracket in teal, center-right area
    bx = s // 2 + S(60)
    by = s // 2 + S(30)
    bsize = S(220)
    thick = max(2, S(28))

    # ">" shape: two lines meeting at a point
    tip_x = bx + bsize // 2
    tip_y = by
    top_x = bx - bsize // 3
    top_y = by - bsize // 2
    bot_x = bx - bsize // 3
    bot_y = by + bsize // 2

    # Glow effect: draw larger, more transparent version first
    for glow_t in range(3, 0, -1):
        ga = 40 * glow_t
        gt = thick + glow_t * S(8)
        tc = rgba(TEAL[0], TEAL[1], TEAL[2], ga)
        c.draw_line(top_x, top_y, tip_x, tip_y, tc, gt)
        c.draw_line(bot_x, bot_y, tip_x, tip_y, tc, gt)

    # Solid bracket
    tc_solid = rgba(TEAL[0], TEAL[1], TEAL[2], 255)
    c.draw_line(top_x, top_y, tip_x, tip_y, tc_solid, thick)
    c.draw_line(bot_x, bot_y, tip_x, tip_y, tc_solid, thick)

    # ── Lightning bolt (speed / performance) ─────────────────────────────────
    # Position: bottom-right of bracket
    lx = s // 2 + S(10)
    ly = s // 2 + S(80)
    lh = S(130)
    lw2 = S(65)

    bolt = [
        (lx + lw2//2, ly),
        (lx, ly + lh//2),
        (lx + lw2//2, ly + lh//2),
        (lx - lw2//4, ly + lh),
        (lx + lw2, ly + lh//2),
        (lx + lw2//2, ly + lh//2),
    ]

    # Glow
    for glow_t in range(3, 0, -1):
        ga = 35 * glow_t
        gc = rgba(GOLD[0], GOLD[1], GOLD[2], ga)
        expanded = [(x + (-glow_t*S(4) if x < lx+lw2//2 else glow_t*S(4)),
                     y + (-glow_t*S(4) if y < ly+lh//2 else glow_t*S(4))) for x,y in bolt]
        c.fill_polygon(expanded, gc)

    c.fill_polygon(bolt, rgba(GOLD[0], GOLD[1], GOLD[2], 240))

    # ── Teal border glow on card edge ─────────────────────────────────────────
    for bw in range(3, 0, -1):
        ba = 30 * bw
        # just top/left edges for subtle effect
        c.fill_rect(pad, pad, pad+bw, s-pad, rgba(TEAL[0], TEAL[1], TEAL[2], ba))
        c.fill_rect(pad, pad, s-pad, pad+bw, rgba(TEAL[0], TEAL[1], TEAL[2], ba))

    return c.to_png()


# ── Generate all required sizes ────────────────────────────────────────────────
SIZES = {
    'icon_16x16.png':        16,
    'icon_16x16@2x.png':     32,
    'icon_32x32.png':        32,
    'icon_32x32@2x.png':     64,
    'icon_128x128.png':      128,
    'icon_128x128@2x.png':   256,
    'icon_256x256.png':      256,
    'icon_256x256@2x.png':   512,
    'icon_512x512.png':      512,
    'icon_512x512@2x.png':   1024,
}

print("Generating icon sizes...")
for fname, size in SIZES.items():
    print(f"  {size}x{size}...")
    data = make_icon(size)
    with open(os.path.join(ICONSET, fname), 'wb') as f:
        f.write(data)

# Also write the non-iconset PNGs for Tauri bundle config
for name, size in [('32x32.png', 32), ('128x128.png', 128), ('128x128@2x.png', 256)]:
    with open(os.path.join(OUT, name), 'wb') as f:
        f.write(make_icon(size))

print("Converting to .icns via iconutil...")
result = subprocess.run(
    ['iconutil', '-c', 'icns', ICONSET, '-o', os.path.join(OUT, 'icon.icns')],
    capture_output=True, text=True
)
if result.returncode != 0:
    print(f"iconutil error: {result.stderr}")
else:
    print("icon.icns created.")

# .ico: just copy the 32x32 PNG (Tauri accepts this for macOS builds)
import shutil
shutil.copy(os.path.join(OUT, '32x32.png'), os.path.join(OUT, 'icon.ico'))
print("Done. Icons written to src-tauri/icons/")
