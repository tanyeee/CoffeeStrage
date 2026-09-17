import { parseBackup, serializeBackup, counts } from './backup.js';
import { createRepository } from './db.js';
import { today, ageDays, ageLabel, dateLabel, sortBeans } from './dates.js';
import { validateBean, roastLabel, ValidationError } from './validation.js';

const app = document.querySelector('#app'), nav = document.querySelector('#nav');
const notice = document.querySelector('#notice');
const repository = createRepository({ onBlocked: () => announce('別のCoffee Cellar画面を閉じてください。'), onVersionChange: () => announce('アプリが更新されました。画面を再読み込みしてください。') });
let filterDays = 0, pendingBackup = null;
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

function age(bean) {
  const days = ageDays(bean.roastDate);
  return days < 0 ? '焙煎日を確認' : `${escape(ageLabel(bean.roastDate))}<small>（${days.toLocaleString('ja-JP')}日）</small>`;
}
function roast(bean) {
  const dots = bean.roastType === 'scale' ? `<span class="roast-dots" aria-hidden="true">${[1,2,3,4,5].map(n => `<i class="${n <= bean.roastValue ? 'on' : ''}"></i>`).join('')}</span>` : '';
  return `${dots}焙煎度 ${escape(roastLabel(bean))}`;
}
function timeLabel(value) { return new Intl.DateTimeFormat('ja-JP', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)); }
function card(bean, archived) {
  return link(`/beans/${bean.id}`, `<div class="bean-name">${escape(bean.name)}</div><div class="bean-age">${archived ? `飲み終わり <small>${escape(timeLabel(bean.finishedAt))}</small>` : age(bean)}</div><div class="bean-meta"><span>${roast(bean)}</span><span>焙煎日 ${dateLabel(bean.roastDate)}</span></div>`, 'bean-card');
}
function listView(beans, archived) {
  const total = beans.filter(b => b.status === (archived ? 'archived' : 'active'));
  const collection = sortBeans(total.filter(b => archived || !filterDays || ageDays(b.roastDate) >= filterDays), archived);
  navigation(archived ? 'archive' : 'inventory');
  app.innerHTML = heading(archived ? '飲み終わった豆' : '現在の貯蔵数', archived ? 'YOUR COFFEE HISTORY' : 'IN YOUR CELLAR', `<span class="count"><strong>${total.length}</strong>袋</span>`)
    + (archived ? '' : '<p class="subtitle">ゆっくりと時を重ねる、あなたのコーヒー</p>')
    + (archived ? '' : `<div class="filters" aria-label="保管期間">${[[0,'すべて'],[180,'半年〜'],[365,'1年〜'],[548,'1年半〜']].map(([days,label])=>`<button class="secondary" data-filter="${days}" aria-pressed="${filterDays===days}">${label}</button>`).join('')}</div>${filterDays?`<p class="hint">該当 ${collection.length} / ${total.length}袋 · ${filterDays}日以上</p>`:''}`)
    + (collection.length ? `<div class="section-label"><span>${archived ? 'ARCHIVE' : 'COLLECTION'}</span><span>${archived ? '飲み終わった順' : '焙煎日の古い順'}</span></div><div class="bean-list">${collection.map(bean => card(bean, archived)).join('')}</div>`
      : `<section class="empty"><span class="empty-symbol" aria-hidden="true">◒</span><h2>${archived ? 'まだ履歴はありません' : filterDays ? 'この期間の豆はありません' : '最初のひと袋を、セラーへ。'}</h2><p>${archived ? '飲み終わった豆は、ここに記録として残ります。' : filterDays ? '「すべて」を選ぶと全在庫を表示します。' : '豆の名前と焙煎日を記録して、熟成の時間を見守りましょう。'}</p>${archived ? '' : link('/beans/new', '＋ 豆を追加', 'button primary')}</section>`)
    + (!archived && collection.length ? link('/beans/new', '<span aria-hidden="true">＋</span> 豆を追加', 'button primary add-bar') : '');
}
function detailView(bean) {
  const archived = bean.status === 'archived';
  navigation(archived ? 'archive' : 'inventory');
  app.innerHTML = link(archived ? '/archive' : '/inventory', `‹ ${archived ? 'アーカイブ' : '在庫'}に戻る`, 'back')
    + `<div>${archived ? '<span class="badge">飲み終わった豆</span>' : ''}</div>` + heading(escape(bean.name), 'COFFEE DETAILS')
    + `<p class="detail-age">${age(bean)}</p><p class="hint">焙煎から現在まで</p><section class="panel"><dl class="detail-grid">`
    + [['焙煎度', roastLabel(bean)], ['焙煎日', dateLabel(bean.roastDate)], ['登録日時', timeLabel(bean.createdAt)], ...(archived ? [['飲み終わり日時', timeLabel(bean.finishedAt)]] : [])].map(([label, value]) => `<div><dt>${label}</dt><dd>${escape(value)}</dd></div>`).join('')
    + `</dl></section><div class="actions">${link(`/beans/${bean.id}/edit`, '編集', 'button secondary')}<button id="bean-action" class="${archived ? 'danger' : 'primary'}">${archived ? '完全に削除' : '飲み終わり'}</button></div><p class="error" id="action-error" role="alert"></p>`;
  document.querySelector('#bean-action').onclick = async event => {
    if (busy) return;
    if (archived && !await confirmDelete(bean.name)) return;
    busy = true; event.target.disabled = true;
    try {
      if (archived) await repository.remove(bean.id); else await repository.finish(bean.id);
      busy = false;
      announce(archived ? '豆を完全に削除しました。' : '飲み終わった豆に移しました。');
      if (archived) go('/archive'); else await render();
    } catch (error) {
      document.querySelector('#action-error').textContent = `保存できませんでした。${error.message}`;
      event.target.disabled = false;
    } finally { busy = false; }
  };
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
    <p id="form-error" class="error form-error" role="alert"></p><button class="primary full-width" type="submit">${bean ? '保存' : '登録'}</button></form>`;
  const form = document.querySelector('#bean-form');
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
    const input = { name: values.get('name'), roastDate: values.get('roastDate'), roastType: selection === 'custom' ? 'custom' : selection ? 'scale' : '', roastValue: selection && selection !== 'custom' ? Number(selection) : null, roastCustom: values.get('roastCustom') };
    const submit = form.querySelector('[type=submit]');
    try {
      validateBean(input);
      busy = true; submit.disabled = true; submit.textContent = '保存中…';
      if (bean) await repository.edit(bean.id, input); else await repository.add(input);
      if (!bean) filterDays = 0;
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
  const url=URL.createObjectURL(new Blob([text],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download=`coffee-cellar-backup-${today()}.json`;
  document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
  announce('JSONファイルを書き出しました。保存先をご確認ください。');
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
    <section class="panel"><h2>バックアップと復元</h2><p class="settings-note">在庫・アーカイブ・プリセットをまとめてJSONに保存できます。</p><div class="actions"><button class="primary" id="export-json">JSONを書き出す</button></div><div class="field"><label for="import-json">JSONから復元</label><input type="file" id="import-json" accept=".json,application/json"><p class="hint">読み込み後に内容を確認できます。復元すると全データが置き換わります。</p></div><p id="settings-error" class="error" role="alert"></p></section>
    <section class="panel"><h2>この端末に保存</h2><p class="settings-note">データはこの端末のブラウザ内に保存されます。別の端末へ移すときはJSONバックアップを使ってください。</p><p class="hint">期間フィルターは半年＝180日、1年＝365日、1年半＝548日以上です。</p><p class="hint">ホーム画面に追加するには、Safariの共有メニューから「ホーム画面に追加」を選んでください。起動には通信が必要です。CSV書き出しとオフライン対応は後日追加します。</p></section>`;
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
    `<form id="preset-form" class="panel"><label for="preset-name">プリセット名</label><input type="text" id="preset-name" name="name" required><input type="hidden" name="id"><div class="actions"><button type="submit" class="primary">追加</button><button type="button" id="reset-preset" class="secondary">入力をクリア</button></div><p class="error" id="preset-error" role="alert"></p></form><p class="hint">編集・削除しても登録済みの豆名は変わりません。</p><div class="preset-list">${presets.map(p=>`<section class="panel"><h2>${escape(p.name)}</h2><div class="actions"><button class="secondary" data-edit-preset="${escape(p.id)}">編集</button><button class="secondary" data-delete-preset="${escape(p.id)}">削除</button></div></section>`).join('') || '<p class="hint">プリセットはまだありません。自由入力で豆を登録できます。</p>'}</div>`;
  const form=document.querySelector('#preset-form');formBaseline=formSnapshot();
  const reset=()=>{form.reset();form.querySelector('[name=id]').value='';form.querySelector('[type=submit]').textContent='追加';formBaseline=formSnapshot();};
  document.querySelector('#reset-preset').onclick=()=>{if(!busy && (!dirty()||window.confirm('入力をクリアしますか？')))reset();};
  form.onsubmit=event=>{
    event.preventDefault();
    runAction(form.querySelector('[type=submit]'),async()=>{
      await repository.savePreset(form.elements.id.value||null,form.elements.name.value);
      formBaseline='';announce('プリセットを保存しました。');await render();
    },document.querySelector('#preset-error'));
  };
  app.querySelectorAll('[data-edit-preset]').forEach(button=>button.onclick=()=>{
    if(busy || (dirty()&&!window.confirm('入力中の変更を破棄しますか？')))return;
    const preset=presets.find(p=>p.id===button.dataset.editPreset);
    form.elements.id.value=preset.id;form.elements.name.value=preset.name;
    form.querySelector('[type=submit]').textContent='保存';formBaseline=formSnapshot();form.elements.name.focus();
  });
  app.querySelectorAll('[data-delete-preset]').forEach(button=>button.onclick=async()=>{
    if(busy || (dirty()&&!window.confirm('入力中の変更を破棄しますか？')))return;
    const preset=presets.find(p=>p.id===button.dataset.deletePreset);
    if(!await confirmDelete(preset.name))return;
    runAction(button,async()=>{await repository.removePreset(preset.id);formBaseline='';announce('プリセットを削除しました。');await render();},document.querySelector('#preset-error'));
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
    await repository.replace(pendingBackup);pendingBackup=null;filterDays=0;scrollPositions.clear();formBaseline='';
    busy=false;announce('バックアップを復元しました。');go('/settings');
  },document.querySelector('#restore-error'));
}
async function render({ preserve = false } = {}) {
  const token = ++renderId;
  const next = location.hash.slice(1) || '/inventory';
  if (route && next !== route) scrollPositions.set(route, window.scrollY);
  route = next;
  try {
    if (next === '/inventory' || next === '/archive') {
      const beans = await repository.list();
      if (token !== renderId) return;
      listView(beans, next === '/archive');
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
  if (!busy && !document.querySelector('#confirm').open) render({ preserve: true });
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
window.addEventListener('pageshow', event => { if (event.persisted) refresh(); });
if (!location.hash) history.replaceState(null, '', '#/inventory');
refresh();

app.addEventListener('click',event=>{const button=event.target.closest('[data-filter]');if(button&&!busy){filterDays=Number(button.dataset.filter);render({preserve:true});}});
