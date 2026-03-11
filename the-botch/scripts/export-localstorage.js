// LocalStorageデータをエクスポートするためのヘルパースクリプト
// ブラウザのコンソールにこのスクリプトをコピー＆ペーストして実行してください

(function exportLocalStorage() {
  const exportData = {
    events: JSON.parse(localStorage.getItem('events') || '[]'),
    participants: JSON.parse(localStorage.getItem('participants') || '[]'),
    participations: JSON.parse(localStorage.getItem('participations') || '[]')
  };
  
  const dataStr = JSON.stringify(exportData, null, 2);
  const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
  
  const exportFileDefaultName = 'localStorage-export.json';
  
  const linkElement = document.createElement('a');
  linkElement.setAttribute('href', dataUri);
  linkElement.setAttribute('download', exportFileDefaultName);
  linkElement.click();
  
  console.log('LocalStorageデータがエクスポートされました。このファイルをプロジェクトのルートディレクトリに配置し、移行スクリプトを実行してください。');
})();
