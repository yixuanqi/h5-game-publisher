// Only persistence scheduling and browser presentation calls are platform-specific.
// Preserve the original serializer, schema, migration and deserializer.
export function transformSave(src){
  const edits=[
    ["  G.saveDirtyTimer = 0;\n  if (!showToast && G.gameState === 'playing') {\n    const writeNow = () => storage.setJSON(targetKey, payload);\n    if (typeof window.requestIdleCallback === 'function') {\n      window.requestIdleCallback(writeNow, { timeout: 1200 });\n    } else {\n      window.setTimeout(writeNow, 16);\n    }\n  } else {\n    storage.setJSON(targetKey, payload);\n  }",
     "  if (!storage.setJSON(targetKey, payload)) throw Error('Save write failed');\n  G.saveDirtyTimer = 0;"],
    ['    audio.setMuted(data.muted);','    if (audio.ctx) audio.setMuted(data.muted); else audio.muted = data.muted;'],
    ['    syncControlModeUI();','    // Canvas UI consumes state directly.'],
    ["    const muteBtn = document.getElementById('btn-mute');\n    if (muteBtn) muteBtn.textContent = audio.muted ? t('hud.muteOff') : t('hud.muteOn');","    // Canvas UI consumes state directly."]
  ];
  for(const [a,b] of edits){if(src.split(a).length-1!==1)throw Error('Unreviewed save seam: '+a);src=src.replace(a,b);}
  return src;
}
