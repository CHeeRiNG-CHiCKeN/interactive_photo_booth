# -*- coding: utf-8 -*-
from datetime import datetime
from PIL import Image, ImageDraw, ImageFont, ExifTags


def fix_orientation(img: Image.Image) -> Image.Image:
    """EXIF orientation 태그를 읽어 사진을 올바른 방향으로 회전합니다."""
    try:
        exif = img._getexif()
        if not exif:
            return img
        orientation_key = next(
            k for k, v in ExifTags.TAGS.items() if v == "Orientation"
        )
        orientation = exif.get(orientation_key)
        if orientation == 3:
            img = img.rotate(180, expand=True)
        elif orientation == 6:
            img = img.rotate(270, expand=True)
        elif orientation == 8:
            img = img.rotate(90, expand=True)
    except Exception:
        pass
    return img


def crop_to_fit(img: Image.Image, target_w: int, target_h: int) -> Image.Image:
    """비율을 유지하면서 target 크기에 맞게 중앙 크롭합니다."""
    src_w, src_h = img.size
    src_ratio = src_w / src_h
    tgt_ratio = target_w / target_h

    if src_ratio > tgt_ratio:
        # 좌우가 남음 -> 높이 맞추고 좌우 크롭
        new_h = src_h
        new_w = int(src_h * tgt_ratio)
    else:
        # 위아래가 남음 -> 너비 맞추고 위아래 크롭
        new_w = src_w
        new_h = int(src_w / tgt_ratio)

    left = (src_w - new_w) // 2
    top  = (src_h - new_h) // 2
    img  = img.crop((left, top, left + new_w, top + new_h))
    return img.resize((target_w, target_h), Image.Resampling.LANCZOS)


def get_shoot_date(photos: list) -> str:
    """EXIF 촬영 날짜 추출, 없으면 오늘 날짜 반환."""
    for photo in photos:
        try:
            exif_data = photo._getexif()
            if exif_data:
                date_str = exif_data.get(36867) or exif_data.get(306)
                if date_str:
                    dt = datetime.strptime(date_str, "%Y:%m:%d %H:%M:%S")
                    return dt.strftime("%Y. %m. %d")
        except Exception:
            continue
    return datetime.today().strftime("%Y. %m. %d")


def merge_four_cuts(
    loaded_photos: list,
    frame_path: str,
    margin_x: int = 90,
    margin_top: int = 100,
    margin_bottom: int = 90,
    gap: int = 25,
) -> Image.Image:
    if len(loaded_photos) != 4:
        raise ValueError(f"사진은 정확히 4장이어야 합니다. 현재: {len(loaded_photos)}장")

    frame = Image.open(frame_path).convert("RGBA")
    frame_w, frame_h = frame.size

    photo_w = frame_w - margin_x * 2
    total_gap = gap * (len(loaded_photos) - 1)
    photo_h = (frame_h - margin_top - margin_bottom - total_gap) // len(loaded_photos)

    for i, photo in enumerate(loaded_photos):
        # 1. 방향 보정
        photo = fix_orientation(photo)
        # 2. 비율 유지 중앙 크롭
        photo_fitted = crop_to_fit(photo, photo_w, photo_h)
        photo_fitted = photo_fitted.convert("RGBA")

        current_y = margin_top + i * (photo_h + gap)
        mask = photo_fitted.split()[3]
        frame.paste(photo_fitted, (margin_x, current_y), mask)

    # 날짜 텍스트
    draw = ImageDraw.Draw(frame)
    try:
        font = ImageFont.truetype("C:/Windows/Fonts/malgun.ttf", 20)
    except Exception:
        font = ImageFont.load_default()

    date_str = get_shoot_date(loaded_photos)
    last_bottom = margin_top + len(loaded_photos) * photo_h + (len(loaded_photos) - 1) * gap
    date_y = last_bottom + (frame_h - last_bottom) // 2

    TEXT_COLOR = (180, 178, 175, 255)
    draw.text((frame_w // 2, date_y), date_str, font=font, fill=TEXT_COLOR, anchor="mm")

    return frame