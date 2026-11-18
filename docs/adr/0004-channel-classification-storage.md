# 0004. 채널과 분류(카테고리·타입)의 저장 구조, 소유자 외래 키 보류

- 상태: 확정(2026-10-06, 사용자). 관련: [T6 스펙](../plans/tasks/T06-channels-and-classifications.md) 2·3절.

## 결정
- 채널은 `channel` 표에 따로 둔다. 카테고리·타입은 `classification` 표 하나에 `kind`('category'·'type')로 둔다.
- 같은 소유자·같은 그룹 안에서 이름은 대소문자를 무시하고 유일하다(`lower(name)` 유니크 인덱스 `channel_name`·`classification_name`). 이 인덱스 위반만 `CONFLICT`로 알린다.
- 소유자 컬럼 `owner_id`에 `user` 외래 키를 걸지 않는다.

## 이유
- 채널에만 붙는 것이 있다: URL, 기본 프리셋(REQ-08), 프리셋·저장 대본의 선택 채널(REQ-06·08). 한 표에 섞으면 "채널만 가리키는" 외래 키를 걸 수 없다(One True Lookup Table 문제). 카테고리·타입은 이름·메모뿐인 N:M 이름표라 한 표가 맞다.
- 하나만 고르는 단위와 여러 개 붙이는 라벨을 다른 자원으로 두는 것이 흔하다(GitHub milestone·labels, Todoist project·labels).
- 지금 소유자는 로컬 관리자 고정 문자열 `local-admin`이고 `user` 행이 없다. 가짜 사용자 행보다 T14 로그인 때 `owner_id`를 옮기는 갱신 한 번이 단순하다.

## 결과
- T7 성우 연결은 `channel`·`classification` 각각에 연결 표(`saved_voice_channel`·`saved_voice_classification`)를 두고, 양쪽 외래 키(성우 쪽과 채널·분류 쪽)에 `on delete cascade`, 채널·분류 쪽 id 인덱스를 건다. 채널이나 분류를 지우면 연결만 풀리고 성우는 남는다. 성우 쪽 `saved_voice.owner_id`에도 `user` 외래 키를 걸지 않는다. 연결 표에는 소유자 컬럼이 없어, 연결할 때 `savedVoiceLinks`가 그 채널·분류가 같은 소유자 것인지 검사한다(남의 id나 없는 id면 `NOT_FOUND`, 담기까지 되돌린다). 연결 수는 `channelList`·`classificationList`의 `voiceCount`다. 그 검사가 연결이 생기는 유일한 길이라 연결 행 수가 곧 내 성우 수다.
- T8 프리셋·T12 대본은 `channel`을 일반 외래 키(`on delete set null`)로 가리킨다.
- T14는 `channel`·`classification`·`trial_generation`·`saved_voice`의 `owner_id`를 실제 사용자 id로 옮기고, 그때 외래 키를 걸지 정한다. → 정함: [ADR 0012](0012-session-owner-single-allowlist.md)(외래 키 없음, 계정 만들 때 뒤에 생긴 표까지 7개 표 이전).
- 버린 안: 한 표(채널 참조마다 앱 검사 또는 `(id, kind)` 복합 외래 키), 세 표(같은 CRUD와 연결 표가 세 벌).
