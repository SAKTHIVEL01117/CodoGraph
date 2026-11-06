import os
import math
import random
import urllib.request
import re
import subprocess
from PIL import Image, ImageDraw, ImageFilter

os.makedirs('public/fonts', exist_ok=True)
os.makedirs('public/assets/aeris', exist_ok=True)

# 1. Fetch Dot-Matrix Font and save as aeris-dot-display.woff2
print("Fetching font...")
try:
    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
    req = urllib.request.Request('https://fonts.googleapis.com/css2?family=Silkscreen:wght@400;700&display=swap', headers=headers)
    css = urllib.request.urlopen(req).read().decode('utf-8')
    urls = re.findall(r'url\((https://[^)]+\.woff2)\)', css)
    if urls:
        font_bytes = urllib.request.urlopen(urls[0]).read()
        with open('public/fonts/aeris-dot-display.woff2', 'wb') as f:
            f.write(font_bytes)
        print(f"Downloaded aeris-dot-display.woff2: {len(font_bytes)} bytes")
except Exception as e:
    print(f"Font download error: {e}")

def make_video_from_frames(frame_gen, num_frames, fps, width, height, target_w, target_h, output_path):
    cmd = [
        'ffmpeg', '-y',
        '-f', 'rawvideo',
        '-vcodec', 'rawvideo',
        '-s', f'{width}x{height}',
        '-pix_fmt', 'rgb24',
        '-r', str(fps),
        '-i', '-',
        '-vf', f'scale={target_w}:{target_h}',
        '-c:v', 'libx264',
        '-pix_fmt', 'yuv420p',
        '-preset', 'veryfast',
        '-crf', '22',
        '-movflags', '+faststart',
        output_path
    ]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stderr=subprocess.PIPE, stdout=subprocess.PIPE)
    for i in range(num_frames):
        img = frame_gen(i, num_frames, width, height)
        proc.stdin.write(img.tobytes())
    stdout, stderr = proc.communicate()
    if proc.returncode != 0:
        print(f"Error making {output_path}: {stderr.decode('utf-8', errors='ignore')}")
    else:
        print(f"Generated video: {output_path}")

# 2. aeris-hero-atmosphere.mp4
def generate_hero():
    w, h = 640, 360
    tw, th = 1280, 720
    frames = 45
    fps = 15
    rng = random.Random(42)
    
    glints = []
    for _ in range(30):
        glints.append({
            'x': rng.uniform(0.1 * w, 0.9 * w),
            'y': rng.uniform(0.2 * h, 0.85 * h),
            'phase': rng.uniform(0, math.pi * 2),
            'depth': rng.uniform(0.4, 1.2),
            'speed': rng.uniform(0.8, 1.5)
        })

    def frame(i, total, cur_w, cur_h):
        t = i / total
        tau = 2 * math.pi * t
        
        img = Image.new('RGB', (cur_w, cur_h), (8, 9, 12))
        draw = ImageDraw.Draw(img)

        for band in range(5):
            offset_y = cur_h * (0.2 + 0.15 * band)
            amp = 20 + band * 6
            freq = 0.006 + band * 0.001
            phase = band * 1.4 + tau
            points = []
            for x in range(0, cur_w + 30, 20):
                drift = math.sin(tau + x * 0.004 + band) * 10
                y = offset_y + math.sin(x * freq + phase) * amp + drift
                points.append((x, y))
            color_val = 22 + int(band * 6 + math.sin(tau + band) * 5)
            draw.line(points, fill=(color_val, color_val + 2, color_val + 6), width=25 + band * 10)

        img = img.filter(ImageFilter.BoxBlur(radius=10))
        draw = ImageDraw.Draw(img)

        for g in glints:
            pulse = (math.sin(tau * 2 * g['speed'] + g['phase']) + 1) / 2
            gx = g['x'] + math.cos(tau + g['phase']) * 6 * g['depth']
            gy = g['y'] + math.sin(tau + g['phase']) * 4 * g['depth']
            r = 1.0 + pulse * 1.5 * g['depth']
            alpha = 0.3 + pulse * 0.7
            orange = (int(246 * alpha), int(67 * alpha), int(2 * alpha))
            glow_orange = (int(120 * alpha), int(35 * alpha), 0)
            
            draw.ellipse([gx - r*2.5, gy - r*2.5, gx + r*2.5, gy + r*2.5], fill=glow_orange)
            draw.ellipse([gx - r, gy - r, gx + r, gy + r], fill=orange)

        return img

    make_video_from_frames(frame, frames, fps, w, h, tw, th, 'public/assets/aeris/aeris-hero-atmosphere.mp4')
    p_img = frame(0, frames, tw, th)
    p_img.save('public/assets/aeris/aeris-hero-poster.webp', quality=90)
    print("Saved aeris-hero-poster.webp")

# 3. aeris-about-clouds.mp4
def generate_about():
    w, h = 640, 360
    tw, th = 1280, 720
    frames = 45
    fps = 15

    def frame(i, total, cur_w, cur_h):
        t = i / total
        tau = 2 * math.pi * t
        
        img = Image.new('RGB', (cur_w, cur_h), (238, 236, 235))
        draw = ImageDraw.Draw(img)

        for layer in range(5):
            base_y = cur_h * (0.15 + layer * 0.18)
            points = []
            drift_x = math.sin(tau) * 20 + layer * 10
            for x in range(-30, cur_w + 40, 20):
                angle = (x + drift_x) * 0.008 + tau + layer * 0.9
                y = base_y + math.sin(angle) * (18 + layer * 8) + (x * 0.15)
                points.append((x, y))
            
            shade = 222 - layer * 8 + int(math.sin(tau + layer) * 4)
            points.append((cur_w + 40, cur_h + 30))
            points.append((-30, cur_h + 30))
            draw.polygon(points, fill=(shade, shade - 2, shade - 3))

        img = img.filter(ImageFilter.BoxBlur(radius=12))
        return img

    make_video_from_frames(frame, frames, fps, w, h, tw, th, 'public/assets/aeris/aeris-about-clouds.mp4')
    p_img = frame(0, frames, tw, th)
    p_img.save('public/assets/aeris/aeris-about-poster.webp', quality=90)
    print("Saved aeris-about-poster.webp")

# 4. aeris-trace-topography.webp (1920x1280)
def generate_topography():
    W, H = 1920, 1280
    img = Image.new('RGB', (W, H), (235, 232, 235))
    draw = ImageDraw.Draw(img)

    for c in range(26):
        center_x = W * 0.65
        center_y = H * 0.45
        r_base = 60 + c * 48
        points = []
        steps = 120
        for s in range(steps + 1):
            theta = (s / steps) * 2 * math.pi
            noise = math.sin(theta * 3.5 + c * 0.2) * 25 + math.cos(theta * 6 + c * 0.4) * 15
            r = r_base + noise
            x = center_x + math.cos(theta) * r * 1.3
            y = center_y + math.sin(theta) * r * 0.85
            points.append((x, y))
        col = 205 - (c % 5) * 8
        draw.line(points, fill=(col, col, col + 2), width=1 if c % 4 != 0 else 2)

    rng = random.Random(1337)
    for _ in range(800):
        px = rng.randint(0, W - 1)
        py = rng.randint(0, H - 1)
        gray = rng.randint(185, 220)
        draw.point((px, py), fill=(gray, gray, gray))

    for c in range(14):
        center_x = W * 0.2
        center_y = H * 0.8
        r_base = 40 + c * 40
        points = []
        for s in range(90 + 1):
            theta = (s / 90) * 2 * math.pi
            noise = math.sin(theta * 4 + c * 0.3) * 20
            r = r_base + noise
            x = center_x + math.cos(theta) * r * 1.1
            y = center_y + math.sin(theta) * r * 0.9
            points.append((x, y))
        col = 210 - (c % 3) * 7
        draw.line(points, fill=(col, col, col), width=1)

    img.save('public/assets/aeris/aeris-trace-topography.webp', quality=90)
    print("Saved aeris-trace-topography.webp (1920x1280)")

# 5. aeris-sensor-field.mp4
def generate_sensor_field():
    w, h = 640, 360
    tw, th = 1280, 720
    frames = 45
    fps = 15
    rng = random.Random(99)

    particles = []
    for _ in range(110):
        particles.append({
            'x': rng.uniform(0, w),
            'y': rng.uniform(0, h),
            'vx': rng.uniform(1.5, 4.0),
            'vy': rng.uniform(-0.5, 0.5),
            'size': rng.uniform(1.0, 2.5),
            'is_orange': rng.random() < 0.12,
            'pulse_phase': rng.uniform(0, math.pi * 2)
        })

    def frame(i, total, cur_w, cur_h):
        t = i / total
        tau = 2 * math.pi * t
        
        img = Image.new('RGB', (cur_w, cur_h), (12, 14, 18))
        draw = ImageDraw.Draw(img)

        scan_x = cur_w * (0.3 + 0.4 * ((math.sin(tau) + 1) / 2))
        draw.rectangle([scan_x - 20, 0, scan_x + 20, cur_h], fill=(16, 24, 30))
        draw.rectangle([scan_x - 3, 0, scan_x + 3, cur_h], fill=(30, 50, 65))
        draw.line([(scan_x, 0), (scan_x, cur_h)], fill=(70, 130, 160), width=1)

        for p in particles:
            px = (p['x'] + p['vx'] * i * 3) % cur_w
            py = (p['y'] + p['vy'] * i * 3) % cur_h
            sz = p['size']

            dist_to_scan = abs(px - scan_x)
            illum = max(0.0, 1.0 - dist_to_scan / 80.0)

            if p['is_orange']:
                col = (int(246 * (0.4 + illum * 0.6)), int(67 * (0.4 + illum * 0.6)), 2)
            else:
                lum = int(80 + illum * 150)
                col = (lum, lum + 5, lum + 15)

            draw.ellipse([px - sz, py - sz, px + sz, py + sz], fill=col)

        return img

    make_video_from_frames(frame, frames, fps, w, h, tw, th, 'public/assets/aeris/aeris-sensor-field.mp4')
    p_img = frame(0, frames, tw, th)
    p_img.save('public/assets/aeris/aeris-sensor-poster.webp', quality=90)
    print("Saved aeris-sensor-poster.webp")

# 6. aeris-radar-close.mp4
def generate_radar():
    w, h = 480, 480
    tw, th = 720, 720
    frames = 45
    fps = 15

    rng = random.Random(77)
    grain_pts = [(rng.randint(0, w-1), rng.randint(0, h-1), rng.randint(25, 60)) for _ in range(250)]

    def frame(i, total, cur_w, cur_h):
        t = i / total
        tau = 2 * math.pi * t
        
        cx, cy = cur_w / 2, cur_h / 2
        img = Image.new('RGB', (cur_w, cur_h), (14, 15, 18))
        draw = ImageDraw.Draw(img)

        for r in [40, 90, 140, 190, 230]:
            draw.ellipse([cx - r, cy - r, cx + r, cy + r], outline=(35, 38, 44), width=1)

        draw.line([(cx - 235, cy), (cx + 235, cy)], fill=(32, 35, 40), width=1)
        draw.line([(cx, cy - 235), (cx, cy + 235)], fill=(32, 35, 40), width=1)

        sweep_angle = tau
        arm_x = cx + math.cos(sweep_angle) * 230
        arm_y = cy + math.sin(sweep_angle) * 230
        draw.line([(cx, cy), (arm_x, arm_y)], fill=(120, 130, 140), width=2)

        arc_steps = 20
        for s in range(arc_steps):
            a = sweep_angle - (s / arc_steps) * 0.8
            fade = (1.0 - s / arc_steps) * 0.25
            val = int(fade * 140)
            ax = cx + math.cos(a) * 220
            ay = cy + math.sin(a) * 220
            draw.line([(cx, cy), (ax, ay)], fill=(val, val + 5, val + 10), width=2)

        for gx, gy, gval in grain_pts:
            draw.point((gx, gy), fill=(gval, gval, gval + 4))

        draw.ellipse([cx - 10, cy - 10, cx + 10, cy + 10], outline=(150, 160, 170), width=2)
        draw.ellipse([cx - 3, cy - 3, cx + 3, cy + 3], fill=(220, 225, 230))

        return img

    make_video_from_frames(frame, frames, fps, w, h, tw, th, 'public/assets/aeris/aeris-radar-close.mp4')
    p_img = frame(0, frames, tw, th)
    p_img.save('public/assets/aeris/aeris-radar-poster.webp', quality=90)
    print("Saved aeris-radar-poster.webp")

if __name__ == '__main__':
    generate_hero()
    generate_about()
    generate_topography()
    generate_sensor_field()
    generate_radar()
    print("All assets successfully generated!")
