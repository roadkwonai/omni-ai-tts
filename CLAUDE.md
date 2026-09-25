<!-- bts-template:start -->
@AGENTS.md

## Claude Code 전용
- 에이전트는 Agent 도구로 부른다: `subagent_type`은 `bts-implementer` 또는 `bts-reviewer`. 리뷰 프롬프트에는 focus, 기준 SHA(`tasks/todo.md` 마커의 base), 파일 목록을 넣는다.
- impeccable `critique`처럼 서브에이전트를 스스로 띄우는 스킬은 메인 세션에서 실행한다.
- superpowers 스킬은 `superpowers:` 접두어로 부른다 (예: `superpowers:brainstorming`).
<!-- bts-template:end -->
