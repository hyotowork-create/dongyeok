// 감리교신학대학교 취업게시판 — 서버가 그린 HTML(UTF-8), 로그인 불필요
// robots.txt 요청은 학교 방화벽이 막아 내용 확인 불가(2026-10-07). RFC 9309상 "규칙 없음"으로 보고 수집하되,
// 감신대 전산부에 수집 허락을 받아 두기를 권함. 차단 화면이 오면 lib.mjs가 즉시 멈춘다.
import * as cheerio from 'cheerio';
export default {
  id: 'mtu', short: 'mt', name: '감신대', group: '신학교',
  home: 'https://www.mtu.ac.kr/mtu/board/list.do?mId=162',
  enabled: true,
  pages: 2,          // 1쪽 = 20건
  async collect({ http }) {
    const out = [];
    for (let page = 1; page <= this.pages; page++) {
      const html = await http.request(`https://www.mtu.ac.kr/mtu/board/list.do?mId=162&page=${page}`, { source: this });
      const $ = cheerio.load(html);
      const rows = $('table.tbListA tbody tr').not('.notice');
      rows.each((_, tr) => {
        const a = $(tr).find('td.tltle a.fn_btn_view').first();
        const rel = a.attr('href'); const title = a.text().replace(/\s+/g, ' ').trim();
        if (!rel || !title || a.attr('data-nm')) return;    // data-nm = 비밀글
        out.push({ title, date: $(tr).find('td.date').text().trim(), url: new URL(rel, 'https://www.mtu.ac.kr/mtu/board/').href });
      });
      if (rows.length < 20) break;
    }
    return out;
  }
};
