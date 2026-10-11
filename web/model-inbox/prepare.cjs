'use strict';
// Offline only: no .env access, no uploads, no overwrite.
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline/promises');
const assert = require('node:assert/strict');
function validSlug(s) {
  return /^[a-z0-9][a-z0-9-]*$/.test(s) && !/^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i.test(s);
}
function makeManifest(slug, name, base, prints) {
  if (!validSlug(slug) || !name.trim()) throw Error('フォルダ名・表示名を確認してください。');
  const materials = [base, ...prints.map(p => p.material)].filter(Boolean);
  if (new Set(materials).size !== materials.length) throw Error('別々の編集部分には別々のマテリアルを指定してください。');
  if (!prints.length || prints.some(p => !p.material || !Number.isFinite(p.aspect) || p.aspect <= 0)) throw Error('プリント面のマテリアル名・縦横比が不正です。');
  return {
    slug, name, category: 'グッズ', description: '', tokenCost: 1,
    isPublic: false, sortOrder: 100,
    files: { preview: 'model.glb', package: 'model.fbx' },
    slots: [
      ...(base ? [{ key:'base', type:'color', label:'本体の色', material:base, defaultColor:'#ffffff' }] : []),
      ...prints.map((p,i) => ({
        key:i === 0 ? 'print' : 'print_' + (i+1), type:'print', label:p.label,
        material:p.material, background:base ? {slot:'base'} : 'transparent',
        aspect:p.aspect, textureSize:2048
      }))
    ]
  };
}
function saveDraft(root, m) {
  if (!validSlug(m.slug)) throw Error('不正なフォルダ名です。');
  const dir = path.join(root, m.slug);
  if (fs.existsSync(dir) && fs.lstatSync(dir).isSymbolicLink()) throw Error('リンク先には保存しません。');
  fs.mkdirSync(dir, { recursive:true });
  fs.writeFileSync(path.join(dir,'template.json'), JSON.stringify(m,null,2)+'\n', {flag:'wx'});
  return dir;
}
async function main() {
  const rl = readline.createInterface({ input:process.stdin, output:process.stdout });
  async function ask(label, fallback='') {
    return (await rl.question(label + (fallback ? ' ['+fallback+']' : '') + ': ')).trim() || fallback;
  }
  try {
    console.log('\nVRPrintLab 追加準備（通信・登録・公開はしません）');
    console.log('Blenderの実際のマテリアル名を入力します。モデルの変換やUV修正は行いません。\n');
    const slug = await ask('商品ID（英小文字・数字・ハイフン。例 mug）');
    if (!validSlug(slug)) throw Error('使えない商品IDです。');
    if (fs.existsSync(path.join(__dirname,slug,'template.json'))) throw Error('設定が既にあります。上書きせず終了します。既存JSONをVS Codeで編集してください。');
    const name = await ask('表示する商品名');
    if (!name) throw Error('商品名を入力してください。');
    const b = await ask('色を変えるマテリアル名（なしなら -）','Mat_Base');
    const base = b === '-' ? '' : b;
    if (!base) console.log('本体色なしの場合、プリント画像の余白は透明になります。');
    const count = Number(await ask('別々の画像を貼る面の数（1〜8）','1'));
    if (!Number.isInteger(count) || count<1 || count>8) throw Error('面の数は1〜8です。');
    const prints=[];
    for (let i=0;i<count;i++) {
      console.log('\nプリント面 '+(i+1));
      const label=await ask('表示名',i===0?'プリント画像':'裏面の画像');
      const material=await ask('マテリアル名',i===0?'Mat_Print':'Mat_Print_'+(i+1));
      const aspect=Number(await ask('実寸の幅÷高さ（正方形1、9:16は0.5625）','1'));
      prints.push({label,material,aspect});
    }
    const manifest=makeManifest(slug,name,base,prints);
    console.log('\n'+JSON.stringify(manifest,null,2));
    if ((await ask('この内容で下書き保存？ y / n','n')).toLowerCase()!=='y') {
      console.log('保存せず終了しました。'); return;
    }
    const dir=saveDraft(__dirname,manifest);
    console.log('\n保存先: '+dir);
    console.log('同じ場所に model.glb と model.fbx を用意してください。thumbnail.png は任意です。');
    console.log('完成した3〜4ファイルだけを web/templates/'+slug+' へコピーします。');
    console.log('web フォルダで: npm.cmd run templates:check -- '+slug);
    console.log('登録手順・注意点は model-inbox/README.md を確認してください。');
  } finally { rl.close(); }
}
if (require.main===module) {
  if (process.argv.includes('--self-test')) {
    for (const s of ['mug','body-pillow','cake-2']) assert.equal(validSlug(s),true);
    for (const s of ['../cake','CON','nul','com1','my model','']) assert.equal(validSlug(s),false);
    const m=makeManifest('mug','マグ','Mat_Base',[{label:'表',material:'Mat_Print',aspect:1}]);
    assert.equal(m.isPublic,false); assert.equal(m.slots[1].background.slot,'base');
    assert.equal(makeManifest('badge','バッジ','',[{label:'画像',material:'Print',aspect:1}]).slots[0].background,'transparent');
    assert.throws(()=>makeManifest('mug','マグ','Same',[{label:'画像',material:'Same',aspect:1}]));
    assert.throws(()=>makeManifest('mug','マグ','Base',[{label:'画像',material:'Print',aspect:0}]));
    console.log('PASS: ID / defaults / transparency / duplicate materials / aspect');
  } else main().catch(e=>{ console.error('\n停止: '+e.message); process.exitCode=1; });
}
module.exports={validSlug,makeManifest,saveDraft};
