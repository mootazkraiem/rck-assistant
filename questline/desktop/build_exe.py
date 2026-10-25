"""Build Questline.exe (single file, no console window).

    python questline\\desktop\\build_exe.py

Output: questline\\dist\\Questline.exe. Build files go to questline\\build (safe to delete).
The dashboard (index.html, css, js, data) is bundled inside the .exe, so after editing
the plan in data\\*.js, rebuild and hand out the new .exe.
"""
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent          # questline/desktop
ROOT = HERE.parent                              # questline/
ICON = HERE / "questline.ico"


def make_icon():
    """Navy rounded square with a white 'Q' ring, matching the app's header mark."""
    from PIL import Image, ImageDraw
    size = 256
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=56, fill=(31, 58, 95, 255))
    c, r, w = 120, 60, 24
    d.ellipse([c - r, c - r, c + r, c + r], outline="white", width=w)
    d.line([(152, 152), (198, 198)], fill="white", width=w)
    d.ellipse([198 - w // 2, 198 - w // 2, 198 + w // 2, 198 + w // 2], fill="white")  # round cap
    img.save(ICON, sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])


def main():
    import PyInstaller.__main__
    if not ICON.exists():
        make_icon()
    sep = os.pathsep
    data = [f"{ROOT / 'index.html'}{sep}.", f"{ROOT / 'css'}{sep}css", f"{ROOT / 'js'}{sep}js", f"{ROOT / 'data'}{sep}data"]
    args = [
        str(HERE / "app.py"),
        "--name", "Questline",
        "--onefile", "--windowed", "--noconfirm", "--clean",
        "--icon", str(ICON),
        "--paths", str(HERE),
        "--distpath", str(ROOT / "dist"),
        "--workpath", str(ROOT / "build"),
        "--specpath", str(ROOT / "build"),
    ]
    for item in data:
        args += ["--add-data", item]
    PyInstaller.__main__.run(args)
    exe = ROOT / "dist" / "Questline.exe"
    print(f"\nBuilt {exe} ({exe.stat().st_size / 1e6:.1f} MB)")


if __name__ == "__main__":
    sys.exit(main())
