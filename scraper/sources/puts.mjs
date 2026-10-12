// 장로회신학대학교 초빙게시판 — ⛔ 기본 꺼짐
// robots.txt(2026-10-07): "User-Agent: *  Disallow: /" (구글봇만 허용) → 허락 없이 수집하지 않는다.
// 장신대(홍보팀·전산팀)에서 서면 허락을 받으면 permission에 허락 내용(날짜·담당 부서)을 적고 enabled를 true로 바꾼다.
import * as cheerio from 'cheerio';
export default {
  id: 'puts', short: 'pt', name: '장신대', group: '신학교',
  home: 'https://www.puts.ac.kr/www/sub/lounge/sub.asp?m1=4&m2=4',
  enabled: false,
  permission: '',    // 예: '2026-11-02 장신대 홍보팀 메일로 제목·링크 수집 허락'
  disabledReason: 'robots.txt가 모든 수집 로봇을 금지 — 장신대 허락 후 사용',
  pages: 1,          // 1쪽 = 50건
  async collect({ http }) {
    const out = [];
    const base = 'https://www.puts.ac.kr/www/board/';
    for (let page = 1; page <= this.pages; page++) {
      const html = await http.request(`${base}list.general.asp?design=lounge&m1=4&m2=4&m3=1&bd_name=jangshin_jboard04&page=${page}&pagesize=50`, { source: this, encoding: 'euc-kr' });
      const $ = cheerio.load(html);
      $('div.BoardListTy1 table tbody tr').not('.ntc').each((_, tr) => {
        const a = $(tr).find('td.c2 div.tit a').first();
        const grp = a.find('span.grp').text().trim();
        a.find('span.grp').remove();
        const title = a.text().replace(/\s+/g, ' ').trim();
        const seq = (a.attr('href') || '').match(/seq=(\d+)/);
        if (!title || !seq) return;
        out.push({
          title,
          church: $(tr).find('span.name').text().split('/')[0].trim(),   // "교회명/작성자" — 작성자 이름은 버림
          date: $(tr).find('span.date').text().trim(),
          closed: grp === '초빙완료',
          url: `${base}view.general.asp?seq=${seq[1]}&design=lounge&m1=4&m2=4&m3=1&bd_name=jangshin_jboard04`
        });
      });
    }
    return out;
  }
};
