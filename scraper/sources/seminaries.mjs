// 신학교 청빙·사역자 게시판(2026-10-07 조사: robots.txt 허용 + 로그인 없이 공개된 곳만)
// robots.txt가 막은 학교는 여기 넣지 않고 scraper/link-only.json에 링크만 둔다.
import { board, linkText, dateText } from './_board.mjs';
import { parseSalary } from '../lib.mjs';

const abs = (href, base) => new URL(String(href || '').replace(/:443(?=\/)/, ''), base).href;
// "[지역] 교회명" 꼴 제목에서 교회명
const afterBracket = t => String(t).replace(/^\s*\[[^\]]*\]\s*/, '').trim();
// K2Web CMS(백석·협성 등) 공통 행 읽기
const k2web = host => ($, r) => {
  const a = r.find('td._artclTdTitle a.artclLinkView').first();
  const title = (a.find('span').not('.newArtcl').first().text() || linkText($, a)).replace(/\s+/g, ' ').trim();
  return { title, url: abs(a.attr('href'), host), date: r.find('td._artclTdRdate').text().trim() };
};

export default [
  board({
    id: 'kts', short: 'kt', name: '고려신학대학원', home: 'https://www.kts.ac.kr/home/pinvit',
    listUrl: p => `https://www.kts.ac.kr/home/pinvit?page=${p}`,
    row: '#bo_list tbody tr:not(.bo_notice)',
    parse: ($, r, base) => { const a = r.find('td.td_subject .bo_tit a').first(); return { title: linkText($, a), url: abs(a.attr('href'), base), date: r.find('td.td_datetime').text().trim() }; }
  }),
  board({
    id: 'hapdong', short: 'hs', name: '합동신학대학원대', home: 'https://www.hapdong.ac.kr/bbs/board.php?bo_table=e03',
    listUrl: p => `https://www.hapdong.ac.kr/bbs/board.php?bo_table=e03&page=${p}`,
    row: 'tbody tr:not(.active)',
    parse: ($, r, base) => {
      const a = r.find('td.list-subject a').first();
      return { title: linkText($, a), url: abs(a.attr('href'), base), church: r.find('.sv_member').first().text().trim(), date: dateText(r.find('td.text-center.en.font-11').first().text()) };
    }
  }),
  board({
    id: 'daeshin', short: 'ds', name: '대신대', home: 'https://www.daeshin.ac.kr/html/05_community/03.php',
    listUrl: p => `https://www.daeshin.ac.kr/html/05_community/03.php?search_select=&keyword=&b_page=${p}`,
    row: 'table.board tr',
    parse: ($, r, base) => {
      if (r.find('td.No.notice').length || !r.find('td.Title a').length) return null;
      const a = r.find('td.Title a').first(); const title = linkText($, a);
      return { title, url: abs(a.attr('href'), base), date: r.find('td.Date').text().trim(), truncated: /\.\.\.$|…$/.test(title) };
    }
  }),
  board({
    id: 'kwangshin', short: 'ks', name: '광신대', home: 'https://www.kwangshin.ac.kr/front/boardList.do?brd_mgrno=184&menu_no=467',
    listUrl: p => `https://www.kwangshin.ac.kr/front/boardList.do?brd_mgrno=184&menu_no=467&page_now=${p}`,
    row: 'table.list_tb2 tr', filter: true,     // 학교 행사 글이 섞임
    parse: ($, r) => {
      const a = r.find('td p a').first(); const m = String(a.attr('href') || '').match(/fView\('(\d+)'\)/);
      if (!m) return null;
      return { title: linkText($, a), url: `https://www.kwangshin.ac.kr/front/boardView.do?brd_mgrno=184&menu_no=467&brd_no=${m[1]}`, date: dateText(r.find('td').eq(1).text()) };
    }
  }),
  board({
    id: 'wgst', short: 'wg', name: '웨스트민스터신학대학원대', home: 'http://www.wgst.ac.kr/wgst_renew/board/board.asp?key=6131',
    listUrl: p => `http://www.wgst.ac.kr/wgst_renew/board/board.asp?key=6131&searchkey=&searchvalue=&pageno=${p}`,   // https는 응답 없음
    row: 'ul.newsfeed_lst > li.item', filter: true,
    parse: ($, r) => {
      const a = r.find('strong.subject a').first();
      const church = a.find('font').first().text().replace(/[\[\]]/g, '').trim();
      return { title: (a.attr('title') || linkText($, a)).trim(), church, url: abs(a.attr('href'), 'http://www.wgst.ac.kr/wgst_renew/board/'), date: dateText(r.find('dl.info dd').first().text()) };
    }
  }),
  {
    // 목록을 AJAX(JSON)로 채움 — 2024년 사본의 list.js 기준. 응답 형식이 바뀌면 0건이 되며, 그때 고친다.
    id: 'hanil', short: 'hi', name: '한일장신대', group: '신학교', enabled: true, pages: 1,
    home: 'https://www.hanil.ac.kr/portal/default/bbs/list.do?menuId=M0004000500000000',
    async collect({ http }) {
      const out = [];
      for (let p = 1; p <= this.pages; p++) {
        const text = await http.request('https://www.hanil.ac.kr/portal/bbs/article_list.ajax', {
          source: this, method: 'POST',
          body: new URLSearchParams({ pageIndex: String(p), pageSize: '15', boardId: 'BBS00000000000000262', menuId: 'M0004000500000000', searchCondition: '', searchKeyword: '' }),
          headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest', Referer: this.home }
        });
        const j = JSON.parse(text);
        for (const it of j.list || []) {
          const d = String(it.createDt || '');
          out.push({ title: String(it.title || '').trim(), url: `https://www.hanil.ac.kr/portal/default/bbs/view.do?menuId=M0004000500000000&boardSeq=${encodeURIComponent(it.boardSeq)}`,
                     date: /^\d{8}/.test(d) ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : d, closed: it.classification === '마감' });
        }
      }
      return out;
    }
  },
  board({
    id: 'ytus', short: 'yt', name: '영남신대', home: 'https://www.ytus.ac.kr/board/trXXR',
    listUrl: p => p === 1 ? 'https://www.ytus.ac.kr/board/trXXR' : `https://www.ytus.ac.kr/board/list/trXXR/page/${p}`,
    row: 'tr:not(.notice-row)',
    parse: ($, r, base) => {
      const a = r.find('td.title a[href^="/board/view/trXXR/"]').first();
      if (!a.length) return null;
      const form = String(a.attr('title') || '').replace(/&nbsp;/g, ' ');
      const pick = label => { const m = form.match(new RegExp(label + '\\s*:\\s*([^*]+)')); return m ? m[1].trim() : ''; };
      return { title: linkText($, a), url: abs(a.attr('href'), base), church: pick('교\\s*회\\s*명'), /* 작성자 칸은 개인 이름일 수 있어 쓰지 않음 */ location: pick('교회\\s*주소'), dept: pick('모집\\s*부서'), denomination: pick('교\\s*단\\s*명'), pay: parseSalary(pick('사\\s*례\\s*비'), { dedicated: true }), payChecked: !!pick('사\\s*례\\s*비'), date: r.find('td.rdate').text().trim() };
    }
  }),
  board({
    id: 'bpu', short: 'bp', name: '부산장신대', home: 'https://www.bpu.ac.kr/Board/BoardList.aspx?CategoryNo=1&PageNo=1&KeyWord=&KeyField=&BoardMstNo=6',
    listUrl: p => `https://www.bpu.ac.kr/Board/BoardList.aspx?PageNo=${p}&CategoryNo=1&KeyWord=&KeyField=TITLE&BoardMstNo=6`,
    row: 'table.TableStyle03 tbody tr',
    parse: ($, r) => {
      const tds = r.find('td'); if (/공지/.test(tds.first().text())) return null;
      const a = r.find('a[id*="hlnkTitle"]').first(); const m = String(a.attr('href') || '').match(/BoardNo=(\d+)/);
      if (!m) return null;
      return { title: (a.attr('title') || linkText($, a)).trim(), url: `https://www.bpu.ac.kr/Board/BoardView.aspx?BoardNo=${m[1]}&BoardMstNo=6`, date: dateText(tds.eq(3).text()) };
    }
  }),
  board({
    id: 'sjs', short: 'sj', name: '서울장신대', home: 'https://www.sjs.ac.kr/ht_ml/w_04ed/4600.php', encoding: 'euc-kr',
    listUrl: p => `https://www.sjs.ac.kr/ht_ml/w_04ed/4600.php?pagetype=&pageno=${p}&bbsid=main4600`,
    row: 'table.board_table tr:not(.notice)',
    parse: ($, r, base) => { const a = r.find('td.board_tit a').first(); return { title: linkText($, a), url: abs(a.attr('href'), base), date: r.find('td.date').text().trim() }; }
  }),
  board({
    id: 'bu', short: 'bu', name: '백석대학원', home: 'https://community.bu.ac.kr/graduateschool/3938/subview.do',
    listUrl: p => `https://community.bu.ac.kr/bbs/graduateschool/1110/artclList.do?page=${p}`,
    row: 'tbody tr:not(.headline)',
    parse: ($, r) => { const x = k2web('https://community.bu.ac.kr')($, r); return x.title ? { ...x, church: afterBracket(x.title) } : null; }
  }),
  board({
    id: 'ttgu', short: 'tt', name: '횃불트리니티', home: 'https://www.ttgu.ac.kr/index.php?mid=ttgu_board_03',
    listUrl: p => `https://www.ttgu.ac.kr/index.php?mid=ttgu_board_03&page=${p}`,
    row: 'table.bd_lst tbody tr:not(.notice)',
    parse: ($, r, base) => { const a = r.find('td.title a.hx').first(); return { title: linkText($, a), url: abs(a.attr('href'), base), date: r.find('td.time').text().trim() }; }
  }),
  board({
    id: 'mokwon', short: 'mw', name: '목원대', home: 'https://www.mokwon.ac.kr/theo/html/sub04/0404.html',
    listUrl: p => `https://www.mokwon.ac.kr/theo/html/sub04/0404.html?mode=L&GotoPage=${p}`,
    row: 'table.board_list tbody tr:not(.bbs_notice)',
    parse: ($, r, base) => {
      const a = r.find('td.title a').first(); if (!a.length) return null;
      const u = new URL(a.attr('href'), base); u.searchParams.delete('GotoPage');
      return { title: linkText($, a), url: u.href, date: r.find('td.reg_date').text().trim() };
    }
  }),
  board({
    id: 'uhs', short: 'uh', name: '협성대', home: 'https://www.uhs.ac.kr/gsthe/2386/subview.do',
    listUrl: p => `https://www.uhs.ac.kr/bbs/gsthe/183/artclList.do?page=${p}`,
    row: 'tbody tr',
    parse: ($, r) => {   // 백석과 같은 K2Web이지만 칸 이름이 다름(td.al-left > a.artclLinkView > strong)
      const a = r.find('a.artclLinkView').first(); if (!a.length) return null;
      const title = (a.find('strong').first().text() || linkText($, a)).replace(/\s+/g, ' ').trim();
      return { title, url: abs(a.attr('href'), 'https://www.uhs.ac.kr'), date: dateText(r.find('td.TdDate, td._artclTdRdate').text() || r.text()) };
    }
  }),
  board({
    id: 'hansei', short: 'hn', name: '한세대 대학원', home: 'http://graduate.hansei.ac.kr/view.do?no=12624',
    listUrl: p => `http://graduate.hansei.ac.kr/view.do?no=12624&pgMode=index&pageIndex=${p}`,
    row: 'table.tbl01 tbody tr', filter: true,   // 장학·학사 공지가 섞임
    parse: ($, r) => {
      const a = r.find('td.title a').first(); const m = String(a.attr('onclick') || '').match(/show\((\d+)\)/);
      if (!m) return null;
      return { title: linkText($, a), url: `http://graduate.hansei.ac.kr/view.do?no=12624&pgMode=show&pstSn=${m[1]}`, date: dateText(r.find('td.date').text() || r.text()) };
    }
  }),
  board({
    id: 'acts', short: 'ac', name: '아신대', home: 'https://www.acts.ac.kr/modules/board/bd_list.asp?id=acts_csrd_guide&ca_no=1&left=unilife3_12', encoding: 'euc-kr',
    listUrl: p => `https://www.acts.ac.kr/modules/board/bd_list.asp?id=acts_csrd_guide&ca_no=1&left=unilife3_12&gotopage=${p}`,
    row: 'tbody tr',
    parse: ($, r) => {
      if (r.find('img[alt="공지"]').length) return null;
      const a = r.find('a.boardList__tit').first(); const m = String(a.attr('href') || '').match(/[?&]no=(\d+)/);
      if (!m) return null;
      const date = r.find('td').map((_, td) => $(td).text().trim()).get().find(t => /^\d{4}-\d{2}-\d{2}$/.test(t)) || '';
      return { title: linkText($, a), url: `https://www.acts.ac.kr/modules/board/bd_view.asp?no=${m[1]}&id=acts_csrd_guide&ca_no=1`, date };
    }
  })
];
