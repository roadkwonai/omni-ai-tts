# 0006. 작업실 결과 오디오는 생성 기록에 두고 3MiB씩 나눠 받는다

- 상태: 결정(2026-10-20). 관련: [T9 스펙](../plans/tasks/T09-studio-typecast.md) 2·3절, [ADR 0002](0002-orpc-only-api.md), [ADR 0003](0003-postgres-cache.md).

## 맥락
- 음성 작업실(T9)의 2,000자 대본은 MP3(Typecast 320kbps)로 12~16MB로 추정된다. 배포 환경의 함수 응답은 4.5MB를 넘을 수 없고 스트리밍에도 같은 상한이 걸린다(Vercel 공식 문서). API는 `/api/rpc` 하나로만 둔다(ADR 0002, `tts-provider`의 오디오 입출력 절).
- 영구 저장소(Vercel Blob 등, 백로그 P1-02)는 아직 정하지 않았다.

## 결정
- 결과 오디오를 생성 기록 `trial_generation.audio`(bytea)에 두고 저장 방식을 `EXTERNAL`로 바꾼다(마이그레이션 `studio_audio_storage`). 압축하지 않은 TOAST라 `substring`으로 조각을 읽을 때 앞부분을 풀지 않는다.
- `studioCreate`는 오디오를 돌려주지 않고 `{ id, createdAt, usage, bytes }`만 돌려준다. 화면이 `studioAudio`(`{ id, part }`)로 3MiB(`STUDIO_PART_BYTES`) 조각을 순서대로 받아 합쳐 재생하고 내려받는다(스펙 2절 A안).
- 작업실 결과는 32MiB(`STUDIO_AUDIO_MAX`)까지, 내 문장 결과와 같은 30일(마지막 재생 기준) 보관한다. 넘는 오디오는 `audio_too_large`로 버린다.

## 버린 안
- Vercel Blob과 서명 주소: 새 서비스·계정·환경변수가 든다. 영구 보관을 정하는 P1-02에서 다시 본다.
- 스트리밍 응답: 4.5MB 상한은 스트리밍에도 걸린다.
- base64 JSON: 크기가 1.33배가 되어 조각 수만 늘어난다.

## 결과
- 큰 오디오가 DB에 쌓인다. 운영 저장 용량과 보관 기간은 T15·P1-02에서 정한다.
- 조각 읽기 비용을 테스트 DB(로컬 Postgres, node-postgres)에서 쟀다(Task 1 Step 7). 컬럼 `attstorage`는 `e`(EXTERNAL)다. 16MiB 완료 쓰기 335ms, 조각 하나 4ms였다. 32MiB 완료 쓰기 561ms, 조각 하나 7ms, 조각 전부 105ms였다. 앱의 질의 제한(`query_timeout` 3초)에 여유가 있다. Neon에서는 아직 재지 않았다(T15에서 다시 잰다).
- 늦은 결과 저장은 서버 프로세스가 살아 있어야 한다. 배포 환경에서는 `after`와 함수 최대 실행 시간이 필요하다(T15).
- 조각 받기는 결과 하나를 열 때마다 그 크기만큼 송신한다.

## ADR 0003과의 관계
- ADR 0003은 "오디오 저장이 약 500MB이거나 월 송신이 3GB에 가까워지면 오디오를 Vercel Blob(비공개)이나 Neon Object Storage로 옮긴다"를 다시 검토할 조건으로 두었다. 이 결정은 그 조건 안에서 한 선택이다.
- 500MB는 내 문장과 작업실 결과를 합친 `trial_generation.audio` 전체로 센다. 2,000자 결과가 12~16MB로 추정되므로 30일 안에 약 35개면 닿는다.
- 확인 질의: `select pg_size_pretty(sum(octet_length(audio))) from trial_generation`.
- 조건에 닿으면 이 ADR을 대체하는 새 ADR로 옮긴다(T15·P1-02).
