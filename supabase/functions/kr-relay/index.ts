// 동역 · 서울 중계 함수(kr-relay) — Supabase Edge Function
//
// GitHub Actions(미국 서버)의 청빙 수집기가 해외 접속을 막는 출처에 접속할 때, 서울 리전에서 같은 식별 UA로
// 대신 요청하고 응답을 그대로 돌려준다. robots.txt 확인과 3초 간격은 수집기(scraper/lib.mjs)가 그대로 지킨다.
//  - 정해 둔 사이트(ALLOW)만 중계한다. GET만 받고, POST는 총신대 목록 API 한 곳만 받는다. 아무 주소나 받는 프록시가 아니다.
//  - 호출 권한은 이 저장소의 main 브랜치 GitHub Actions가 발급한 OIDC 토큰으로만 증명한다(따로 둔 비밀키 없음).
//  - 서울(ap-northeast-2)이 아닌 곳에서 실행되면 거절한다. 호출할 때 x-region 헤더로 서울을 지정해야 한다.
//  - 응답 본문은 저장하지 않고 넘기기만 한다. 로그에는 사이트·경로·상태·크기만 남긴다.
//
// 배포: Supabase 대시보드 → Edge Functions → kr-relay → Code에 이 파일 전체를 붙여 넣고 Deploy(docs/운영가이드.md 6-3).
// 점검: deno test supabase/functions/kr-relay/   (네트워크 없이)
// 출처를 더하거나 빼면 ALLOW와 수집기 소스의 viaKR 표시를 함께 고친다.

const UA = "dongyeok-jobs-bot/1.0 (+https://hyotowork-create.github.io/dongyeok/#pg-guide)";
const ISSUER = "https://token.actions.githubusercontent.com";
const AUDIENCE = "dongyeok-kr-relay";
const REPO_ID = "1415107065"; // hyotowork-create/dongyeok의 고유 번호(이름·소유자가 바뀌어도 그대로). 저장소를 새로 만들면 바꾼다
const BRANCH = "refs/heads/main";
const REGION = "ap-northeast-2";

const ALLOW: Record<string, { post?: string[]; extraCa?: boolean }> = {
  "www.csu.ac.kr": { post: ["/api/user/board/getBoardContentSummaryList"] }, // 총신대
  "www.daeshin.ac.kr": { extraCa: true }, // 대신대(서버가 중간 인증서를 빠뜨림)
  "www.mokwon.ac.kr": {}, // 목원대
  "www.cjob.co.kr": {}, // 기독정보넷
};
const PASS_HEADERS = ["content-type", "referer", "x-requested-with", "accept"];
const MAX_BYTES = 4 * 1024 * 1024; // 총신대 목록 1쪽(본문 포함)이 약 0.8MB
const MAX_BODY = 8 * 1024;
const MAX_REDIRECTS = 5;

// scraper/certs/extra-ca.pem과 같은 공개 인증서: RapidSSL TLS RSA CA G1, 2027-11-02 만료(그 전에 둘 다 교체)
const EXTRA_CA = `-----BEGIN CERTIFICATE-----
MIIEszCCA5ugAwIBAgIQCyWUIs7ZgSoVoE6ZUooO+jANBgkqhkiG9w0BAQsFADBh
MQswCQYDVQQGEwJVUzEVMBMGA1UEChMMRGlnaUNlcnQgSW5jMRkwFwYDVQQLExB3
d3cuZGlnaWNlcnQuY29tMSAwHgYDVQQDExdEaWdpQ2VydCBHbG9iYWwgUm9vdCBH
MjAeFw0xNzExMDIxMjI0MzNaFw0yNzExMDIxMjI0MzNaMGAxCzAJBgNVBAYTAlVT
MRUwEwYDVQQKEwxEaWdpQ2VydCBJbmMxGTAXBgNVBAsTEHd3dy5kaWdpY2VydC5j
b20xHzAdBgNVBAMTFlJhcGlkU1NMIFRMUyBSU0EgQ0EgRzEwggEiMA0GCSqGSIb3
DQEBAQUAA4IBDwAwggEKAoIBAQC/uVklRBI1FuJdUEkFCuDL/I3aJQiaZ6aibRHj
ap/ap9zy1aYNrphe7YcaNwMoPsZvXDR+hNJOo9gbgOYVTPq8gXc84I75YKOHiVA4
NrJJQZ6p2sJQyqx60HkEIjzIN+1LQLfXTlpuznToOa1hyTD0yyitFyOYwURM+/CI
8FNFMpBhw22hpeAQkOOLmsqT5QZJYeik7qlvn8gfD+XdDnk3kkuuu0eG+vuyrSGr
5uX5LRhFWlv1zFQDch/EKmd163m6z/ycx/qLa9zyvILc7cQpb+k7TLra9WE17YPS
n9ANjG+ECo9PDW3N9lwhKQCNvw1gGoguyCQu7HE7BnW8eSSFAgMBAAGjggFmMIIB
YjAdBgNVHQ4EFgQUDNtsgkkPSmcKuBTuesRIUojrVjgwHwYDVR0jBBgwFoAUTiJU
IBiV5uNu5g/6+rkS7QYXjzkwDgYDVR0PAQH/BAQDAgGGMB0GA1UdJQQWMBQGCCsG
AQUFBwMBBggrBgEFBQcDAjASBgNVHRMBAf8ECDAGAQH/AgEAMDQGCCsGAQUFBwEB
BCgwJjAkBggrBgEFBQcwAYYYaHR0cDovL29jc3AuZGlnaWNlcnQuY29tMEIGA1Ud
HwQ7MDkwN6A1oDOGMWh0dHA6Ly9jcmwzLmRpZ2ljZXJ0LmNvbS9EaWdpQ2VydEds
b2JhbFJvb3RHMi5jcmwwYwYDVR0gBFwwWjA3BglghkgBhv1sAQEwKjAoBggrBgEF
BQcCARYcaHR0cHM6Ly93d3cuZGlnaWNlcnQuY29tL0NQUzALBglghkgBhv1sAQIw
CAYGZ4EMAQIBMAgGBmeBDAECAjANBgkqhkiG9w0BAQsFAAOCAQEAGUSlOb4K3Wtm
SlbmE50UYBHXM0SKXPqHMzk6XQUpCheF/4qU8aOhajsyRQFDV1ih/uPIg7YHRtFi
CTq4G+zb43X1T77nJgSOI9pq/TqCwtukZ7u9VLL3JAq3Wdy2moKLvvC8tVmRzkAe
0xQCkRKIjbBG80MSyDX/R4uYgj6ZiNT/Zg6GI6RofgqgpDdssLc0XIRQEotxIZcK
zP3pGJ9FCbMHmMLLyuBd+uCWvVcF2ogYAawufChS/PT61D9rqzPRS5I2uqa3tmIT
44JhJgWhBnFMb7AGQkvNq9KNS9dd3GWc17H/dXa1enoxzWjE0hBdFjxPhUb0W3wi
8o34/m8Fxw==
-----END CERTIFICATE-----`;

// deno-lint-ignore no-explicit-any
let caClient: any = null;
try {
  // deno-lint-ignore no-explicit-any
  caClient = (Deno as any).createHttpClient({ caCerts: [EXTRA_CA] });
} catch (_) {
  caClient = null;
}

/* ── GitHub Actions OIDC 토큰 확인(RS256, 공개키는 GitHub에서 받아 1시간 보관) ── */
let jwksCache: { at: number; keys: JsonWebKey[] } | null = null;
async function githubKeys(force = false): Promise<JsonWebKey[]> {
  if (!force && jwksCache && Date.now() - jwksCache.at < 3600e3) return jwksCache.keys;
  const r = await fetch(ISSUER + "/.well-known/jwks", { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`GitHub 공개키를 받지 못함(HTTP ${r.status})`);
  jwksCache = { at: Date.now(), keys: (await r.json()).keys || [] };
  return jwksCache.keys;
}
const b64u = (s: string) =>
  Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
const json = (bytes: Uint8Array) => JSON.parse(new TextDecoder().decode(bytes));

export async function verifyGithubToken(token: string) {
  const [h, p, s] = token.split(".");
  if (!h || !p || !s) throw new Error("토큰 없음");
  const header = json(b64u(h));
  if (header.alg !== "RS256") throw new Error("알 수 없는 서명 방식");
  // deno-lint-ignore no-explicit-any
  const find = (keys: any[]) => keys.find((k) => k.kid === header.kid);
  const jwk = find(await githubKeys()) || find(await githubKeys(true));
  if (!jwk) throw new Error("모르는 서명 키");
  const key = await crypto.subtle.importKey("jwk", { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true }, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  if (!(await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64u(s), new TextEncoder().encode(h + "." + p)))) throw new Error("서명 불일치");
  const c = json(b64u(p));
  const now = Date.now() / 1000;
  if (c.iss !== ISSUER) throw new Error("발급자 불일치");
  if (!(Array.isArray(c.aud) ? c.aud : [c.aud]).includes(AUDIENCE)) throw new Error("용도(aud) 불일치");
  if (!(c.exp > now - 30) || (c.nbf && c.nbf > now + 30)) throw new Error("만료된 토큰");
  if (String(c.repository_id) !== REPO_ID) throw new Error("다른 저장소");
  if (c.ref !== BRANCH) throw new Error("main이 아닌 브랜치");
  return c;
}

/* ── 중계 ── */
function check(u: URL, method: string): string | null {
  if (u.protocol !== "https:" && u.protocol !== "http:") return "http(s) 주소만 중계함";
  const rule = ALLOW[u.host];
  if (!rule) return `허용하지 않은 사이트: ${u.host}`;
  if (method === "GET") return null;
  if (method === "POST" && (rule.post || []).includes(u.pathname)) return null;
  return `${method}를 허용하지 않은 주소: ${u.host}${u.pathname}`;
}
function fail(status: number, msg: string) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "x-relay-error": encodeURIComponent(msg) },
  });
}

type Job = { url: string; method?: string; headers?: Record<string, string>; body?: string; timeoutMs?: number };

export async function handle(req: Request): Promise<Response> {
  const region = Deno.env.get("SB_REGION");
  if (region !== REGION) return fail(421, `서울이 아닌 곳(${region ?? "알 수 없음"})에서 실행됨 — x-region: ${REGION} 헤더로 호출`);
  if (req.method !== "POST") return fail(405, "POST로 호출");
  try {
    await verifyGithubToken(req.headers.get("x-gh-oidc") || "");
  } catch (e) {
    return fail(401, "호출 권한 없음: " + (e as Error).message);
  }
  let job: Job;
  try {
    job = await req.json();
  } catch (_) {
    return fail(400, "요청 형식 오류");
  }
  let url: URL;
  try {
    url = new URL(job.url);
  } catch (_) {
    return fail(400, "주소 형식 오류");
  }
  let method = String(job.method || "GET").toUpperCase();
  let why = check(url, method);
  if (why) return fail(403, why);
  const body = method === "POST" ? String(job.body ?? "") : undefined;
  if (body && body.length > MAX_BODY) return fail(413, "보낼 내용이 너무 큼");
  const headers: Record<string, string> = { "User-Agent": UA, "Accept-Language": "ko-KR,ko;q=0.9" };
  for (const [k, v] of Object.entries(job.headers || {})) if (PASS_HEADERS.includes(k.toLowerCase())) headers[k] = String(v).slice(0, 300);
  const signal = AbortSignal.timeout(Math.min(Math.max(Number(job.timeoutMs) || 20000, 1000), 60000));
  const t0 = Date.now();

  let res: Response;
  try {
    for (let hop = 0;; hop++) {
      // deno-lint-ignore no-explicit-any
      const opts: any = { method, headers, body: method === "POST" ? body : undefined, redirect: "manual", signal };
      if (ALLOW[url.host].extraCa && caClient) opts.client = caClient;
      res = await fetch(url, opts);
      if (![301, 302, 303, 307, 308].includes(res.status)) break;
      const loc = res.headers.get("location");
      await res.body?.cancel();
      if (!loc || hop >= MAX_REDIRECTS) return fail(502, "넘겨주기(redirect)가 끝나지 않음");
      url = new URL(loc, url);
      if (res.status === 303 || ((res.status === 301 || res.status === 302) && method === "POST")) method = "GET";
      why = check(url, method);
      if (why) return fail(403, "넘겨준 곳이 " + why);
    }
  } catch (e) {
    return fail(502, "사이트 접속 실패: " + String((e as Error)?.message || e).slice(0, 200));
  }

  const chunks: Uint8Array[] = [];
  let n = 0;
  try {
    const reader = res.body?.getReader();
    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;
      n += value.length;
      if (n > MAX_BYTES) {
        await reader.cancel();
        return fail(502, "응답이 너무 큼");
      }
      chunks.push(value);
    }
  } catch (e) {
    return fail(502, "응답을 받다가 끊김: " + String((e as Error)?.message || e).slice(0, 200));
  }
  const out = new Uint8Array(n);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  console.log(`${method} ${url.host}${url.pathname} → ${res.status} ${n}B ${Date.now() - t0}ms`);
  return new Response(out, {
    status: 200,
    headers: {
      "content-type": "application/octet-stream",
      "x-upstream-status": String(res.status),
      "x-upstream-type": res.headers.get("content-type") || "",
      "x-upstream-url": encodeURIComponent(url.href),
    },
  });
}

if (!Deno.env.get("KR_RELAY_TEST")) Deno.serve(handle); // 점검(test.ts) 때는 서버를 띄우지 않음
