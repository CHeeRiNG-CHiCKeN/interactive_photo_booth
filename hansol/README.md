# Hansol's Progress - 최종 이미지 4분할로 만들기

## 📸 AI Photo Booth - Four Cuts Frame Merger (5/30)

AI 포토부스 프로젝트에서 촬영 및 변환이 완료된 **개별 사진 4장을 하나의 네 컷 프레임 이미지로 자동 병합**하는 핵심 백엔드 기능



## ✨ 핵심 기능 (Key Features)

### 1. 멀티 인풋 이미지 로더 (`image_loader.py`)
- **듀얼 소스 로드**: 로컬 파일 경로(`str`) 및 서버 API 전송용 바이너리 데이터(`bytes`) 모두 지원
- **엄격한 수량 검증**: 입력된 사진이 정확히 4장이 아닐 경우 예외(`ValueError`) 처리

### 2. 수학적 비율 보정 및 병합 (`frame_merger.py`)
- **EXIF 회전 보정**: 메타데이터(Orientation)를 파싱하여 누워 있는 사진을 정방향으로 자동 회전
- **지능형 중앙 크롭**: 원본 종횡비와 프레임 창 비율을 비교 계산하여 찌그러짐 없는 최적의 Center Crop 적용
- **동적 Y축 좌표 연산**: 고정 픽셀(하드코딩) 없이 상하좌우 여백과 간격을 기반으로 부착 위치 및 높이 자동 계산
- **촬영 일자 각인**: EXIF 데이터에서 촬영 날짜를 추출하여 프레임 하단에 텍스트 인쇄

### 3. 알파 채널 보존 익스포터 (`result_saver.py`)
- **JPEG 알파 깨짐 방지**: 투명도(`RGBA`)가 있는 이미지를 `JPEG`로 변환할 때 배경이 검게 타는 현상을 막기 위해 흰색 배경 마스킹 합성 적용
- **확장자 자동 분기**: 저장 경로명 확장자를 판별하여 `.jpg`(배경 합성 후 압축)와 `.png`(투명도 보존) 포맷으로 전석 분기 처리



## 📂 프로젝트 구조 (Directory Structure)

```markdown
├── main.py            [전체 파이프라인 제어 및 실행 메인 스크립트]
├── image_loader.py    [로컬 경로 파일 / 네트워크 바이너리 데이터 로드]
├── frame_merger.py    [EXIF 보정, 가로세로 중앙 크롭, 동적 4분할 병합]
└── result_saver.py    [확장자 분기 및 JPEG 알파 채널 보정 저장]
```



## 🚀 실행 방법 (How to Run)

### 1️⃣ 필수 라이브러리 설치
프로젝트 실행에 필요한 이미지 처리 라이브러리 `Pillow`를 설치한다. 
```bash
pip install Pillow
```

### 2️⃣ 프로젝트 다운로드 및 파일 배치
```text
작업_폴더/
├── image_loader.py    # [기능 1] 사진 로드 모듈
├── frame_merger.py    # [기능 2] 네 컷 병합 및 조절 모듈
├── result_saver.py    # [기능 3] 결과물 인코딩 및 저장 모듈
├── main.py            # 파이프라인 제어 및 실행 스크립트
├── frame.png          # 배경으로 사용할 네 컷 프레임 파일 (1080x1920 권장)
└── shot1.jpg, shot2.jpg, shot3.jpg, shot4.jpg  # 테스트용 원본 사진 4장 (4:3 비율 권장)
```

### 3️⃣ 메인 스크립트(main.py) 파일 설정

main.py 파일 안의 하단의 main 블록에 실제 이미지 파일 이름을 매칭한다. 
``` python
if __name__ == "__main__":
    run_four_cut_pipeline(
        raw_photo_paths=[
            "shot1.jpg",  # 첫 번째 사진 파일명
            "shot2.jpg",  # 두 번째 사진 파일명
            "shot3.jpg",  # 세 번째 사진 파일명
            "shot4.jpg"   # 네 번째 사진 파일명
        ],
        frame_design_path="frame.png",      # 템플릿 프레임 파일명
        output_file="result_four_cuts.jpg"  # 최종 내보낼 파일명
    )
```

### 4️⃣ 이후 main.py 실행 후 최종 결과 확인



## 👀 예시 실행 결과 
사진 크기는 4:3 비율로 진행 

<table>
  <tr>
    <td width="50%" valign="top" align="center">

### 프레임 예시


<img width="80%" alt="frame" src="https://github.com/user-attachments/assets/8895bf84-e393-41f2-ba41-3f136862098d" />

  </td>
    <td width="50%" valign="top" align="center">

### 결과 예시 


<img width="80%" alt="결과물" src="https://github.com/user-attachments/assets/50974d67-74a2-4cef-a08b-ada3422f0c91" />

  </td>
  </tr>
</table>

