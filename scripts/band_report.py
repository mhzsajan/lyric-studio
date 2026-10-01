"""
band_report.py -- does any line reach too low, or sit too high?

    py scripts/band_report.py <video> <t1> <t2> ...

WHY
---
The delivery constraint is not "the text is centred". It is: the material is played
on a stage screen that sits HIGH, so the lower part of the frame is where the
audience cannot see, AND the top of the frame is lost to whatever is above the
screen. "Only mid low is fine."

Raising the band's `top` did not achieve that on its own, because a band's top is
where the block BEGINS and the block grows downward. Measured after moving the three
placements from 24/56/70 up to 38/48/58:

    t=189s   50%..94%     an eleven-word cue stacked one word per row

So the block's HEIGHT is the thing that has to be bounded, and the report exists to
keep it bounded -- to check every sampled cue against both edges rather than against
the centre, which is what "is it centred" would have done and would have passed a
block hanging off the bottom of the visible area.

TOLERANCE: a frame caught mid-entrance is legitimately off-position, because
--motion flies lines in. So a single sample is not evidence. This reports the
spread and flags only what is out of the band on the LOW side, which is the side
that is actually lost off the screen.
"""
import subprocess
import sys

from PIL import Image

FF = r"node_modules\@remotion\compositor-win32-x64-msvc\ffmpeg.exe"

# The usable band, as a fraction of frame height. Mirrors MAX_BOTTOM in
# LyricOverlay.jsx and geometry()'s 38/48/58.
BAND_LO = 0.30
BAND_HI = 0.70


def main():
    video, times = sys.argv[1], sys.argv[2:]
    print("")
    print("  %-8s %-14s %-8s  %s" % ("t", "text spans", "of frame", "verdict"))
    print("  " + "-" * 66)
    low = []
    high = []
    for t in times:
        out = "out/diag/br_%s.png" % t.replace(".", "_")
        subprocess.run([FF, "-hide_banner", "-loglevel", "error", "-ss", t,
                        "-i", video, "-frames:v", "1", out, "-y"], check=False)
        im = Image.open(out).convert("RGB")
        px = im.load()
        w, h = im.size
        mny, mxy = h, -1
        for y in range(h):
            for x in range(0, w, 2):
                r, g, b = px[x, y]
                if r > 35 and (r + g + b) > 120:
                    if y < mny:
                        mny = y
                    if y > mxy:
                        mxy = y
        if mxy < 0:
            print("  %-8s (no ink)" % t)
            continue
        top, bot = mny / h, mxy / h
        why = []
        if bot > BAND_HI:
            why.append("TOO LOW")
            low.append(t)
        if top < BAND_LO:
            why.append("high")
            high.append(t)
        print("  %-8s %4d..%-6d %3.0f%%..%3.0f%%  %s" % (
            t + "s", mny, mxy, top * 100, bot * 100,
            ", ".join(why) if why else "in band"))

    print("")
    print("  band is %d%%..%d%% of frame height" % (BAND_LO * 100, BAND_HI * 100))
    if low:
        print("  TOO LOW (this is what the stage screen hides): %s" % ", ".join(low))
    else:
        print("  nothing reaches into the part of the frame the screen hides.")
    if high:
        print("  above the band (mid-entrance frames are expected): %s"
              % ", ".join(high))
    print("")


if __name__ == "__main__":
    main()
