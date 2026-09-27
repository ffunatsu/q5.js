# q5.js 3D Extension Architecture Plan (WebGPU-Native)

## 1. 設計思想とマージコンフリクト対策
- **WebGPUネイティブ**: 既存の `Q5.renderers.webgpu` / WGSL基盤の上に構築。
- **ゼロ侵食・アドオン構造 (Conflict-Free)**:
  - 既存のコアコード（`q5-c2d-*.js`, `q5-core.js`, 既存の `q5-webgpu.js`）はほぼ無変更。
  - 新規ファイル `src/q5-webgpu-3d.js` で `Q5.renderers.webgpu` に3Dメソッド・WGSLシェーダー・パイプラインを動的拡張/注入。
  - 今後upstreamからプルする際も競合（conflict）が発生しません。

---

## 2. 2Dとの統合モデル
q5.js既存のテクスチャ/Canvas共有の仕組みを活用：

```javascript
// A. createGraphicsによるレイヤー統合（推奨）
let pg3d;
function setup() {
  createCanvas(800, 600); // 2D (c2d or webgpu)
  pg3d = createGraphics(800, 600, 'webgpu-3d'); // または webgpu with 3d mode
}

function draw() {
  background(220);
  
  // 3Dレイヤー描画
  pg3d.clear();
  pg3d.rotateY(0.01);
  pg3d.box(100);
  
  // 2Dキャンバスへの合成
  image(pg3d, 0, 0);
  
  // 2DのUIやテキスト描画
  text("FPS: " + frameRate(), 20, 20);
}
```

---

## 3. 3D機能スコープ (MVP)

1. **3D変換スタック (Matrix4x4)**
   - `translate(x, y, z)`, `rotateX(a)`, `rotateY(a)`, `rotateZ(a)`, `scale(x, y, z)`
   - `push()`, `pop()`
2. **点・線・ポリゴン (WGSL 3D Pipeline)**
   - `point(x, y, z)`, `line(x1, y1, z1, x2, y2, z2)`
   - `box()`, `sphere()`, `plane()`
   - `beginShape()`, `vertex(x, y, z)`, `endShape()`
3. **カメラ & ライト**
   - `camera(eyeX, eyeY, eyeZ, centerX, centerY, centerZ, upX, upY, upZ)`
   - `orbitControl()` (簡易マウス操作)
   - `ambientLight(color)`, `directionalLight(color, x, y, z)`

---

## 4. ロードマップ（段階的実装）
- **Step 1: 3Dアドオンモジュール定義 (`src/q5-webgpu-3d.js`)**
  - WGSL 3D基本シェーダー (MVP行列 + 法線 + カラー)
  - 4x4 Matrix演算ユーティリティ
- **Step 2: 変換スタック + 3D点・線・ボックス描画**
- **Step 3: カメラ・ライト制御**
- **Step 4: `image()` による2D/3D合成テスト & デモ作成
