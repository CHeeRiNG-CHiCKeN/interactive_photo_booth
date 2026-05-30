# -*- coding: utf-8 -*-
from image_loader import load_images_from_paths
from frame_merger import merge_four_cuts
from result_saver import save_result


def run_four_cut_pipeline(raw_photo_paths, frame_design_path, output_file):
    images_in_memory = load_images_from_paths(raw_photo_paths)
    print(f"[1] 이미지 {len(images_in_memory)}장 로드 완료")

    merged_frame = merge_four_cuts(
        images_in_memory,
        frame_design_path,
        margin_x=90,
        margin_top=100,
        margin_bottom=90,
        gap=25,
    )
    print("[2] 프레임 병합 완료")

    save_result(merged_frame, output_file)
    print("[3] 저장 완료")

# 예시 사용!!!!! 실제 파일 이름으로 수정
if __name__ == "__main__":
    run_four_cut_pipeline(
        raw_photo_paths=[
            "내사진1.jpg",
            "내사진2.jpg",
            "내사진3.jpg",
            "내사진4.jpg",
        ],
        frame_design_path="frame.png",
        output_file="결과물.jpg",
    )