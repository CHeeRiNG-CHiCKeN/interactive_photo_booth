from PIL import Image


def save_result(
    final_frame: Image.Image,
    output_path: str,
    quality: int = 95,
    bg_color: tuple[int, int, int] = (255, 255, 255),
) -> None:

    ext = output_path.rsplit(".", 1)[-1].lower()

    if ext in ("jpg", "jpeg"):
        # RGBA → RGB 변환: 투명 영역을 bg_color로 채워 알파 손실 방지
        background = Image.new("RGB", final_frame.size, bg_color)
        alpha_mask = final_frame.split()[3]  # 알파 채널을 마스크로 사용
        background.paste(final_frame, mask=alpha_mask)
        background.save(output_path, "JPEG", quality=quality)

    elif ext == "png":
        # PNG는 RGBA 그대로 저장 (투명도 보존)
        final_frame.save(output_path, "PNG")

    else:
        raise ValueError(f"지원하지 않는 파일 형식입니다: .{ext}  (jpg, jpeg, png만 지원)")

    print(f"🎉 네 컷 사진 저장 완료: {output_path}")
