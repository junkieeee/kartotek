// src/openrouter.js
import { db } from "./firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";

const OPENROUTER_API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY;

// Firestore doküman ID'leri için güvenli metin dönüştürücü
function safeId(str) {
  return String(str)
    .replace(/\//g, "-")
    .replace(/\s+/g, "_")
    .trim();
}

// ---------------------------------------------------------
// FIRESTORE POOL İŞLEMLERİ
// ---------------------------------------------------------

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
    await setDoc(doc(db, collectionName, docId), {
      ...data,
      updatedAt: Date.now(),
    });
  } catch (err) {
    console.error("Pool kaydetme hatası:", err);
  }
}

// ---------------------------------------------------------
// OPENROUTER API ÇAĞRISI (Retry & Rate Limit Yönetimi)
// ---------------------------------------------------------

async function callOpenRouter(prompt, retries = 3, delay = 4000) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": window.location.origin,
          "X-Title": "Kartotek App",
        },
        body: JSON.stringify({
          model: "minimax/minimax-m2.7:free",
          messages: [{ role: "user", content: prompt }],
        }),
      });

      // 429 Rate Limit Yönetimi
      if (response.status === 429 && i < retries - 1) {
        console.warn(
          `429 Too Many Requests alındı, ${delay / 1000} saniye bekleniyor... (Deneme ${i + 1}/${retries})`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenRouter HTTP Hatası: ${response.status} ${errorText}`);
      }

      const result = await response.json();
      let content = result.choices?.[0]?.message?.content || "";

      content = content
        .replace(/```json/gi, "")
        .replace(/```/g, "")
        .replace(/```markdown/gi, "")
        .trim();

      if (!content) {
        throw new Error("AI yanıtı boş döndü.");
      }

      return content;
    } catch (err) {
      console.error(`OpenRouter denemesi ${i + 1} başarısız:`, err);
      if (i === retries - 1) throw err;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

// ---------------------------------------------------------
// YARDIMCI FONKSİYONLAR
// ---------------------------------------------------------

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
const MAX_TOPUP_ROUNDS = 4; // tek çağrıda en fazla bu kadar ek üretim turu

/* =========================================================================
   1. DİL BÖLÜMÜ — Çoktan seçmeli + Boşluk doldurma + Cümle kurma Karışık Pool
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
- "explanation" kesinlikle akıcı ve doğal Türkçe olacak (2-3 cümle) ve sadece cevabı değil, gramer kuralını da açıklayacak.
- fill_blank ve multiple_choice'ta "options" mutlaka 4 eleman içerecek.
- sentence_order'da "words" dizisi doğru cümledeki sırayla DEĞİL, karıştırılmış sırada olacak; "correctSentence" ise doğru, noktalama işaretsiz tam cümle olacak.
- Seviyeye uygun zorluk kullanılacak (Örn: C1 seviyesinde akademik ve ileri düzey Almanca kullan).
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

export async function fetchQuestionsFromOpenRouter(category, levelOrTopic, count = 10) {
  const pool = await ensureDilPool(category, levelOrTopic, count);
  return shuffle(pool).slice(0, count);
}

export async function topUpDilPool(category, levelOrTopic, targetSize = 40) {
  return ensureDilPool(category, levelOrTopic, targetSize);
}

export async function fetchDilBatchForUnlimitedMode(category, levelOrTopic, offset, count = 10) {
  const pool = await ensureDilPool(category, levelOrTopic, offset + count);
  return pool.slice(offset, offset + count);
}

/* =========================================================================
   2. MESLEKİ (PFLEGEFACHKRAFT) SORULARI
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
   3. AUSBİLDUNG NOTLARI
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
Bu konu hakkında Almanya'daki hastane ve bakım evleri (Pflegeheim) standartlarına uygun, Almanca mesleki terimleri (Fachbegriffe) de parantez içinde belirterek, özet yerine kapsamlı, maddeler halinde ve akıcı bir Türkçe ile detaylı bir ders/konu özeti hazırla.

Lütfen yanıtını doğrudan düzgün yapılandırılmış metin olarak ver.`;

  const content = await callOpenRouter(prompt);

  await savePooledData("ausbildungContent", docId, { content });
  return content;
}

/* =========================================================================
   4. KONU ANLATIMLARI (TÜM SEVİYELER İÇİN DERS MÜFREDATI)
   ========================================================================= */

const LEVEL_DEPTH_HINT = {
  "A1": "Çok basit, günlük hayattan kısa cümleler kullan. Karmaşık terim kullanma, her şeyi en temelden anlat.",
  "A2": "Basit ve net günlük örnekler kullan. Temel kuralları adım adım, sade bir dille anlat.",
  "B1": "Orta düzey örnekler kullan. Kuralları detaylı ama hâlâ anlaşılır bir dille anlat, ileri düzey istisnalara çok girme.",
  "B2": "Orta-ileri düzey, biraz daha akademik örnekler kullan. İnce ayrımlara ve istisnalara da değin.",
  "C1": "Akademik ve ileri düzey Almanca kullan. İnce ayrımlara, istisnalara ve stilistik farklara detaylıca gir."
};

export async function fetchLevelLessonFromOpenRouter(level, topic) {
  const docId = safeId(`${level}_${topic}`);

  const cached = await getPooledData("levelLessons", docId);
  if (cached?.lesson) {
    return cached.lesson;
  }

  const depthHint = LEVEL_DEPTH_HINT[level] || LEVEL_DEPTH_HINT["B1"];

  const prompt = `
Sen Goethe-Institut ve telc sınavlarına hazırlayan,
Almanca gramer konusunda uzman, deneyimli bir Almanca öğretmenisin.

Öğrenci ${level} seviyesinde Almanca öğreniyor.
SEVİYE NOTU: ${depthHint}

KONU:
"${topic}"

ÇOK ÖNEMLİ:
Bu bir ÖZET DEĞİL.
Öğrenciye gerçekten ders anlatıyormuşsun gibi detaylı ve pedagojik bir konu anlatımı hazırla.

Öğrencinin şunları anlamasını sağla:
- Bu yapı nedir?
- Ne anlama gelir?
- Ne zaman kullanılır?
- Neden kullanılır?
- Nasıl kullanılır?
- Cümle yapısı nasıldır?
- Fiilin yeri neresidir?
- Hangi durumlarda tercih edilir?
- Hangi benzer yapılarla karıştırılır?
- Aralarındaki fark nedir?
- ${level} seviyesinde hangi inceliklere dikkat edilmelidir?
- En sık yapılan hatalar nelerdir?

ÖZEL OLARAK:
Eğer konu bağlaçlar / Konnektoren ise, her bağlacı TEK TEK anlat.
Her bağlaç için:
1. Almanca bağlaç
2. Türkçe anlamı
3. Kullanım amacı
4. Hangi durumda kullanıldığı
5. Cümle yapısı
6. Kelime sırası
7. Fiilin konumu
8. Resmi / günlük kullanım farkı varsa belirt
9. Benzer bağlaçlardan farkı
10. En az 2 Almanca örnek
11. Her örneğin Türkçe çevirisi
12. Sık yapılan hata
13. ${level} seviyesinde önemli kullanım notu

ÖĞRETİM TARZI:
- Türkçe anlat.
- Almanca örnekleri mutlaka göster.
- Örneklerin Türkçe çevirisini ver.
- Gerektiğinde doğru ve yanlış örnekleri karşılaştır.
- ${level} seviyesine uygun detay ver.

ÖNEMLİ:
Yanıt SADECE geçerli JSON olsun. Markdown kullanma. JSON dışında hiçbir açıklama yazma.

ŞU FORMATTA DÖN:
{
  "title": "${topic}",
  "intro": "Konunun genel açıklaması.",
  "sections": [
    {
      "title": "Alt konu başlığı",
      "explanation": "Detaylı Türkçe açıklama.",
      "structure": "Almanca cümle yapısı",
      "examples": [
        {
          "german": "Almanca örnek cümle.",
          "turkish": "Türkçe çeviri."
        },
        {
          "german": "İkinci Almanca örnek.",
          "turkish": "Türkçe çeviri."
        }
      ],
      "commonMistake": "Sık yapılan hata.",
      "importantNote": "${level} seviyesinde önemli not."
    }
  ]
}
`;

  const rawContent = await callOpenRouter(prompt);
  const lesson = JSON.parse(rawContent);

  await savePooledData("levelLessons", docId, { lesson });
  return lesson;
}