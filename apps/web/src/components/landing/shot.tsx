import { cn } from "@tts-pilot-app/ui/lib/utils";
import Image from "next/image";

import type { Shot as ShotData, ShotFile } from "@/lib/landing-content";

// 라이트·다크 한 쌍을 테마로 바꾼다. 숨은 쪽은 display:none이라 lazy 이미지를 받지 않는다.
// 너비·높이 속성이 비율 자리를 잡아 늦게 와도 흔들리지 않는다.
function Pair({
	file,
	alt,
	sizes,
}: {
	file: ShotFile;
	alt: string;
	sizes: string;
}) {
	return (
		<>
			<Image
				src={file.light}
				alt={alt}
				width={file.width}
				height={file.height}
				sizes={sizes}
				className="h-auto w-full dark:hidden"
			/>
			<Image
				src={file.dark}
				alt={alt}
				width={file.width}
				height={file.height}
				sizes={sizes}
				className="hidden h-auto w-full dark:block"
			/>
		</>
	);
}

// 공개 데모에서 찍은 화면 크롭(브리프 6절). 767px 이하는 글자가 읽히게 핵심 영역만 찍은 휴대폰 판,
// 그 위는 넓은 판이다. 확대 보기 없음.
// sizes는 넓은 판의 것이고, 휴대폰 판은 화면 폭(100vw)이다.
export function Shot({
	shot,
	sizes,
	className,
}: {
	shot: ShotData;
	sizes: string;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"overflow-hidden rounded-xl bg-card ring-1 ring-border",
				className,
			)}
		>
			<div className="md:hidden">
				<Pair file={shot.mobile} alt={shot.alt} sizes="100vw" />
			</div>
			<div className="hidden md:block">
				<Pair file={shot} alt={shot.alt} sizes={sizes} />
			</div>
		</div>
	);
}
