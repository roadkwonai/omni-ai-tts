-- 작업실 오디오(최대 32MiB)를 3MiB 조각으로 읽는다(T9 스펙 2절 A안). 압축하면 뒤 조각을 읽을 때 앞부분부터 풀어야 하므로
-- 압축 없이 TOAST 표에(본 행 밖) 둔다(Postgres 문서: EXTERNAL은 큰 bytea의 substring을 빠르게 한다). 이후 쓰는 값부터 적용된다
ALTER TABLE "trial_generation" ALTER COLUMN "audio" SET STORAGE EXTERNAL;
