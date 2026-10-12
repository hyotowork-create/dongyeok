// 갓피플 채용(recruit.godpeople.com) 「사역자청빙」 탭 — 목록은 페이지가 쓰는 AJAX(POST) 응답(EUC-KR HTML 조각)
// robots.txt: /ajax/·/m/·/file/·/kcp/만 금지 → /ajax_file.php는 허용 범위. 다만 내부용 주소라 회색 지대.
// 약관 §18①: 영리 목적 복제·배포 금지 → 비영리·제목+링크만. 갓피플에 제휴/허락 문의를 권함.
// 제목이 40자 안팎에서 "…"로 잘려 오며, 글 번호(rc_idxx)는 요청마다 바뀌므로 중복 판단에 쓰지 않는다.
import * as cheerio from 'cheerio';
export default {
  id: 'godpeople', short: 'gp', name: '갓피플', group: '구인 사이트',
  home: 'https://recruit.godpeople.com/?GO=recruit_find&rc_tab=1',
  enabled: true,
  pages: 2,          // 1쪽 = 100건
  async collect({ http }) {
    const out = [];
    for (let page = 1; page <= this.pages; page++) {
      const body = new URLSearchParams({ rc_mode: 'recruit_find', rc_tab: '1', rc_pgno: String(page), rc_lisu: '100', total_kwrd: '', keyword: '', conditions: '', period: '', area: '' });
      const html = await http.request('https://recruit.godpeople.com/ajax_file.php', {
        source: this, method: 'POST', body, encoding: 'euc-kr',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', Referer: this.home, 'X-Requested-With': 'XMLHttpRequest' }
      });
      const $ = cheerio.load(html);
      const rows = $('tr').filter((_, tr) => $(tr).find('td.recruit_title').length > 0);
      rows.each((_, tr) => {
        const td = $(tr).find('td.recruit_title').first();
        const a = td.find('a.link').first();
        const title = (a.attr('title') || a.text()).replace(/\s+/g, ' ').trim();
        const idx = td.attr('id');
        if (!title || !idx) return;
        const dates = $(tr).find('td.date span').map((_, s) => $(s).text().trim()).get();
        out.push({
          title,
          church: $(tr).find('td.tplCname span').first().text().trim(),
          regionText: $(tr).find('td.tplCo span').first().text().replace(/\s*외$/, '').trim(),
          tags: td.find('p.etc span.cell').map((_, s) => $(s).text().replace(/^#/, '').trim()).get(),
          date: dates[0] || '',
          deadline: dates[1] || null,      // 'YYYY-MM-DD' 또는 '채용시까지'
          truncated: /…$/.test(title),
          url: `https://recruit.godpeople.com/?GO=recruit_view&rc_idxx=${encodeURIComponent(idx)}`
        });
      });
      if (rows.length < 100) break;
    }
    return out;
  }
};
