import { groupBeans } from './data.js';
import { bindReorder } from './reorder.js';
import { initializePWA, pwaStatus } from './pwa.js';
import { parseBackup, serializeBackup, serializeCSV, counts } from './backup.js';
import { createRepository } from './db.js';
import { today, ageDays, elapsedMonths, ageLabel, dateLabel, compactDate, sortBeans } from './dates.js';
import { validateBean, roastLabel, ValidationError } from './validation.js';

const app = document.querySelector('#app'), nav = document.querySelector('#nav');
const notice = document.querySelector('#notice');
const repository = createRepository({ onBlocked: () => announce('別のCoffee Cellar画面を閉じてください。'), onVersionChange: () => announce('アプリが更新されました。画面を再読み込みしてください。') });
let viewMode = 'grouped', archiveViewMode = 'grouped', disposeDrag = () => {};
let filterMonths = 0, openedFilter = 'all', archivePeriod = 0, archiveBean = '', archiveReason = 'all';
let inventoryQuery = '', archiveQuery = '', searchTimer, pendingBackup = null;
const viewModes = [['grouped', '豆別'], ['oldest', '古い順'], ['newest', '新しい順']];
const archiveViewModes = [['grouped', '豆別'], ['newest', '終了が新しい順'], ['oldest', '終了が古い順']];
const filters = [[0, '全期間'], [1, '1ヶ月以上'], [6, '半年以上']];
const finishReasons = {consumed:'飲み切った',gifted:'人に譲渡',discarded:'廃棄した'};
let route = '', formBaseline = '', busy = false, renderId = 0, noticeTimer, midnightTimer;
const scrollPositions = new Map();
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const icons = {
  inventory: '<path d="M4 7h16v13H4zM3 3h18v4H3zM9 11h6"/>',
  archive: '<path d="M4 5h16v15H4zM8 2v6m8-6v6M4 10h16m-12 5 3 3 5-5"/>',
  settings: '<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="2" fill="currentColor"/><circle cx="16" cy="12" r="2" fill="currentColor"/><circle cx="9" cy="18" r="2" fill="currentColor"/>'
};
function announce(message) { clearTimeout(noticeTimer); notice.textContent = message; noticeTimer = setTimeout(() => { notice.textContent = ''; }, 5000); }
function link(path, label, className = '') { return `<a href="#${path}" class="${className}">${label}</a>`; }
function heading(label, english, right = '') { return `<p class="eyebrow">${english}</p><div class="title-row"><h1 tabindex="-1">${label}</h1>${right}</div>`; }
function navigation(active, hidden = false) {
  nav.hidden = hidden;
  nav.innerHTML = ['inventory', 'archive', 'settings'].map((key, index) => `<a href="#/${key}" ${key === active ? 'aria-current="page"' : ''}><svg viewBox="0 0 24 24" aria-hidden="true">${icons[key]}</svg>${['在庫', 'アーカイブ', '設定'][index]}</a>`).join('');
}
function formSnapshot() {
  const form = document.querySelector('#bean-form, #preset-form');
  return form ? JSON.stringify([...new FormData(form)]) : '';
}
function dirty() { return Boolean(formBaseline && formBaseline !== formSnapshot()); }
function canLeave() { return !busy && (!dirty() || window.confirm('入力中の変更を破棄して移動しますか？')); }
function go(path) {
  if (!canLeave()) return;
  formBaseline = '';
  if (location.hash === `#${path}`) render(); else location.hash = path;
}
document.addEventListener('click', event => {
  const anchor = event.target.closest('a[href^="#/"]');
  if (!anchor || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault(); go(anchor.hash.slice(1));
});
window.addEventListener('hashchange', () => {
  const next = location.hash.slice(1);
  if (next !== route && !canLeave()) { history.replaceState(null, '', `#${route}`); return; }
  formBaseline = ''; render();
});
window.addEventListener('beforeunload', event => { if (dirty() || busy) { event.preventDefault(); event.returnValue = ''; } });

function age(bean, withDays = false) {
  const days = ageDays(bean.roastDate);
  if (days < 0) return '焙煎日を確認';
  // Under a month the label is already the day count.
  const total = withDays && elapsedMonths(bean.roastDate) >= 1 ? `<small>（${days.toLocaleString('ja-JP')}日）</small>` : '';
  return `${escape(ageLabel(bean.roastDate))}${total}`;
}
function roast(bean) {
  const dots = bean.roastType === 'scale' ? `<span class="roast-dots" aria-hidden="true">${[1,2,3,4,5].map(n => `<i class="${n <= bean.roastValue ? 'on' : ''}"></i>`).join('')}</span>` : '';
  return `${dots}焙煎度 ${escape(roastLabel(bean))}`;
}
function openedLabel(bean) { return bean.openedDate ? bean.openedDate === 'unknown' ? '不明' : dateLabel(bean.openedDate) : '未開封'; }
function openedShort(bean) { return bean.openedDate ? bean.openedDate === 'unknown' ? '不明' : compactDate(bean.openedDate) : '未開封'; }
function timeLabel(value) { return new Intl.DateTimeFormat('ja-JP', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)); }
function localDate(value) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
function matchesSearch(bean, query) {
  const needle=query.normalize('NFKC').toLocaleLowerCase('ja');
  return !needle||`${bean.name}\n${bean.notes||''}`.normalize('NFKC').toLocaleLowerCase('ja').includes(needle);
}
function finishedWithin(bean, months) {
  if(!months)return true;
  const cutoff=new Date(),day=cutoff.getDate();cutoff.setDate(1);cutoff.setMonth(cutoff.getMonth()-months);cutoff.setDate(Math.min(day,new Date(cutoff.getFullYear(),cutoff.getMonth()+1,0).getDate()));
  return new Date(bean.finishedAt)>=cutoff;
}
function finishReasonLabel(bean) {return bean.finishedReason?finishReasons[bean.finishedReason]:'未記録';}
function card(bean, archived) {
  return link(`/beans/${bean.id}`, `<div class="bean-name">${escape(bean.name)}</div><div class="bean-age">${archived ? `アーカイブ <small>${escape(timeLabel(bean.finishedAt))}</small>` : age(bean)}</div><div class="bean-meta"><span>${roast(bean)}</span><span>焙煎日 ${dateLabel(bean.roastDate)}</span><span>開封 ${escape(openedLabel(bean))}</span></div>`, 'bean-card');
}
function groupCard(group, archived = false) {
  const rows=group.beans.map((bean,i)=>{
    const finishedDate=archived?localDate(bean.finishedAt):null;
    const period=ageLabel(bean.roastDate,finishedDate||today());
    const last=archived?compactDate(finishedDate):openedShort(bean);
    return link(`/beans/${bean.id}`,`<span class="batch-index">${i+1}.</span><span class="batch-age">${escape(period)}</span><span class="batch-roast" aria-label="焙煎度" title="${escape(roastLabel(bean))}">${escape(bean.roastType==='scale'?bean.roastValue:bean.roastCustom)}</span><time datetime="${bean.roastDate}">${compactDate(bean.roastDate)}</time><span class="batch-opened${!archived&&!bean.openedDate?' unopened':''}" aria-label="${archived?'アーカイブ日':'開封'}">${escape(last)}</span><span aria-hidden="true">›</span>`,'batch-row');
  }).join('');
  return `<section class="bean-group"><div class="group-title"><h2>${escape(group.name)}</h2><span>${group.beans.length}袋</span></div><div class="batch-labels" aria-hidden="true"><span></span><span>${archived?'保管':'経過'}</span><span>焙煎度</span><span>焙煎日</span><span>${archived?'終了日':'開封'}</span><span></span></div>${rows}</section>`;
}
function listView(beans, archived, presets = []) {
  const total = beans.filter(b => b.status === (archived ? 'archived' : 'active'));
  const query=archived?archiveQuery:inventoryQuery,mode=archived?archiveViewMode:viewMode;
  const names=groupBeans(total,presets).map(group=>group.name);
  if(archived&&archiveBean&&!names.includes(archiveBean))archiveBean='';
  const filtered=total.filter(bean=>matchesSearch(bean,query)&&(archived
    ? (!archiveBean||bean.name===archiveBean)&&finishedWithin(bean,archivePeriod)&&(archiveReason==='all'||(archiveReason==='unknown'?!bean.finishedReason:bean.finishedReason===archiveReason))
    : (!filterMonths||elapsedMonths(bean.roastDate)>=filterMonths)&&(openedFilter==='all'||(openedFilter==='opened'?bean.openedDate!==null:bean.openedDate===null))));
  const collection=sortBeans(filtered,archived);
  if((!archived&&mode==='newest')||(archived&&mode==='oldest'))collection.reverse();
  const activeFilters=Boolean(query||(archived?(archiveBean||archivePeriod||archiveReason!=='all'):(filterMonths||openedFilter!=='all')));
  const viewOptions=(archived?archiveViewModes:viewModes).map(([value,label])=>`<option value="${value}" ${mode===value?'selected':''}>${label}</option>`).join('');
  const search=`<div class="list-search"><label class="visually-hidden" for="list-search">豆名・備考を検索</label><input id="list-search" type="search" enterkeyhint="search" placeholder="豆名・備考を検索" value="${escape(query)}"></div>`;
  const controls=archived
    ? `<div class="archive-filters"><select id="archive-bean" aria-label="豆を選択"><option value="">すべての豆</option>${names.map(name=>`<option value="${escape(name)}" ${archiveBean===name?'selected':''}>${escape(name)}</option>`).join('')}</select><select id="archive-period" aria-label="終了期間"><option value="0" ${!archivePeriod?'selected':''}>期間：全て</option><option value="3" ${archivePeriod===3?'selected':''}>直近3ヶ月</option><option value="12" ${archivePeriod===12?'selected':''}>1年以内</option></select><select id="archive-reason" aria-label="終了区分"><option value="all" ${archiveReason==='all'?'selected':''}>区分：全て</option><option value="consumed" ${archiveReason==='consumed'?'selected':''}>飲み切り</option><option value="gifted" ${archiveReason==='gifted'?'selected':''}>譲渡</option><option value="discarded" ${archiveReason==='discarded'?'selected':''}>廃棄</option><option value="unknown" ${archiveReason==='unknown'?'selected':''}>未記録</option></select></div><div class="list-controls archive-controls"><label class="view-select"><span class="visually-hidden">並び順</span><select id="view-mode">${viewOptions}</select></label></div>`
    : `<div class="list-controls"><div class="filters" role="group" aria-label="保管期間">${filters.map(([months,label])=>`<button class="secondary" data-filter="${months}" aria-pressed="${filterMonths===months}">${label}</button>`).join('')}</div><div class="filter-selects"><select id="opened-filter" aria-label="開封状態"><option value="all" ${openedFilter==='all'?'selected':''}>すべての開封状態</option><option value="unopened" ${openedFilter==='unopened'?'selected':''}>未開封</option><option value="opened" ${openedFilter==='opened'?'selected':''}>開封済み</option></select><label class="view-select"><span class="visually-hidden">並び順</span><select id="view-mode">${viewOptions}</select></label></div></div>`;
  navigation(archived ? 'archive' : 'inventory');
  app.innerHTML = heading(archived ? 'アーカイブ' : '現在の貯蔵数', archived ? 'YOUR COFFEE HISTORY' : 'IN YOUR CELLAR', `<span class="count"><strong>${total.length}</strong>袋</span>`)
    + search+controls+(activeFilters?`<p class="hint result-count">該当 ${collection.length} / ${total.length}袋</p>`:'')
    + (collection.length ? `<div class="bean-list">${mode==='grouped'?groupBeans(collection,presets,archived).map(group=>groupCard(group,archived)).join(''):collection.map(bean => card(bean, archived)).join('')}</div>`
      : `<section class="empty"><span class="empty-symbol" aria-hidden="true">◒</span><h2>${total.length&&activeFilters?'条件に合う豆はありません':archived?'まだ履歴はありません':'最初のひと袋を、セラーへ。'}</h2><p>${total.length&&activeFilters?'検索や絞り込みの条件を変えてください。':archived?'アーカイブした豆は、ここに記録として残ります。':'豆の名前と焙煎日を記録して、熟成の時間を見守りましょう。'}</p>${archived||total.length? '':link('/beans/new', '＋ 豆を追加', 'button primary')}</section>`)
    + (!archived && collection.length ? link('/beans/new', '<span aria-hidden="true">＋</span> 豆を追加', 'button primary add-bar') : '');
}
function detailView(bean) {
  const archived = bean.status === 'archived';
  navigation(archived ? 'archive' : 'inventory');
  app.innerHTML = link(archived ? '/archive' : '/inventory', `‹ ${archived ? 'アーカイブ' : '在庫'}に戻る`, 'back')
    + `<div>${archived ? '<span class="badge">アーカイブ済み</span>' : ''}</div>` + heading(escape(bean.name), 'COFFEE DETAILS')
    + `<p class="detail-age">${age(bean, true)}</p><p class="hint">焙煎から現在まで</p><section class="panel"><dl class="detail-grid">`
    + [['焙煎度', roastLabel(bean)], ['焙煎日', dateLabel(bean.roastDate)], ['開封日', openedLabel(bean)], ['登録日時', timeLabel(bean.createdAt)], ...(archived ? [['アーカイブ日時', timeLabel(bean.finishedAt)],['終了区分',finishReasonLabel(bean)]] : [])].map(([label, value]) => `<div><dt>${label}</dt><dd>${escape(value)}</dd></div>`).join('')
    + `<div><dt>備考</dt><dd class="bean-notes">${escape(bean.notes || '未記入')}</dd></div></dl></section><div class="actions">${link(`/beans/${bean.id}/edit`, '編集', 'button secondary')}${archived ? '' : `<button id="open-action" class="secondary">${bean.openedDate ? '開封日を変更' : '開封'}</button>`}</div><div class="actions"><button id="bean-action" class="${archived ? 'danger' : 'primary'}">${archived ? '完全に削除' : 'アーカイブへ移す'}</button></div><p class="error" id="action-error" role="alert"></p>`;
  document.querySelector('#open-action')?.addEventListener('click', async () => {
    if (busy) return;
    const value = await askOpened(bean);
    if (value === undefined) return;
    runAction(document.querySelector('#open-action'), async () => {
      await repository.setOpened(bean.id, value);
      announce(value === null ? '未開封に戻しました。' : '開封日を保存しました。');
      await render({ preserve: true });
    }, document.querySelector('#action-error'));
  });
  document.querySelector('#bean-action').onclick = async event => {
    if (busy) return;
    if (archived && !await confirmDelete(bean.name)) return;
    const reason=archived?null:await askFinish();
    if(!archived&&reason===undefined)return;
    busy = true; event.target.disabled = true;
    try {
      if (archived) await repository.remove(bean.id); else await repository.finish(bean.id,reason);
      busy = false;
      announce(archived ? '豆を完全に削除しました。' : `${finishReasons[reason]}としてアーカイブへ移しました。`);
      if (archived) go('/archive'); else await render();
    } catch (error) {
      document.querySelector('#action-error').textContent = `保存できませんでした。${error.message}`;
      event.target.disabled = false;
    } finally { busy = false; }
  };
}
function askFinish() {
  const dialog=document.querySelector('#finish');
  return new Promise(resolve=>{
    dialog.returnValue='';
    dialog.onclose=()=>resolve(dialog.returnValue==='cancel'||!dialog.returnValue?undefined:dialog.returnValue);
    dialog.showModal();dialog.querySelector('[value="consumed"]').focus();
  });
}
function askOpened(bean) {
  const dialog = document.querySelector('#opened'), input = dialog.querySelector('#opened-date');
  input.min = bean.roastDate; input.max = today();
  input.value = bean.openedDate && bean.openedDate !== 'unknown' ? bean.openedDate : today();
  dialog.querySelector('#opened-clear').hidden = !bean.openedDate;
  return new Promise(resolve => {
    dialog.returnValue = '';
    dialog.onclose = () => resolve({ save: input.value, unknown: 'unknown', none: null }[dialog.returnValue]);
    dialog.showModal(); input.focus();
  });
}
function confirmDelete(name) {
  const dialog = document.querySelector('#confirm');
  dialog.querySelector('p').textContent = `「${name}」を完全に削除しますか？ この操作は取り消せません。`;
  return new Promise(resolve => {
    dialog.returnValue = '';
    dialog.onclose = () => resolve(dialog.returnValue === 'delete');
    document.querySelector('#cancel-confirm').onclick = () => dialog.close('cancel');
    document.querySelector('#accept-confirm').onclick = () => dialog.close('delete');
    dialog.showModal(); document.querySelector('#cancel-confirm').focus();
  });
}
function formView(bean, presets) {
  navigation('inventory', true);
  const selected = bean ? bean.roastType === 'custom' ? 'custom' : String(bean.roastValue) : '';
  app.innerHTML = link(bean ? `/beans/${bean.id}` : '/inventory', '‹ 戻る', 'back') + heading(bean ? '豆を編集' : '豆を追加', bean ? 'EDIT COFFEE' : 'A NEW ADDITION')
    + `<form id="bean-form" class="panel" novalidate>
    <div class="field"><label for="preset">プリセットから選ぶ</label><select id="preset"><option value="">豆を選択（自由入力もできます）</option>${presets.map(preset => `<option value="${escape(preset.id)}">${escape(preset.name)}</option>`).join('')}</select><p class="hint">選んだ豆名は下の欄で編集できます。</p></div>
    <div class="field"><label for="name">豆名</label><input id="name" name="name" type="text" placeholder="例：エチオピア Guji" value="${escape(bean?.name || '')}" required aria-describedby="name-error"><p id="name-error" class="error"></p></div>
    <fieldset><legend>焙煎度</legend><div class="roast-options">${['1','2','3','4','5','custom'].map(value => `<label class="roast-option"><input type="radio" name="roast" value="${value}" ${selected === value ? 'checked' : ''} aria-describedby="roast-error"><span>${value === 'custom' ? 'その他' : value}</span></label>`).join('')}</div><p id="roast-error" class="error"></p>
    <div class="custom-field" id="custom-field" ${selected === 'custom' ? '' : 'hidden'}><label for="roastCustom">焙煎度の名前</label><input id="roastCustom" name="roastCustom" type="text" placeholder="例：中深煎り" value="${escape(bean?.roastCustom || '')}" aria-describedby="roastCustom-error"><p id="roastCustom-error" class="error"></p></div></fieldset>
    <div class="field"><label for="roastDate">焙煎日</label><input id="roastDate" name="roastDate" type="date" min="0001-01-01" max="${today()}" value="${bean?.roastDate || today()}" required aria-describedby="roastDate-error"><p id="roastDate-error" class="error"></p><p class="hint">袋に記載された焙煎日を入力してください。</p></div>
    <div class="field"><label for="notes">備考（任意）</label><textarea id="notes" name="notes" rows="4" placeholder="例：友人に譲った日、飲んだときの味の感想など" aria-describedby="notes-error"></textarea><p id="notes-error" class="error"></p></div>
    ${bean?.status==='archived'?`<div class="field"><label for="finishedReason">終了区分</label><select id="finishedReason" name="finishedReason"><option value="" ${!bean.finishedReason?'selected':''}>未記録</option>${Object.entries(finishReasons).map(([value,label])=>`<option value="${value}" ${bean.finishedReason===value?'selected':''}>${label}</option>`).join('')}</select></div>`:''}
    <p id="form-error" class="error form-error" role="alert"></p><button class="primary full-width" type="submit">${bean ? '保存' : '登録'}</button></form>`;
  const form = document.querySelector('#bean-form');
  form.elements.notes.value = bean?.notes ?? '';
  document.querySelector('#preset').onchange = event => {
    const preset = presets.find(item => item.id === event.target.value);
    if (preset) form.querySelector('#name').value = preset.name;
  };
  formBaseline = formSnapshot();
  form.addEventListener('change', event => {
    if (event.target.name === 'roast') {
      document.querySelector('#custom-field').hidden = event.target.value !== 'custom';
      if (event.target.value === 'custom') document.querySelector('#roastCustom').focus();
    }
  });
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (busy) return;
    form.querySelectorAll('.error').forEach(node => { node.textContent = ''; });
    form.querySelectorAll('[aria-invalid]').forEach(node => node.removeAttribute('aria-invalid'));
    const values = new FormData(form), selection = values.get('roast');
    const input = { name: values.get('name'), roastDate: values.get('roastDate'), roastType: selection === 'custom' ? 'custom' : selection ? 'scale' : '', roastValue: selection && selection !== 'custom' ? Number(selection) : null, roastCustom: values.get('roastCustom'), notes: values.get('notes'), ...(bean?.status==='archived'?{finishedReason:values.get('finishedReason')||null}:{}) };
    const submit = form.querySelector('[type=submit]');
    try {
      validateBean(input);
      busy = true; submit.disabled = true; submit.textContent = '保存中…';
      if (bean) await repository.edit(bean.id, input); else await repository.add(input);
      if (!bean) filterMonths = 0;
      formBaseline = ''; busy = false;
      announce(bean ? '変更を保存しました。' : 'セラーに豆を追加しました。');
      go(bean ? `/beans/${bean.id}` : '/inventory');
    } catch (error) {
      if (error instanceof ValidationError) {
        let first;
        for (const [key, message] of Object.entries(error.fields)) {
          document.querySelector(`#${key}-error`).textContent = message;
          const control = form.querySelector(`[name="${key}"]`);
          control.setAttribute('aria-invalid', 'true'); first ||= control;
        }
        first?.focus();
      } else document.querySelector('#form-error').textContent = `保存できませんでした。入力内容は残っています。${error.message}`;
    } finally { busy = false; submit.disabled = false; submit.textContent = bean ? '保存' : '登録'; }
  });
}
async function exportJSON() {
  const text=serializeBackup(await repository.snapshot());
  downloadFile(text, 'application/json', `coffee-cellar-backup-${today()}.json`);
  announce('JSONファイルを書き出しました。保存先をご確認ください。');
}
async function exportCSV() {
  const {beans}=await repository.snapshot();
  downloadFile(serializeCSV(beans), 'text/csv;charset=utf-8', `coffee-cellar-${today()}.csv`);
  announce('CSVファイルを書き出しました。');
}
function downloadFile(text, type, filename) {
  const url=URL.createObjectURL(new Blob([text],{type}));
  const a=document.createElement('a');a.href=url;a.download=filename;
  document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
async function runAction(button, operation, errorNode) {
  if(busy) return;
  busy=true;button.disabled=true;
  try {await operation();}
  catch(error) {errorNode.textContent=error.name==='ConstraintError'?'同じ名前のプリセットがすでにあります。':error.message;}
  finally {busy=false;button.disabled=false;}
}
function settingsView() {
  navigation('settings');
  app.innerHTML = heading('設定', 'YOUR CELLAR')
    + `<section class="panel"><h2>豆プリセット</h2><p class="settings-note">よく買う豆を登録して、入力を手軽に。</p>${link('/settings/presets','プリセットを管理','button secondary')}</section>
    <section class="panel"><h2>バックアップと復元</h2><p class="settings-note">在庫・アーカイブ・プリセットをまとめてJSONに保存できます。</p><div class="actions"><button class="primary" id="export-json">JSONを書き出す</button><button class="secondary" id="export-csv">CSVを書き出す</button></div><div class="field"><label for="import-json">JSONから復元</label><input type="file" id="import-json" accept=".json,application/json"><p class="hint">読み込み後に内容を確認できます。復元すると全データが置き換わります。</p></div><p id="settings-error" class="error" role="alert"></p></section>
    <section class="panel"><h2>この端末に保存</h2><p class="settings-note">データはこの端末のブラウザ内に保存されます。別の端末へ移すときはJSONバックアップを使ってください。</p><p class="hint">期間フィルターは焙煎日から満了した月数で判定します（例：3月17日焙煎は9月17日から半年以上）。</p><p class="hint">ホーム画面に追加するには、Safariの共有メニューから「ホーム画面に追加」を選んでください。初回は通信可能な状態で開き、オフライン利用の準備完了を確認してください。</p><p class="hint" data-pwa-status role="status">${escape(pwaStatus)}</p></section>`;
  document.querySelector('#export-csv').onclick=event=>runAction(event.target,exportCSV,document.querySelector('#settings-error'));
  document.querySelector('#export-json').onclick=event=>runAction(event.target,exportJSON,document.querySelector('#settings-error'));
  document.querySelector('#import-json').onchange=event=>{
    const input=event.target,file=input.files[0];if(!file)return;
    runAction(input,async()=>{
      pendingBackup=null;
      pendingBackup=parseBackup(await file.text());
      busy=false;go('/settings/restore');
    },document.querySelector('#settings-error')).finally(()=>{input.value='';});
  };
}
function presetsView(presets) {
  navigation('settings');
  app.innerHTML=link('/settings','‹ 設定に戻る','back')+heading('豆プリセット','YOUR REGULARS')+
    `<p class="hint">名前をタップして編集・削除。右の≡を上下に動かすと並べ替えできます。</p><button id="add-preset" class="secondary preset-add">＋ プリセットを追加</button>
    <form id="preset-form" class="panel" hidden><label for="preset-name">プリセット名</label><input type="text" id="preset-name" name="name" required><input type="hidden" name="id"><p class="hint">名前の変更は、紐付いた在庫とアーカイブにも反映されます。</p><div class="actions"><button type="submit" class="primary">追加</button><button type="button" id="reset-preset" class="secondary">キャンセル</button></div><p class="error" id="preset-error" role="alert"></p></form>
    <p id="reorder-status" class="hint" role="status"></p><div class="preset-list">${presets.map((p,i)=>`<section class="preset-row" data-preset-row="${escape(p.id)}"><div class="preset-line"><button class="preset-name" data-preset-menu="${escape(p.id)}" aria-expanded="false" aria-controls="preset-actions-${i}">${escape(p.name)}</button><button class="drag-handle" data-handle="${escape(p.id)}" aria-label="${escape(p.name)}を並べ替え" aria-describedby="reorder-help">≡</button></div><div id="preset-actions-${i}" class="preset-actions" hidden><button class="secondary" data-edit-preset="${escape(p.id)}">編集</button><button class="secondary" data-delete-preset="${escape(p.id)}">削除</button></div></section>`).join('')||'<p class="hint">プリセットはまだありません。</p>'}</div><p id="reorder-help" class="hint">ハンドルにフォーカスして↑↓キーでも移動できます。豆別まとめの順番にも反映されます。</p>`;
  const form=document.querySelector('#preset-form');formBaseline='';
  const openForm=preset=>{
    if(busy||(dirty()&&!window.confirm('入力中の変更を破棄しますか？')))return;
    form.hidden=false;form.elements.id.value=preset?.id||'';form.elements.name.value=preset?.name||'';
    form.querySelector('[type=submit]').textContent=preset?'保存':'追加';form.querySelector('.error').textContent='';formBaseline=formSnapshot();form.elements.name.focus();
  };
  document.querySelector('#add-preset').onclick=()=>openForm();
  document.querySelector('#reset-preset').onclick=()=>{if(!busy&&(!dirty()||window.confirm('入力中の変更を破棄しますか？'))){form.hidden=true;formBaseline='';document.querySelector('#add-preset').focus();}};
  form.onsubmit=event=>{event.preventDefault();runAction(form.querySelector('[type=submit]'),async()=>{
    await repository.savePreset(form.elements.id.value||null,form.elements.name.value);formBaseline='';announce('プリセットを保存しました。');await render();
  },document.querySelector('#preset-error'));};
  app.querySelectorAll('[data-preset-menu]').forEach(button=>button.onclick=()=>{
    if(busy)return;
    const target=document.getElementById(button.getAttribute('aria-controls')),opening=target.hidden;
    app.querySelectorAll('.preset-actions').forEach(node=>{node.hidden=true;});app.querySelectorAll('[data-preset-menu]').forEach(node=>node.setAttribute('aria-expanded','false'));
    target.hidden=!opening;button.setAttribute('aria-expanded',String(opening));
  });
  app.querySelectorAll('[data-edit-preset]').forEach(button=>button.onclick=()=>openForm(presets.find(p=>p.id===button.dataset.editPreset)));
  app.querySelectorAll('[data-delete-preset]').forEach(button=>button.onclick=async()=>{
    if(busy||(dirty()&&!window.confirm('入力中の変更を破棄しますか？')))return;
    const preset=presets.find(p=>p.id===button.dataset.deletePreset);
    if(!await confirmDelete(preset.name))return;
    runAction(button,async()=>{await repository.removePreset(preset.id);formBaseline='';announce('プリセットを削除しました。豆の記録は残っています。');await render();},document.querySelector('#reorder-status'));
  });
  disposeDrag=bindReorder(document.querySelector('.preset-list'),{
    canStart:()=>!busy&&!dirty(),onBusy:value=>{busy=value;},onSave:ids=>repository.reorderPresets(ids),
    onMessage:message=>{document.querySelector('#reorder-status').textContent=message;}
  });
}
function restoreView(current) {
  navigation('settings',true);
  const incoming=counts(pendingBackup),existing=counts(current);
  const future=pendingBackup.beans.filter(b=>b.roastDate>today()).length;
  app.innerHTML=link('/settings','‹ キャンセル','back')+heading('バックアップを復元','RESTORE')+
    `<section class="panel"><p>現在のデータはすべて削除され、このファイルの内容に置き換わります。</p><p class="hint">ファイル作成日時：${escape(timeLabel(pendingBackup.exportedAt))}</p><table><thead><tr><th>種類</th><th>現在</th><th>復元後</th></tr></thead><tbody>${[['active','在庫'],['archived','アーカイブ'],['presets','プリセット']].map(([key,label])=>`<tr><th>${label}</th><td>${existing[key]}</td><td>${incoming[key]}</td></tr>`).join('')}</tbody></table>${future?`<p class="hint">未来の焙煎日が${future}件あります。端末の日付をご確認ください。</p>`:''}${pendingBackup.beans.length+pendingBackup.presets.length===0?'<p class="error">空のバックアップです。復元すると全データがなくなります。</p>':''}<div class="actions"><button id="before-restore" class="secondary">現在のデータを書き出す</button></div><div class="actions">${link('/settings','キャンセル','button secondary')}<button id="restore" class="danger">全データを置き換えて復元</button></div><p class="error" id="restore-error" role="alert"></p></section>`;
  document.querySelector('#before-restore').onclick=event=>runAction(event.target,exportJSON,document.querySelector('#restore-error'));
  document.querySelector('#restore').onclick=event=>runAction(event.target,async()=>{
    await repository.replace(pendingBackup);pendingBackup=null;filterMonths=0;scrollPositions.clear();formBaseline='';
    busy=false;announce('バックアップを復元しました。');go('/settings');
  },document.querySelector('#restore-error'));
}
async function render({ preserve = false } = {}) {
  disposeDrag();disposeDrag=()=>{};
  const token = ++renderId;
  const next = location.hash.slice(1) || '/inventory';
  if (route && next !== route) scrollPositions.set(route, window.scrollY);
  route = next;
  try {
    if (next === '/inventory' || next === '/archive') {
      const data = await repository.snapshot();
      if (token !== renderId) return;
      listView(data.beans, next === '/archive', data.presets);
    }
    else if (next === '/settings') { pendingBackup=null;settingsView(); }
    else if (next === '/settings/presets') {
      const presets=await repository.listPresets();if(token!==renderId)return;presetsView(presets);
    }
    else if (next === '/settings/restore') {
      if(!pendingBackup){history.replaceState(null,'','#/settings');return render();}
      const current=await repository.snapshot();if(token!==renderId)return;restoreView(current);
    }
    else if (next === '/beans/new') {
      const presets = await repository.listPresets();
      if (token !== renderId) return;
      formView(undefined, presets);
    }
    else {
      const match = next.match(/^\/beans\/([^/]+)(\/edit)?$/);
      if (!match) { history.replaceState(null, '', '#/inventory'); return render(); }
      const bean = await repository.get(match[1]);
      if (token !== renderId) return;
      if (!bean) {
        navigation('inventory');
        app.innerHTML = heading('この豆は見つかりません', 'NOT FOUND') + link('/inventory', '在庫に戻る', 'button secondary');
      } else if (match[2]) {
        const presets = await repository.listPresets();
        if (token !== renderId) return;
        formView(bean, presets);
      } else detailView(bean);
    }
    if (token !== renderId) return;
    if (!preserve) { app.querySelector('h1')?.focus({ preventScroll: true }); window.scrollTo(0, scrollPositions.get(next) || 0); }
  } catch (error) {
    if (token !== renderId) return;
    navigation('inventory');
    app.innerHTML = heading('セラーを開けませんでした', 'STORAGE ERROR') + `<section class="panel"><p>${escape(error.message)}</p><p class="settings-note">保存データは変更していません。ほかのCoffee Cellar画面を閉じてから、もう一度お試しください。</p><button class="primary" id="retry">再試行</button></section>`;
    document.querySelector('#retry').onclick = () => render();
  }
}
function refresh() {
  clearTimeout(midnightTimer);
  const now = new Date(), next = new Date(now);
  next.setHours(24, 0, 0, 20);
  midnightTimer = setTimeout(refresh, next - now);
  const form = document.querySelector('#bean-form');
  if (form) { form.querySelector('[name=roastDate]').max = today(); return; }
  if (document.querySelector('#preset-form') || route === '/settings/restore' || route === '/settings') return;
  if (!busy && !document.querySelector('dialog[open]')) render({ preserve: true });
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
window.addEventListener('pageshow', event => { if (event.persisted) refresh(); });
if (!location.hash) history.replaceState(null, '', '#/inventory');
refresh();

app.addEventListener('click', event => {
  const button = event.target.closest('[data-filter]');
  if (!button || busy) return;
  filterMonths = Number(button.dataset.filter);
  render({ preserve: true }).then(() => app.querySelector(`[data-filter="${filterMonths}"]`)?.focus({ preventScroll: true }));
});
app.addEventListener('change', event => {
  if(busy)return;
  const id=event.target.id;
  if(id==='view-mode'){if(route==='/archive')archiveViewMode=event.target.value;else viewMode=event.target.value;}
  else if(id==='opened-filter')openedFilter=event.target.value;
  else if(id==='archive-bean')archiveBean=event.target.value;
  else if(id==='archive-period')archivePeriod=Number(event.target.value);
  else if(id==='archive-reason')archiveReason=event.target.value;
  else return;
  render({preserve:true}).then(()=>document.querySelector(`#${id}`)?.focus({preventScroll:true}));
});
app.addEventListener('input',event=>{
  if(event.target.id!=='list-search'||event.isComposing||busy)return;
  if(route==='/archive')archiveQuery=event.target.value;else inventoryQuery=event.target.value;
  clearTimeout(searchTimer);searchTimer=setTimeout(()=>render({preserve:true}).then(()=>{
    const input=document.querySelector('#list-search');input?.focus({preventScroll:true});input?.setSelectionRange(input.value.length,input.value.length);
  }),150);
});

initializePWA();
