import io
from PIL import Image


def load_images_from_paths(file_paths: list[str]) -> list[Image.Image]:
    """
    [로컬 파일용] 경로 리스트를 받아 PIL 이미지 객체 리스트로 불러옵니다.

    Args:
        file_paths: 이미지 파일 경로 리스트 (정확히 4개 권장)

    Returns:
        PIL Image 객체 리스트 (RGBA 모드)

    Raises:
        ValueError: 이미지 수가 4장이 아닐 경우
        FileNotFoundError: 파일이 존재하지 않을 경우
    """
    if len(file_paths) != 4:
        raise ValueError(f"사진은 정확히 4장이어야 합니다. 현재: {len(file_paths)}장")

    loaded_photos = []
    for path in file_paths:
        img = Image.open(path).convert("RGBA")
        loaded_photos.append(img)

    return loaded_photos


def load_images_from_bytes(file_bytes_list: list[bytes]) -> list[Image.Image]:
    """
    [네트워크 서버용] 서버로 전송된 파일 바이너리 데이터를 PIL 이미지 객체로 불러옵니다.

    Args:
        file_bytes_list: 파일 바이너리 데이터 리스트 (정확히 4개 권장)

    Returns:
        PIL Image 객체 리스트 (RGBA 모드)

    Raises:
        ValueError: 이미지 수가 4장이 아닐 경우
    """
    if len(file_bytes_list) != 4:
        raise ValueError(f"사진은 정확히 4장이어야 합니다. 현재: {len(file_bytes_list)}장")

    loaded_photos = []
    for file_bytes in file_bytes_list:
        img = Image.open(io.BytesIO(file_bytes)).convert("RGBA")
        loaded_photos.append(img)

    return loaded_photos
