// 총신대학교 사역게시판 — 화면은 자바스크립트로 그리고, 목록은 공개 JSON API에서 옴(로그인 불필요, robots.txt 없음)
// ⚠ 응답에 연락처·이메일·담임목사 이름·작성자 정보가 함께 오므로, 아래에서 공개용 필드만 골라내고 나머지는 즉시 버린다.
// 본문(body)은 사례비 숫자만 읽고 저장하지 않는다.
import { parseSalary, classifyPositions, CLERGY } from '../lib.mjs';
const pickPay = (a, b) => (a && a.min ? a : b && b.min ? b : a || b || null);
const strip = h => String(h || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

export default {
  id: 'chongshin', short: 'cs', name: '총신대', group: '신학교',
  home: 'https://www.csu.ac.kr/?m1=page&menu_id=1110',
  enabled: true,
  viaKR: true,       // 해외(GitHub) 접속을 막음 → GitHub Actions에서는 서울 중계 함수(kr-relay)를 거침
  pages: 3,          // 1쪽 = 50건(약 4~5시간 분량). 하루 3번 × 3쪽 = 충분, 서버 부담을 줄이려 6→3
  async collect({ http }) {
    const out = [];
    for (let page = 1; page <= this.pages; page++) {
      const ask = (withBody, count) => http.request('https://www.csu.ac.kr/api/user/board/getBoardContentSummaryList', {
        source: this, method: 'POST', timeoutMs: withBody ? 60000 : 20000,
        body: new URLSearchParams({ boardIdList: '178', isAvailable: '1', isDeleted: '0', page: String(page), count: String(count), includeBody: withBody ? '1' : '0', orderByCode: '4', parentBoardContentId: '-1', includeProperties: '1' }),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', Referer: this.home, 'X-Requested-With': 'XMLHttpRequest' }
      });
      // 본문까지 받으면 1쪽이 약 0.8MB라 해외 서버에서 끊길 수 있음 → 실패하면 본문 없이 목록만(사례비는 다음 기회에)
      let text;
      try { text = await ask(true, 50); } catch (e) { if (e.name === 'BlockedError' || e.name === 'RobotsError') throw e; text = await ask(false, 50); }
      const json = JSON.parse(text);
      const list = (json.body || json).list || [];
      for (const it of list) {
        const p = it.properties || {};
        out.push({
          title: it.title,
          church: p.church_name,
          location: p.location,
          dept: p.ministry_dept,
          denomination: p.order_name,
          date: String(it.registered_date || '').slice(0, 10),
          closed: Number(it.status_code) === 4000,       // 4000 = 초빙완료
          pay: pickPay(parseSalary(p.gratuity, { dedicated: true }), parseSalary(strip(it.body))),   // 사례비 칸 숫자 > 본문 숫자 > "내규·협의"
          payChecked: true,
          posHint: classifyPositions(strip(it.body).slice(0, 1500)).filter(p => CLERGY.includes(p)).slice(0, 4),
          url: `https://www.csu.ac.kr/?m1=page_ministry_detail&menu_id=1110&board_content_id=${encodeURIComponent(it.id)}`
        });
      }
      if (list.length < 50) break;
    }
    return out;
  }
};
