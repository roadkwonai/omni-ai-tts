import { PROOF_TEXT, PROVIDERS } from "@/lib/landing-content";

// 증명 띠(브리프 3절 2번): 서비스 다섯 이름과 받는 형식 한 줄. 글자만, 로고 이미지 없음. 이름은 번역하지 않는다
export function ProofBand() {
	return (
		<section
			aria-label="지원하는 음성 서비스와 받는 형식"
			className="border-border border-y bg-card py-4"
		>
			{/* 안쪽 틀은 Section과 같은 max-w-5xl·px-4 md:px-8이라 왼쪽 선이 본문 제목과 같다 */}
			<div className="mx-auto flex max-w-5xl flex-col items-center gap-2 px-4 text-center md:flex-row md:justify-between md:px-8 md:text-left">
				<ul className="flex flex-wrap justify-center gap-x-5 gap-y-1 font-bold">
					{PROVIDERS.map((name) => (
						<li key={name} translate="no">
							{name}
						</li>
					))}
				</ul>
				<p className="text-pretty break-keep text-muted-foreground">
					{PROOF_TEXT}
				</p>
			</div>
		</section>
	);
}
