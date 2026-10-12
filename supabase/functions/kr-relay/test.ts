// kr-relay 점검(네트워크 없음): deno test --allow-env supabase/functions/kr-relay/
// GitHub 공개키·청빙 사이트 응답은 가짜로 바꿔 끼우고, 권한·허용 목록·넘겨주기·크기 제한을 확인한다.
Deno.env.set("KR_RELAY_TEST", "1");
Deno.env.set("SB_REGION", "ap-northeast-2");
const { handle } = await import("./index.ts");

const enc = (o: unknown) => btoa(typeof o === "string" ? o : JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const kp = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
const pub = { ...(await crypto.subtle.exportKey("jwk", kp.publicKey)), kid: "k1", use: "sig", alg: "RS256" };
async function token(claims: Record<string, unknown> = {}, kid = "k1") {
  const now = Math.floor(Date.now() / 1000);
  const body = { iss: "https://token.actions.githubusercontent.com", aud: "dongyeok-kr-relay", repository_id: "1415107065", ref: "refs/heads/main", iat: now, nbf: now - 5, exp: now + 300, ...claims };
  const si = enc({ alg: "RS256", kid, typ: "JWT" }) + "." + enc(body);
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", kp.privateKey, new TextEncoder().encode(si)));
  return si + "." + enc(String.fromCharCode(...sig));
}

const seen: { url: string; method: string; ua: string | null; headers: Headers }[] = [];
globalThis.fetch = (async (input: string | URL | Request, init: RequestInit = {}) => {
  const u = new URL(String(input instanceof Request ? input.url : input));
  if (u.href === "https://token.actions.githubusercontent.com/.well-known/jwks") return Response.json({ keys: [pub] });
  const h = new Headers(init.headers);
  seen.push({ url: u.href, method: init.method || "GET", ua: h.get("user-agent"), headers: h });
  if (u.pathname === "/hop") return new Response(null, { status: 302, headers: { location: "/robots.txt" } });
  if (u.pathname === "/away") return new Response(null, { status: 302, headers: { location: "https://evil.example/x" } });
  if (u.pathname === "/big") return new Response(new Uint8Array(5 * 1024 * 1024));
  if (u.pathname === "/euc") return new Response(new Uint8Array([0xc3, 0xbb, 0xba, 0xf9]), { headers: { "content-type": "text/html; charset=euc-kr" } });
  return new Response("User-agent: *\nDisallow:\n", { headers: { "content-type": "text/plain" } });
}) as typeof fetch;

const call = async (job: unknown, tok?: string, method = "POST") =>
  handle(new Request("https://relay.test/kr-relay", { method, headers: tok ? { "x-gh-oidc": tok } : {}, body: method === "POST" ? JSON.stringify(job) : undefined }));
const err = async (r: Response) => decodeURIComponent(r.headers.get("x-relay-error") || "");
const eq = (a: unknown, b: unknown, msg = "") => { if (a !== b) throw new Error(`${msg} 기대 ${b} / 실제 ${a}`); };

Deno.test("토큰 없으면 거절", async () => {
  const r = await call({ url: "https://www.mokwon.ac.kr/robots.txt" });
  eq(r.status, 401);
  eq(seen.length, 0, "사이트에 요청하지 않아야 함");
});
Deno.test("다른 저장소·다른 브랜치·만료·용도 불일치·모르는 키는 거절", async () => {
  for (const [claims, kid, why] of [
    [{ repository_id: "1" }, "k1", "다른 저장소"],
    [{ ref: "refs/heads/dev" }, "k1", "main이 아닌 브랜치"],
    [{ exp: Math.floor(Date.now() / 1000) - 120 }, "k1", "만료"],
    [{ aud: "other" }, "k1", "aud"],
    [{}, "nokey", "모르는 서명 키"],
  ] as const) {
    const r = await call({ url: "https://www.mokwon.ac.kr/robots.txt" }, await token(claims, kid));
    eq(r.status, 401, why);
    if (!(await err(r)).includes(why)) throw new Error(`사유에 "${why}"가 없음: ${await err(r)}`);
  }
  const bad = (await token()).replace(/\.[^.]+$/, ".AAAA");
  eq((await call({ url: "https://www.mokwon.ac.kr/robots.txt" }, bad)).status, 401, "위조 서명");
});
Deno.test("서울이 아니면 거절", async () => {
  Deno.env.set("SB_REGION", "us-east-1");
  const r = await call({ url: "https://www.mokwon.ac.kr/robots.txt" }, await token());
  Deno.env.set("SB_REGION", "ap-northeast-2");
  eq(r.status, 421);
});
Deno.test("허용한 사이트 GET은 식별 UA로 중계하고 원래 상태·형식을 돌려줌", async () => {
  seen.length = 0;
  const r = await call({ url: "https://www.daeshin.ac.kr/euc", headers: { "User-Agent": "Mozilla/5.0", Referer: "https://www.daeshin.ac.kr/", Cookie: "x=1" } }, await token());
  eq(r.status, 200);
  eq(r.headers.get("x-upstream-status"), "200");
  eq(r.headers.get("x-upstream-type"), "text/html; charset=euc-kr");
  eq(new Uint8Array(await r.arrayBuffer()).length, 4, "바이트 그대로");
  eq(seen[0].ua?.startsWith("dongyeok-jobs-bot/1.0"), true, "UA를 바꾸지 않음");
  eq(seen[0].headers.get("cookie"), null, "허용하지 않은 헤더는 버림");
  eq(seen[0].headers.get("referer"), "https://www.daeshin.ac.kr/");
});
Deno.test("허용하지 않은 사이트·POST·메서드는 거절", async () => {
  seen.length = 0;
  const t = await token();
  eq((await call({ url: "https://example.com/" }, t)).status, 403, "다른 사이트");
  eq((await call({ url: "https://www.mokwon.ac.kr/x", method: "POST", body: "a=1" }, t)).status, 403, "POST 비허용 주소");
  eq((await call({ url: "https://www.mokwon.ac.kr/x", method: "DELETE" }, t)).status, 403, "DELETE");
  eq((await call({ url: "file:///etc/passwd" }, t)).status, 403, "file 주소");
  eq(seen.length, 0, "사이트에 요청하지 않아야 함");
  const ok = await call({ url: "https://www.csu.ac.kr/api/user/board/getBoardContentSummaryList", method: "POST", body: "page=1", headers: { "Content-Type": "application/x-www-form-urlencoded" } }, t);
  eq(ok.headers.get("x-upstream-status"), "200", "총신대 목록 API POST는 허용");
  eq(seen[0].method, "POST");
});
Deno.test("넘겨주기는 허용 목록 안에서만 따라감", async () => {
  const t = await token();
  const r1 = await call({ url: "https://www.mokwon.ac.kr/hop" }, t);
  eq(r1.headers.get("x-upstream-status"), "200");
  eq(decodeURIComponent(r1.headers.get("x-upstream-url") || ""), "https://www.mokwon.ac.kr/robots.txt");
  const r2 = await call({ url: "https://www.mokwon.ac.kr/away" }, t);
  eq(r2.status, 403);
});
Deno.test("너무 큰 응답은 끊음", async () => {
  eq((await call({ url: "https://www.cjob.co.kr/big" }, await token())).status, 502);
});
