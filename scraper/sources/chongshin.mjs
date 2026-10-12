// 총신대학교 사역게시판 — 화면은 자바스크립트로 그리고, 목록은 공개 JSON API에서 옴(로그인 불필요, robots.txt 없음)
// ⚠ 응답에 연락처·이메일·담임목사 이름·작성자 정보가 함께 오므로, 아래에서 공개용 필드만 골라내고 나머지는 즉시 버린다.
export default {
  id: 'chongshin', short: 'cs', name: '총신대', group: '신학교',
  home: 'https://www.csu.ac.kr/?m1=page&menu_id=1110',
  enabled: true,
  pages: 6,          // 1쪽 = 50건(약 4~5시간 분량)
  async collect({ http }) {
    const out = [];
    for (let page = 1; page <= this.pages; page++) {
      const body = new URLSearchParams({ boardIdList: '178', isAvailable: '1', isDeleted: '0', page: String(page), count: '50', includeBody: '0', orderByCode: '4', parentBoardContentId: '-1', includeProperties: '1' });
      const text = await http.request('https://www.csu.ac.kr/api/user/board/getBoardContentSummaryList', {
        source: this, method: 'POST', body,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', Referer: this.home, 'X-Requested-With': 'XMLHttpRequest' }
      });
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
          url: `https://www.csu.ac.kr/?m1=page_ministry_detail&menu_id=1110&board_content_id=${encodeURIComponent(it.id)}`
        });
      }
      if (list.length < 50) break;
    }
    return out;
  }
};
