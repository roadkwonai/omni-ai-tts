import { ownerEmailFrom } from "@tts-pilot-app/api/owner";
import {
	createOwnerAccount,
	isLocalDatabaseUrl,
	OwnerCleanupError,
	passwordProblem,
} from "@tts-pilot-app/api/owner-setup";
import { createAuth } from "@tts-pilot-app/auth";
import { createDb } from "@tts-pilot-app/db";

// 소유자 계정을 로컬 DB에 만들고 local-admin 데이터를 옮긴다(T14 스펙 6절). env는 varlock run이 process.env로 준다.
// 비밀번호·해시·주소는 출력하지 않는다.

const fail = (message: string): never => {
	console.error(message);
	process.exit(1);
};

// 터미널에서 한 줄 읽기. hidden이면 화면에 찍지 않는다. Ctrl+C는 터미널 상태를 돌리고 끝낸다.
function ask(label: string, hidden: boolean): Promise<string> {
	const { stdin, stdout } = process;
	stdout.write(label);
	stdin.setRawMode(true);
	stdin.resume();
	stdin.setEncoding("utf8");
	return new Promise((resolve) => {
		// shortcut: TTY에서 여러 줄 붙여넣기는 첫 줄만 받는다, 필요해지면 남은 chunk를 다음 입력으로 넘긴다
		let line = "";
		const onData = (chunk: string) => {
			for (const ch of chunk) {
				if (ch === "\u0003") {
					stdin.setRawMode(false);
					stdout.write("\n");
					process.exit(130);
				}
				if (ch === "\r" || ch === "\n") {
					stdin.off("data", onData);
					stdin.setRawMode(false);
					stdin.pause();
					stdout.write("\n");
					return resolve(line);
				}
				if (ch === "\u007f") {
					if (line.length > 0 && !hidden) stdout.write("\b \b");
					line = line.slice(0, -1);
				} else if (ch >= " ") {
					line += ch;
					if (!hidden) stdout.write(ch);
				}
			}
		};
		stdin.on("data", onData);
	});
}

async function readInput() {
	if (process.stdin.isTTY) {
		return {
			email: await ask("이메일: ", false),
			password: await ask("비밀번호(12자 이상): ", true),
			again: await ask("비밀번호 다시: ", true),
		};
	}
	let raw = "";
	for await (const chunk of process.stdin) raw += chunk;
	const [email = "", password = "", again = ""] = raw.split(/\r?\n/);
	return { email, password, again };
}

// 오류 문구의 첫 줄만, 주소 모양은 가린다.
const safeMessage = (error: unknown) =>
	(error instanceof Error ? error.message : String(error))
		.split("\n")[0]
		.replace(/\w+:\/\/\S+/g, "<주소>");

async function main() {
	const env = process.env;
	if (env.NODE_ENV === "production")
		fail("production에서는 계정을 만들 수 없어요.");
	const { DATABASE_URL, BETTER_AUTH_URL, BETTER_AUTH_SECRET } = env;
	if (!DATABASE_URL || !isLocalDatabaseUrl(DATABASE_URL))
		fail("로컬 DB에서만 계정을 만들 수 있어요.");
	if (!BETTER_AUTH_URL || !BETTER_AUTH_SECRET)
		fail("BETTER_AUTH_URL과 BETTER_AUTH_SECRET이 필요해요.");
	const owner = ownerEmailFrom(env.OWNER_EMAILS);
	if (!owner.email)
		fail(
			owner.tooMany
				? "OWNER_EMAILS에 이메일이 둘 이상이에요. 소유자 이메일 하나만 넣어 주세요."
				: "OWNER_EMAILS에 소유자 이메일 하나를 넣어 주세요.",
		);

	const input = await readInput();
	const email = input.email.trim().toLowerCase();
	if (email !== owner.email) fail("OWNER_EMAILS의 이메일과 달라요.");
	const problem = passwordProblem(input.password, input.again);
	if (problem) fail(problem);

	// 위 fail은 never라 좁혀지지 않는 값들을 여기서 확정한다.
	const db = createDb({ DATABASE_URL: DATABASE_URL as string });
	try {
		const ctx = await createAuth(
			{
				BETTER_AUTH_URL: BETTER_AUTH_URL as string,
				BETTER_AUTH_SECRET: BETTER_AUTH_SECRET as string,
			},
			db,
		).$context;
		if (await ctx.internalAdapter.findUserByEmail(email))
			fail("이미 있는 계정이에요. 바꾸지 않았어요.");
		const { moved } = await createOwnerAccount(ctx, db, {
			email,
			name: email.split("@")[0],
			password: input.password,
		});
		console.log("계정을 만들었어요.");
		for (const [table, count] of Object.entries(moved))
			console.log(`${table}: ${count}`);
	} catch (error) {
		console.error(`계정을 만들지 못했어요: ${safeMessage(error)}`);
		if (error instanceof OwnerCleanupError)
			console.error(
				"만든 계정을 지우지 못했어요. docs/owner-account.md의 복구 절차를 따라 주세요.",
			);
		process.exitCode = 1;
	} finally {
		await db.$client.end();
	}
}

void main();
