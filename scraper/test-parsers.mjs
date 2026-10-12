// 수집기 점검 — 네트워크 없이 fixtures/의 표본으로 파서·정규화·robots 해석을 확인한다.
//   node scraper/test-parsers.mjs
// 사이트 구조가 바뀌어 수집이 0건이 되면, 표본을 새로 저장하고 이 점검부터 맞춘다.
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { classifyPositions, parseSalary, parseRobots, robotsAllows, normRegion, extractChurch, extractPositions, cleanTitle, titleKey, parseDate, areaOf } from './lib.mjs';
import chongshin from './sources/chongshin.mjs';
import mtu from './sources/mtu.mjs';
import godpeople from './sources/godpeople.mjs';
import puts from './sources/puts.mjs';
import seminaries from './sources/seminaries.mjs';
import denominations from './sources/denominations.mjs';
const S = id => [...seminaries, ...denominations].find(x => x.id === id);

const fx = name => readFile(new URL('./fixtures/' + name, import.meta.url), 'utf8');
const fakeHttp = text => ({ request: async () => text });
let n = 0; const t = (name, fn) => Promise.resolve(fn()).then(() => { n++; console.log('✓', name); });

await t('robots: 전체 금지', () => {
  const g = parseRobots('User-Agent: Googlebot\nAllow: /www/board/\n\nUser-Agent: *\nDisallow: /\nDisallow: /www/board/');
  assert.equal(robotsAllows(g, '/www/board/list.asp'), false);
  assert.equal(robotsAllows(g, '/www/board/list.asp', 'Googlebot'), true);
});
await t('robots: 일부 금지·빈 Disallow·공백 콜론', () => {
  const g = parseRobots('User-agent: *\nDisallow: /ajax/\nDisallow: /m/\n');
  assert.equal(robotsAllows(g, '/ajax_file.php'), true);
  assert.equal(robotsAllows(g, '/ajax/x.php'), false);
  assert.equal(robotsAllows(parseRobots('User-agent: *\nDisallow:'), '/a'), true);
  assert.equal(robotsAllows(parseRobots('User-agent : *\nDisallow : /'), '/a'), false);
  assert.equal(robotsAllows(parseRobots('User-agent: *\nDisallow: /*.pdf$'), '/a/b.pdf'), false);
  assert.equal(robotsAllows(parseRobots('User-agent: *\nDisallow: /*.pdf$'), '/a/b.pdf?x=1'), true);
});
await t('지역 정규화', () => {
  assert.equal(normRegion('경기 군포시 부곡동'), '경기');
  assert.equal(normRegion('전남광주통합특별시 북구 신용동'), '광주');
  assert.equal(normRegion('전남광주통합특별시 목포시'), '전남');
  assert.equal(normRegion('충청남도 천안시'), '충남');
  assert.equal(normRegion('서울 외'), '서울');
  assert.equal(normRegion('서울남/강남'), '서울');
  assert.equal(normRegion('남양주 주평강교회에서'), '경기');
  assert.equal(normRegion('초교파'), null);
  assert.equal(areaOf('경기 성남시 분당구 금곡동'), '경기 성남시');
});
await t('교회명·직책·제목', () => {
  assert.equal(extractChurch('(끌어올림) 양문교회(경기도 군포시 부곡동)에서 전임 사역자를 모십니다.'), '양문교회');
  assert.equal(extractChurch('[서울/서대문] 창천교회에서 함께 사역할 전도사님을 모십니다.'), '창천교회');
  assert.equal(extractChurch('본교회에서 사역자를 모십니다'), null);
  assert.deepEqual(extractPositions('동도교회와 함께 할 여교역자(심방전도사)를 모십니다.'), ['심방전도사']);
  assert.ok(extractPositions('유치부, 아동2부 교역자 청빙').includes('교육전도사'));
  assert.ok(extractPositions('부목사님 또는 전임전도사님을 청빙합니다').includes('부목사'));
  assert.equal(cleanTitle('(끌어올림) 양문교회 청빙'), '양문교회 청빙');
  assert.equal(titleKey('[끌어올림] 양문교회 청빙'), titleKey('양문교회  청빙'));
  assert.equal(parseDate('15:05', '2026-10-07'), '2026-10-07');
  assert.equal(parseDate('2026.10.05'), '2026-10-05');
  assert.equal(parseDate('12-30', '2026-10-07'), '2025-12-30');
});
await t('총신대 파서 — 개인정보 필드 없음', async () => {
  const items = await chongshin.collect({ http: fakeHttp(await fx('chongshin.json')) });
  assert.ok(items.length >= 5);
  assert.ok(items.every(i => i.title && i.url.includes('board_content_id=') && /^\d{4}-\d{2}-\d{2}$/.test(i.date)));
  assert.ok(items.some(i => i.closed));
  for (const i of items) for (const k of Object.keys(i)) assert.ok(!['phone', 'email', 'senior_pastor', 'address'].includes(k), k);
});
await t('감신대 파서', async () => {
  const items = await mtu.collect({ http: fakeHttp(await fx('mtu.html')) });
  assert.ok(items.length >= 4, 'rows ' + items.length);
  assert.ok(items.every(i => i.url.startsWith('https://www.mtu.ac.kr/mtu/board/view.do?mId=162&brdIdx=')));
});
await t('갓피플 파서', async () => {
  const items = await godpeople.collect({ http: fakeHttp(await fx('godpeople.html')) });
  assert.ok(items.length >= 4, 'rows ' + items.length);
  assert.ok(items.every(i => i.church && i.url.includes('rc_idxx=')));
  assert.ok(items.some(i => i.tags.length));
});
await t('장신대 파서(기본 꺼짐) — 작성자 이름 버림', async () => {
  assert.equal(puts.enabled, false);
  const items = await puts.collect({ http: fakeHttp(await fx('puts.html')) });
  assert.ok(items.length >= 3, 'rows ' + items.length);
  assert.ok(items.every(i => !i.church.includes('/')));
});
await t('영남신대 — 목록의 양식에서 교회·주소·부서', async () => {
  const items = await S('ytus').collect({ http: fakeHttp(await fx('ytus.html')) });
  assert.ok(items.length >= 3, 'rows ' + items.length);
  assert.ok(items.some(i => i.church && i.location));
  assert.ok(items.every(i => i.url.startsWith('https://www.ytus.ac.kr/board/view/trXXR/')));
});
await t('기성 총회 — 공지 제외·직책 분류·YY.MM.DD 날짜', async () => {
  const items = await S('kehc').collect({ http: fakeHttp(await fx('kehc.html')) });
  assert.equal(items.length, 4);
  assert.ok(items.every(i => /^\d{2}\.\d{2}\.\d{2}$/.test(i.date) && i.tags.length && i.url.includes('/read_post/')));
});
await t('예장통합 총회', async () => {
  const items = await S('pck').collect({ http: fakeHttp(await fx('pck.html')) });
  assert.ok(items.length >= 3, 'rows ' + items.length);   // 표본 5행 중 공지 2행은 빠져야 함
  assert.ok(items.every(i => i.url.includes('wr_id=') && !i.url.includes(':443')));
});
await t('기독정보넷 RSS — 교단만 읽고 연락처는 버림', async () => {
  const items = await S('cjob').collect({ http: fakeHttp(await fx('cjob.xml')) });
  assert.equal(items.length, 3);
  const dump = JSON.stringify(items);
  assert.ok(!/example\.com|010-0000|홍길동/.test(dump), '연락처가 남아 있음');
  assert.ok(items.some(i => i.denomination));
  assert.ok(items.every(i => !i.url.includes('&amp;')));
});
await t('모든 출처 정의가 올바름', () => {
  const all = [chongshin, mtu, godpeople, puts, ...seminaries, ...denominations];
  const ids = new Set(), shorts = new Set();
  for (const s of all) {
    assert.ok(s.id && s.short && s.name && /^https?:\/\//.test(s.home) && typeof s.collect === 'function', s.id);
    assert.ok(!ids.has(s.id) && !shorts.has(s.short), '중복 id/short: ' + s.id); ids.add(s.id); shorts.add(s.short);
  }
});
await t('직책 세분화', () => {
  const c = x => classifyPositions(x);
  assert.deepEqual(c('영광교회에서 부목사님을 청빙합니다.'), ['전임 부목사']);
  assert.deepEqual(c('도화교회 담임목사를 청빙합니다'), ['담임목사']);
  assert.ok(!c('담임목사님과 함께할 부교역자(목사) 모십니다').includes('담임목사'));
  assert.deepEqual(c('청년회(준전임) 사역자 모집'), ['준전임 전도사']);
  assert.ok(c('유치부, 아동2부 교역자(교육전도사, 교육목사) 청빙').includes('파트 교육전도사'));
  assert.ok(c('유치부, 아동2부 교역자(교육전도사, 교육목사) 청빙').includes('파트 목사'));
  assert.deepEqual(c('전임사역자를 모십니다.'), ['전임 전도사']);
  assert.deepEqual(c('주일 오르간 반주자 및 솔리스트 모집'), ['반주자', '솔리스트']);
  assert.deepEqual(c('방송실 간사 및 관리집사 모집'), ['방송·미디어 간사', '사찰·관리집사']);
  assert.deepEqual(c('사무간사 채용'), ['사무간사']);
});
await t('사례비 읽기 — 수당 제외·연봉 환산·전화번호 무시', () => {
  assert.deepEqual(parseSalary('사례 및 복지 ① 전임: 270만원 + @ (주거지원비 월 30만원, 점심식사비 월 30만원)').min, 270);
  const r = parseSalary('사례: 재학생 - 100만원 / 졸업생 - 120만원');
  assert.equal(r.min, 100); assert.equal(r.max, 120); assert.equal(r.roles.length, 2);
  assert.equal(parseSalary('연봉 3,600만원').min, 300);
  assert.equal(parseSalary('사례비: 1,500,000원 (문의 010-1234-5678)').max, 150);
  assert.equal(parseSalary('3. 사례 월 150 X 14개월(4대보험 적용)').min, 150);
  assert.deepEqual(parseSalary('사례 및 예우 교회 내규에 따름'), { note: '내규·협의' });
  assert.equal(parseSalary('80', { dedicated: true }).min, 80);
  assert.equal(parseSalary('제출서류 2부, 모집 3명, 2027년'), null);
});
console.log(`\n${n}개 점검 통과`);
