export let pwaStatus = 'オフライン利用の準備中…';
function update(message) {
  pwaStatus = message;
  document.querySelectorAll('[data-pwa-status]').forEach(node => { node.textContent = message; });
}
export async function initializePWA() {
  if (!('serviceWorker' in navigator)) {
    update('このブラウザではオフライン起動を利用できません。'); return;
  }
  try {
    const registration = await navigator.serviceWorker.register('./service-worker.js', { scope: './', updateViaCache: 'none' });
    const display = () => {
      if (registration.waiting) update('新しいバージョンがあります。入力を保存し、このアプリのすべての画面を閉じて開き直してください。');
      else if (registration.active?.state === 'activated') update('オフライン利用の準備ができました。');
    };
    const watchInstalling = () => {
      const worker = registration.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'redundant') update('更新を取得できませんでした。通信可能な状態で開き直してください。');
        else display();
      });
    };
    registration.addEventListener('updatefound', watchInstalling);
    watchInstalling();
    navigator.serviceWorker.addEventListener('controllerchange', display);
    navigator.serviceWorker.ready.then(display);
    display();
    window.addEventListener('online', () => { registration.update().catch(() => {}); });
  } catch {
    update('オフライン準備に失敗しました。通信可能な状態で再読み込みしてください。');
  }
}
