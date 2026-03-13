import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Camera, Upload, Search, Loader2, ExternalLink, AlertCircle, CheckCircle2, Info, ShieldCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import heic2any from 'heic2any';
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { cn } from './lib/utils';

// --- Types ---
interface ProductResult {
  productId: string;
  colorName: string;
  officialName: string;
  sourceUrls: string[];
  confidence: 'high' | 'medium' | 'low';
  alternatives?: {
    productId: string;
    colorName: string;
    officialName: string;
    reason?: string;
  }[];
  description?: string;
}

// --- App Component ---
export default function App() {
  const [images, setImages] = useState<string[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<ProductResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string>('');

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;

    setError(null);
    setResult(null);
    setProgress('画像を読み込んでいます...');

    const newImages: string[] = [];

    for (const file of acceptedFiles) {
      try {
        let processedFile = file;

        // Handle HEIC conversion
        if (file.type === 'image/heic' || file.name.toLowerCase().endsWith('.heic')) {
          setProgress(`${file.name} を変換中...`);
          const convertedBlob = await heic2any({
            blob: file,
            toType: 'image/jpeg',
            quality: 0.8
          });
          const blob = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob;
          processedFile = new File(
            [blob],
            file.name.replace(/\.heic$/i, '.jpg'),
            { type: 'image/jpeg' }
          );
        }

        const imageData = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error('ファイルの読み込みに失敗しました。'));
          reader.readAsDataURL(processedFile);
        });
        newImages.push(imageData);
      } catch (err) {
        console.error('File processing error:', err);
        setError('一部の画像の処理に失敗しました。');
      }
    }

    setImages(prev => [...prev, ...newImages]);
    setProgress('');
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png', '.webp', '.heic']
    },
    multiple: true
  });

  const removeImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  };

  const analyzeImage = async () => {
    if (images.length === 0) return;

    setIsAnalyzing(true);
    setError(null);
    setProgress('AIが複数の画像を精密解析中...');

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const model = "gemini-3.1-pro-preview";

      const prompt = `
        あなたは世界最高峰の釣具鑑定士です。提供された「複数」の画像から製品を「一分の狂いもなく」特定してください。
        釣具アパレルは同じロゴや似たデザインを長年使い回す傾向があるため、**「一見同じに見えるが実は違うモデル」を完璧に見分けること**があなたの使命です。

        【重要：構造的特徴の厳格な検証】
        - **ポケットの有無と配置**: ポケットの数、位置（胸、腰、袖）、ジッパーの向き、フラップ（蓋）の有無を「数え上げる」ように確認してください。
        - **ジッパーと開口部**: メインジッパーの数（ダブルジッパーか等）、止水ジッパーの有無、ベンチレーション（脇下の換気口）の有無。
        - **機能的ディテール**: フードの取り外し可否、袖口の二重カフス構造、裾のドローコードの位置。
        - **不一致の許容禁止**: 画像に見えるポケットが候補製品のカタログスペックに存在しない場合、またはその逆の場合は、**「別の製品」であると断定**し、再検索してください。

        【重要：検索戦略】
        1. **がまかつ（Gamakatsu）公式サイトを最優先**: まず \`gamakatsu.jp\` 内の製品情報を徹底的に調査してください。
        2. **画像検索的アプローチ**: 公式サイトで見つからない場合は、Google検索ツールを用いて、製品の特徴（色、ロゴ配置、素材感）を言語化し、画像検索結果や釣具店の在庫情報を幅広く探索してください。
        3. **Google Lens的な視点**: 画像内の微細な特徴（ジッパーの形状、ステッチのパターン、タグの断片）を「検索キーワード」に変換し、視覚的な一致を追求してください。

        【重要：超微細な差異の識別】
        - **ロゴの細部**: 刺繍の厚み、プリントの質感、ロゴ周辺のステッチの色、ロゴの微妙な傾きや配置。
        - **配色とコントラスト**: 単なる「黒」ではなく「マットな黒」か「光沢のある黒」か。パイピング（縁取り）の色、ジッパーの歯の色、裏地の色のわずかな違い。
        - **素材のパターン**: 生地の織り目、透湿防水素材（GORE-TEX等）の独特な表面パターン、補強パーツの形状。
        - **パーツの形状**: ジッパータブの刻印、ドローコードのプラスチックパーツの形状、ベルクロ（マジックテープ）の角の丸み。

        【重要：製品カテゴリーに応じた解析】
        - まず、画像から製品のカテゴリー（グローブ、レインウェア、バッグ、キャップ等）を特定してください。
        - **バッグの場合**：
            - **ハンドルの詳細**: ハンドルの色（黒か金か）、素材（成型ハンドルかテープか）、取り付け部分の形状を厳格に確認してください。
            - **付属品とパーツ**: ショルダーベルトのパッド形状、サイドポケットの有無、底面の成型パーツの色や形状、Dカンの配置。
            - **ブラックゴールドの識別**: がまかつのバッグに多い「ブラック×ゴールド」配色の場合、ゴールドのラインの太さ、ロゴの刺繍範囲、パイピングの色を類似モデルと徹底比較してください。
        - **グローブの場合**：3本切（親指・人差し指・中指が露出）か、5本切（すべての指が露出）かを「執拗に」確認してください。露出している指の数を1本ずつ指差し確認するようにカウントしてください。
        - **その他の製品**：それぞれの製品カテゴリーにおいて最も重要な識別ポイント（素材、ジッパー、ロゴ、特定の機能パーツ）に集中してください。

        【重要：画像の状態への対応】
        - 画像が「逆さま」「横向き」「斜め」であっても、頭の中で正位置に回転させて解析してください。
        - グローブの場合、指先がどの方向を向いていても、解剖学的な手の構造を理解した上で、どの指が露出（カット）されているかを正確に判定してください。

        【ステップ1：超精密視覚解析】
        - 提供されたすべての画像を比較し、1枚では見えなかった「決定的な違い」を探してください。
        - タグの断片、袖口の小さなプリント、襟元の形状など、類似モデルを排除するための「否定的な証拠」を優先的に探してください。

        【ステップ2：年式・モデルの特定】
        - 同じシリーズでも年式によってロゴの配置が数センチずれたり、ジッパーの形状が変わったりします。
        - 検索ツールを使い、「がまかつ [製品名] [年式] 違い」などのキーワードで、類似モデルとの差異を徹底的に調査してください。

        【ステップ3：自己反論と検証】
        - 「これはAというモデルに似ているが、ジッパーの色が違う。だからBというモデルの可能性が高い」といった、消去法による論理的な絞り込みを行ってください。
        - 確信が持てるまで、複数のソースURL（公式サイト、釣具店ブログ、ECサイトの画像）を比較してください。

        【出力形式】
        必ず以下のJSON形式で回答してください：
        {
          "productId": "100%一致と判断した品番。確信が持てない場合は空文字列にし、alternativesに候補を並べる。",
          "colorName": "正確なカラー名（カタログ表記）",
          "officialName": "製品の正式名称（例：〇〇グローブ 3本カット）",
          "sourceUrls": ["検証に使用した公式サイトやカタログのURL"],
          "confidence": "high" | "medium" | "low",
          "description": "【構造・微細差異の分析】ポケットの数や位置、ジッパーの仕様、ロゴの刺繍など、類似モデルと決定的に異なる構造的特徴を具体的に記述してください。例：「画像には胸ポケットが2つありますが、類似モデルのA-100は1つしかないため、本製品をB-200と特定しました」",
          "alternatives": [
            {
              "productId": "類似品番/仕様",
              "colorName": "カラー",
              "officialName": "製品名（仕様違いを含む）",
              "reason": "メインの結果と酷似しているが、どこが決定的に異なるのか（例：ロゴの配置が5cm下にある、素材が撥水ではなく防水である等）を明記してください。"
            }
          ]
        }

        ※ 日本語で回答してください。
        ※ 3本切を5本切と誤認することは、釣具鑑定士として最大の失態です。絶対に避けてください。
      `;

      const imageParts = images.map(img => {
        const base64Data = img.split(',')[1];
        const mimeType = img.split(';')[0].split(':')[1];
        return { inlineData: { data: base64Data, mimeType } };
      });

      const response = await ai.models.generateContent({
        model: model,
        contents: [
          {
            parts: [
              { text: prompt },
              ...imageParts
            ]
          }
        ],
        config: {
          tools: [{ googleSearch: {} }],
          responseMimeType: "application/json",
          thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH }
        }
      });

      const text = response.text;
      if (!text) throw new Error('AIからの応答が空でした。');

      const parsedResult = JSON.parse(text) as ProductResult;
      setResult(parsedResult);
    } catch (err) {
      console.error('Analysis error:', err);
      setError('解析中にエラーが発生しました。インターネット接続を確認するか、しばらく経ってから再度お試しください。');
    } finally {
      setIsAnalyzing(false);
      setProgress('');
    }
  };

  const reset = () => {
    setImages([]);
    setResult(null);
    setError(null);
    setProgress('');
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans selection:bg-indigo-100">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b border-slate-200 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-lg shadow-indigo-200">
              <Search size={22} />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              Fishing Apparel <span className="text-indigo-600">Finder</span>
            </h1>
          </div>
          <button
            onClick={reset}
            className="text-sm font-medium text-slate-500 hover:text-indigo-600 transition-colors"
          >
            リセット
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 md:py-12">
        <div className="grid gap-8 lg:grid-cols-2">
          {/* Left Column: Upload & Preview */}
          <section className="space-y-6">
            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-slate-900">製品を特定する</h2>
              <p className="text-slate-500">
                釣具アパレルの写真をアップロードして、品番やカラー名を検索します。
                <br />
                <span className="text-xs text-indigo-600 font-medium">※ 複数の角度から撮影すると精度が向上します。</span>
              </p>
            </div>

            <div className="space-y-4">
              <div
                {...getRootProps()}
                className={cn(
                  "flex cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed transition-all p-8 text-center",
                  isDragActive
                    ? "border-indigo-500 bg-indigo-50/50"
                    : "border-slate-300 bg-white hover:border-indigo-400 hover:bg-slate-50"
                )}
              >
                <input {...getInputProps()} />
                <div className="flex flex-col items-center gap-2">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                    <Upload size={24} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-700">
                      写真を追加
                    </p>
                    <p className="text-xs text-slate-500">
                      ドラッグ＆ドロップまたはクリック (HEIC対応)
                    </p>
                  </div>
                </div>
              </div>

              <AnimatePresence>
                {images.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="grid grid-cols-3 gap-3"
                  >
                    {images.map((img, idx) => (
                      <motion.div
                        key={idx}
                        layout
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        className="group relative aspect-square overflow-hidden rounded-2xl bg-white shadow-md"
                      >
                        <img src={img} alt={`Preview ${idx}`} className="h-full w-full object-cover" />
                        <button
                          onClick={() => removeImage(idx)}
                          className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100"
                        >
                          &times;
                        </button>
                      </motion.div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>

              {images.length > 0 && !result && !isAnalyzing && (
                <button
                  onClick={analyzeImage}
                  className="w-full flex items-center justify-center gap-2 rounded-2xl bg-indigo-600 py-4 font-bold text-white shadow-xl shadow-indigo-300 transition-transform hover:scale-[1.02] active:scale-[0.98]"
                >
                  <Search size={20} />
                  {images.length}枚の画像を解析する
                </button>
              )}

              {isAnalyzing && (
                <div className="rounded-3xl bg-white/80 p-8 text-center backdrop-blur-sm border border-slate-100 shadow-xl">
                  <Loader2 className="mx-auto mb-4 animate-spin text-indigo-600" size={48} />
                  <p className="font-bold text-slate-900">{progress}</p>
                  <p className="mt-2 text-sm text-slate-500">複数の視点から製品を特定しています...</p>
                </div>
              )}
            </div>

            {error && (
              <div className="flex items-start gap-3 rounded-2xl bg-red-50 p-4 text-red-700 border border-red-100">
                <AlertCircle className="shrink-0" size={20} />
                <p className="text-sm font-medium">{error}</p>
              </div>
            )}
          </section>

          {/* Right Column: Results */}
          <section className="space-y-6">
            <AnimatePresence>
              {result ? (
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="space-y-6"
                >
                  <div className="rounded-3xl bg-white p-6 shadow-xl shadow-slate-200 border border-slate-100">
                    <div className="mb-6 flex items-center justify-between">
                      <h3 className="text-lg font-bold text-slate-900">解析結果</h3>
                      <div className={cn(
                        "flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider",
                        result.confidence === 'high' ? "bg-emerald-100 text-emerald-700" :
                        result.confidence === 'medium' ? "bg-amber-100 text-amber-700" :
                        "bg-slate-100 text-slate-600"
                      )}>
                        {result.confidence === 'high' ? <CheckCircle2 size={14} /> : <Info size={14} />}
                        確信度: {result.confidence === 'high' ? '高' : result.confidence === 'medium' ? '中' : '低'}
                      </div>
                    </div>

                    <div className="space-y-6">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">品番</p>
                          <p className="text-xl font-black text-slate-900">{result.productId || '不明'}</p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">カラー</p>
                          <p className="text-xl font-black text-slate-900">{result.colorName || '不明'}</p>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <p className="text-xs font-bold uppercase tracking-widest text-slate-400">製品名</p>
                        <p className="text-lg font-bold text-slate-800">{result.officialName || '不明'}</p>
                      </div>

                      {result.description && (
                        <div className="space-y-1">
                          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">詳細</p>
                          <p className="text-sm leading-relaxed text-slate-600">{result.description}</p>
                        </div>
                      )}

                      <div className="space-y-3">
                        <p className="text-xs font-bold uppercase tracking-widest text-slate-400">情報ソース</p>
                        <div className="flex flex-wrap gap-2">
                          {result.sourceUrls && result.sourceUrls.length > 0 ? (
                            result.sourceUrls.map((url, idx) => (
                              <a
                                key={idx}
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1.5 rounded-lg bg-slate-50 px-3 py-2 text-xs font-medium text-indigo-600 transition-colors hover:bg-indigo-50"
                              >
                                <ExternalLink size={14} />
                                {new URL(url).hostname}
                              </a>
                            ))
                          ) : (
                            <p className="text-xs text-slate-400">ソースが見つかりませんでした</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {result.alternatives && result.alternatives.length > 0 && (
                    <div className="rounded-3xl bg-white p-6 shadow-xl shadow-slate-200 border border-slate-100">
                      <div className="mb-4 flex items-center justify-between">
                        <h3 className="text-sm font-bold uppercase tracking-widest text-slate-400">
                          {result.confidence === 'high' ? '関連製品・他の候補' : '類似品の候補'}
                        </h3>
                        {result.confidence !== 'high' && (
                          <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded uppercase">
                            要確認
                          </span>
                        )}
                      </div>
                      <div className="divide-y divide-slate-100">
                        {result.alternatives.map((alt, idx) => (
                          <div key={idx} className="py-4 first:pt-0 last:pb-0">
                            <div className="flex items-center justify-between gap-2">
                              <p className="font-bold text-slate-900">{alt.productId || '品番不明'}</p>
                              <p className="shrink-0 rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                                {alt.colorName}
                              </p>
                            </div>
                            <p className="mt-1 text-sm font-bold text-slate-700">{alt.officialName}</p>
                            {alt.reason && (
                              <p className="mt-2 text-xs leading-relaxed text-slate-500 bg-slate-50/50 p-2 rounded-lg italic">
                                &ldquo;{alt.reason}&rdquo;
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </motion.div>
              ) : (
                <div className="flex h-full min-h-[400px] flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-200 p-12 text-center text-slate-400">
                  <Camera size={48} className="mb-4 opacity-20" />
                  <p className="max-w-[240px] text-sm">
                    画像をアップロードして解析を開始すると、ここに詳細が表示されます。
                  </p>
                </div>
              )}
            </AnimatePresence>
          </section>
        </div>
      </main>

      <footer className="mt-auto border-t border-slate-200 py-8">
        <div className="mx-auto max-w-5xl px-4 text-center">
          <p className="text-xs font-medium text-slate-400">
            &copy; 2026 Fishing Apparel Finder. Powered by Google Gemini AI.
          </p>
        </div>
      </footer>
    </div>
  );
}
