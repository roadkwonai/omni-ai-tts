-- 대본 보관함 검색(T12, ADR 0010). 제목·본문 ILIKE '%…%'를 GIN 트라이그램 인덱스로 받는다. 다음 마이그레이션의 gin_trgm_ops 인덱스보다 먼저 적용돼야 한다
CREATE EXTENSION IF NOT EXISTS pg_trgm;
