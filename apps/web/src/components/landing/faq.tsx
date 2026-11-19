"use client";

import {
	Accordion,
	AccordionHeader,
	AccordionItem,
	AccordionPanel,
	AccordionTrigger,
} from "@ui-sdk/react/accordion";
import { ChevronDown } from "lucide-react";

import { FAQ_ITEMS } from "@/lib/landing-faq";

// FAQ 펼침(UI SDK Accordion: 키보드·aria-expanded는 라이브러리, 높이 애니메이션과 모양은 landing.css·토큰).
// 포커스 링은 안쪽(-outline-offset-2)이라 위 구분선·옆 여백과 겹치지 않고, -mx-3 px-3로 글자 줄은 제목과 같은 선에 둔다.
// 같은 글을 page.tsx의 FAQPage JSON-LD도 쓴다. 첫 항목은 펼쳐 두어 접힌 줄만 이어지는 벽을 깬다.
const OPEN_FIRST = FAQ_ITEMS.slice(0, 1).map((item) => item.question);

export function Faq() {
	return (
		<Accordion defaultValue={OPEN_FIRST}>
			{FAQ_ITEMS.map((item) => (
				<AccordionItem
					key={item.question}
					value={item.question}
					className="border-border border-b"
				>
					<AccordionHeader className="m-0">
						<AccordionTrigger className="group/trigger -mx-3 flex min-h-14 min-w-0 items-center justify-between gap-4 rounded-lg px-3 py-4 text-left font-bold text-lg -outline-offset-2 transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-ring">
							<span className="wrap-anywhere min-w-0 text-balance break-keep">
								{item.question}
							</span>
							<span
								aria-hidden="true"
								className="shrink-0 transition-transform duration-200 ease-out group-data-[open]/trigger:rotate-180"
							>
								<ChevronDown className="size-5" />
							</span>
						</AccordionTrigger>
					</AccordionHeader>
					<AccordionPanel className="landing-faq-panel">
						<p className="max-w-prose text-pretty break-keep pb-5 text-muted-foreground">
							{item.answer}
						</p>
					</AccordionPanel>
				</AccordionItem>
			))}
		</Accordion>
	);
}
