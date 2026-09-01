// src/openrouter.js
import { db } from "./firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";

const OPENROUTER_API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY;

// Firestore doküman ID'lerinde "/" kullanılamadığı için temizliyoruz
function safeId(str) {
  return str.replace(/\//g, "-");
}

async function getPooledData(collectionName, docId) {
  try {
    const snap = await getDoc(doc(db, collectionName, docId));
    return snap.exists() ? snap.data() : null;
  } catch (err) {
    console.error("Pool okuma hatası:", err);
    return null;
  }
}

async function savePooledData(collectionName, docId, data) {
  try {
    await setDoc(doc(db, collectionName, docId), { ...data, updatedAt: Date.now() });
  } catch (err) {
    console.error("Pool kaydetme hatası:", err);
  }
}

async function callOpenRouter(prompt, retries = 3, delay = 4000) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": window.location.origin,
          "X-Title": "Kartotek App"
        },
        body: JSON.stringify({
          model: "minimax/minimax-m2.7:free",
          messages: [{ role: "user", content: prompt }]
        })
      });

      if (response.status === 429 && i < retries - 1) {
        console.warn(`429 Too Many Requests alındı, ${delay / 1000} saniye bekleniyor... (Deneme ${i + 1}/${retries})`);
        await new Promise(res => setTimeout(res, delay));
        continue;
      }

      if (!response.ok) {
        throw new Error(`OpenRouter HTTP Hatası: ${response.status}`);
      }

      const result = await response.json();
      let content = result.choices?.[0]?.message?.content || "";
      content = content.replace(/```json/g, "").replace(/```/g, "").replace(/```markdown/g, "").trim();

      if (!content) {
        throw new Error("AI yanıtı boş döndü.");
      }

      return content;
    } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise(res => setTimeout(res, delay));
    }
  }
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Basit tekilleştirme: aynı soru/sentence/words metnine sahip kayıtları eler
function dedupeQuestions(list) {
  const seen = new Set();
  const out = [];
  for (const q of list) {
    const key = (q.question || q.sentence || (q.words || []).join(" ") || "").trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(q);
  }
  return out;
}

const GENERATION_BATCH = 10;
const MAX_TOPUP_ROUNDS = 4; // tek çağrıda en fazla bu kadar ek üretim turu (API'yi boğmamak için)

/* =========================================================================
   DİL BÖLÜMÜ — çoktan seçmeli + boşluk doldurma + cümle kurma karışık soru havuzu
   ========================================================================= */

const DIL_TYPE_PROMPT = `
Karışık bir egzersiz seti üreteceksin. Setin YAKLAŞIK yarısı "multiple_choice",
çeyreği "fill_blank", çeyreği "sentence_order" tipinde olsun. Her tip için TAM olarak
aşağıdaki JSON şemasına uy, "type" alanını asla unutma:

1) multiple_choice:
{
  "type": "multiple_choice",
  "question": "Almanca soru metni",
  "options": ["A", "B", "C", "D"],
  "correctIndex": 0,
  "explanation": "Türkçe kural açıklaması."
}

2) fill_blank (boşluk doldurma — cümlede boşluk "___" ile gösterilir):
{
  "type": "fill_blank",
  "sentence": "Ich ___ jeden Tag Deutsch.",
  "options": ["lerne", "lernst", "lernt", "lernen"],
  "correctIndex": 0,
  "explanation": "Türkçe kural açıklaması."
}

3) sentence_order (cümle kurma — kelimeler karışık verilir, doğru cümle ayrıca belirtilir):
{
  "type": "sentence_order",
  "words": ["Ich", "gehe", "heute", "einkaufen"],
  "correctSentence": "Ich gehe heute einkaufen",
  "explanation": "Türkçe kural açıklaması."
}

KURALLAR:
- "options"/"words"/"question"/"sentence"/"correctSentence" alanları Almanca olacak.
- "explanation" kesinlikle akıcı ve doğal Türkçe olacak (2-3 cümle).
- fill_blank ve multiple_choice'ta "options" mutlaka 4 eleman içerecek.
- sentence_order'da "words" dizisi doğru cümledeki sırayla DEĞİL, karıştırılmış sırada olacak; "correctSentence" ise doğru, noktalama işaretsiz tam cümle olacak.
- Saf bir JSON dizisi döndür, asla markdown blokları veya açıklama metni ekleme.
`;

function buildDilPrompt(category, levelOrTopic, count) {
  return `Sen Almanya'daki resmi dil enstitüleri (Goethe, Telc) standartlarına hakim kıdemli bir Almanca öğretmenisin.
Kullanıcı "${category}" kategorisinde "${levelOrTopic}" seviyesinde çalışıyor.
Duden resmi gramer kurallarına %100 sadık kalarak tam olarak ${count} adet egzersiz üret.
${DIL_TYPE_PROMPT}`;
}

async function generateDilBatch(category, levelOrTopic, count) {
  const rawContent = await callOpenRouter(buildDilPrompt(category, levelOrTopic, count));
  const parsed = JSON.parse(rawContent);
  return Array.isArray(parsed) ? parsed : [];
}

// Havuzu en az minCount'a çıkarır; zaten yeterliyse hiçbir şey yapmaz (API çağrısı yok).
async function ensureDilPool(category, levelOrTopic, minCount) {
  const docId = safeId(`${category}_${levelOrTopic}`);
  let cached = await getPooledData("dilQuestions", docId);
  let pool = cached?.questions || [];

  let rounds = 0;
  while (pool.length < minCount && rounds < MAX_TOPUP_ROUNDS) {
    const batch = await generateDilBatch(category, levelOrTopic, GENERATION_BATCH);
    pool = dedupeQuestions([...pool, ...batch]);
    await savePooledData("dilQuestions", docId, { questions: pool });
    rounds += 1;
  }
  return pool;
}

// 1. Genel Dil Eğitimi Soru Üretici — havuzdan rastgele `count` egzersiz döner,
// havuz yetersizse önce büyütür.
export async function fetchQuestionsFromOpenRouter(category, levelOrTopic, count = 10) {
  const pool = await ensureDilPool(category, levelOrTopic, count);
  return shuffle(pool).slice(0, count);
}

// Havuzu büyütür ve sonucu döner (hata fırlatabilir — çağıran taraf isterse .catch ile
// sessizce yutabilir, isterse arka plan zamanlayıcısında sırayla await edebilir).
// "AI arka planda soru üretmeye devam etsin" isteğini karşılar: her seviye için
// havuz hedefi kademeli olarak artırılır (gerçek anlamda "sonsuz" olmasa da kullanıcı
// pratikte hiç aynı sorulara takılmaz).
export async function topUpDilPool(category, levelOrTopic, targetSize = 40) {
  return ensureDilPool(category, levelOrTopic, targetSize);
}

// Sınırsız pratik modu için: havuzu (gerekirse büyüterek) belirtilen offset'ten
// itibaren `count` adet egzersizle döner. Havuz tükenmeye yaklaşınca çağıran taraf
// daha büyük bir minCount ile tekrar çağırarak yeni sorular alabilir.
export async function fetchDilBatchForUnlimitedMode(category, levelOrTopic, offset, count = 10) {
  const pool = await ensureDilPool(category, levelOrTopic, offset + count);
  return pool.slice(offset, offset + count);
}

/* =========================================================================
   MESLEKİ (PFLEGE) SORULARI
   ========================================================================= */

function buildPflegePrompt(subTopic, count) {
  return `Sen Almanya'da Pflegefachkraft (Hemşirelik ve Yaşlı Bakım Eğitimi) alanında uzman kıdemli bir eğitmen ve danışmansın.
Kullanıcı Almanya'da hastane ve bakım evlerinde çalışmak için "${subTopic}" konusunda mesleki hazırlık yapıyor.

GÖREV:
Bu alt konuyla ilgili, Almanya'daki bakım standartlarına (SGB kuralları, hasta iletişimi, acil durumlar veya bakım süreçleri) uygun olarak tam ${count} adet **Çoktan Seçmeli Soru** üret.

KESİN KURALLAR:
1. Soru kökü **Türkçe** olacak.
2. Şıklar (options) 4 adet olacak ve **Türkçe** yazılacak.
3. Doğru cevap (correctIndex) belirtilecek.
4. Açıklama (explanation) **Türkçe** olacak ve Almanya'daki klinik/bakım pratiğine göre neden doğru olduğunu net bir şekilde anlatacak.
5. Her sorunun "type" alanı "multiple_choice" olacak.
6. Saf bir JSON dizisi döndür, asla markdown blokları kullanma.

Format:
[
  {
    "type": "multiple_choice",
    "question": "Türkçe mesleki soru metni",
    "options": ["Türkçe A şıkkı", "Türkçe B şıkkı", "Türkçe C şıkkı", "Türkçe D şıkkı"],
    "correctIndex": 0,
    "explanation": "Türkçe detaylı klinik açıklama."
  }
]`;
}

async function generatePflegeBatch(subTopic, count) {
  const rawContent = await callOpenRouter(buildPflegePrompt(subTopic, count));
  const parsed = JSON.parse(rawContent);
  return Array.isArray(parsed) ? parsed : [];
}

async function ensurePflegePool(subTopic, minCount) {
  const docId = safeId(subTopic);
  let cached = await getPooledData("pflegeQuestions", docId);
  let pool = cached?.questions || [];

  let rounds = 0;
  while (pool.length < minCount && rounds < MAX_TOPUP_ROUNDS) {
    const batch = await generatePflegeBatch(subTopic, GENERATION_BATCH);
    pool = dedupeQuestions([...pool, ...batch]);
    await savePooledData("pflegeQuestions", docId, { questions: pool });
    rounds += 1;
  }
  return pool;
}

export async function fetchPflegeQuestionsFromOpenRouter(subTopic, count = 10) {
  const pool = await ensurePflegePool(subTopic, count);
  return shuffle(pool).slice(0, count);
}

export async function topUpPflegePool(subTopic, targetSize = 40) {
  return ensurePflegePool(subTopic, targetSize);
}

/* =========================================================================
   AUSBİLDUNG NOTLARI
   ========================================================================= */

export async function fetchAusbildungContentFromOpenRouter(mainCategory, subTopic) {
  const docId = safeId(`${mainCategory}_${subTopic}`);
  const cached = await getPooledData("ausbildungContent", docId);
  if (cached?.content) {
    return cached.content;
  }

  const prompt = `Sen Almanya'daki Pflegefachkraft (Hemşirelik ve Yaşlı Bakım) eğitimi müfredatına tam hakim kıdemli bir eğitmensin.
Kullanıcı "${mainCategory}" ana başlığı altında yer alan "${subTopic}" alt konusunu detaylı bir şekilde öğrenmek istiyor.

GÖREV:
Bu konu hakkında Almanya'daki hastane ve bakım evleri (Pflegeheim) standartlarına uygun, Almanca mesleki terimleri (Fachbegriffe) de parantez içinde belirterek, kapsamlı, maddeler halinde ve akıcı bir Türkçe ile detaylı bir ders/konu özeti hazırla.

Lütfen yanıtını doğrudan düzgün yapılandırılmış metin olarak ver.`;

  const content = await callOpenRouter(prompt);

  await savePooledData("ausbildungContent", docId, { content });
  return content;
}
