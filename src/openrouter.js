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

// 1. Genel Dil Eğitimi Soru Üretici (artık önce Firestore'a bakıyor)
export async function fetchQuestionsFromOpenRouter(category, levelOrTopic, count = 10) {
  const docId = safeId(`${category}_${levelOrTopic}`);
  const cached = await getPooledData("dilQuestions", docId);
  if (cached?.questions?.length >= count) {
    return cached.questions;
  }

  const prompt = `Sen Almanya'daki resmi dil enstitüleri (Goethe, Telc) standartlarına hakim kıdemli bir Almanca öğretmenisin. 
Kullanıcı "${category}" kategorisinde "${levelOrTopic}" seviyesinde çalışıyor. 
Duden resmi gramer kurallarına %100 sadık kalarak tam olarak ${count} adet çoktan seçmeli soru üret.

KURALLAR:
1. Soru metni ve şıklar (options) mutlaka Almanca olacak.
2. Açıklama (explanation) kesinlikle ve sadece akıcı, doğal ve anlaşılır bir Türkçe ile yazılacak (2-3 cümle).
3. Saf bir JSON dizisi döndür, asla markdown blokları kullanma.

Format:
[
  {
    "question": "Almanca soru",
    "options": ["A", "B", "C", "D"],
    "correctIndex": 0,
    "explanation": "Türkçe kural açıklaması."
  }
]`;

  const rawContent = await callOpenRouter(prompt);
  const questions = JSON.parse(rawContent);

  await savePooledData("dilQuestions", docId, { questions });
  return questions;
}

// 2. Pflegefachkraft (Mesleki Almanca Test) Soru Üretici
export async function fetchPflegeQuestionsFromOpenRouter(subTopic, count = 10) {
  const docId = safeId(subTopic);
  const cached = await getPooledData("pflegeQuestions", docId);
  if (cached?.questions?.length >= count) {
    return cached.questions;
  }

  const prompt = `Sen Almanya'da Pflegefachkraft (Hemşirelik ve Yaşlı Bakım Eğitimi) alanında uzman kıdemli bir eğitmen ve danışmansın. 
Kullanıcı Almanya'da hastane ve bakım evlerinde çalışmak için "${subTopic}" konusunda mesleki hazırlık yapıyor.

GÖREV:
Bu alt konuyla ilgili, Almanya'daki bakım standartlarına (SGB kuralları, hasta iletişimi, acil durumlar veya bakım süreçleri) uygun olarak tam ${count} adet **Çoktan Seçmeli Soru** üret.

KESİN KURALLAR:
1. Soru kökü **Türkçe** olacak.
2. Şıklar (options) 4 adet olacak ve **Türkçe** yazılacak.
3. Doğru cevap (correctIndex) belirtilecek.
4. Açıklama (explanation) **Türkçe** olacak ve Almanya'daki klinik/bakım pratiğine göre neden doğru olduğunu net bir şekilde anlatacak.
5. Saf bir JSON dizisi döndür, asla markdown blokları kullanma.

Format:
[
  {
    "question": "Türkçe mesleki soru metni",
    "options": ["Türkçe A şıkkı", "Türkçe B şıkkı", "Türkçe C şıkkı", "Türkçe D şıkkı"],
    "correctIndex": 0,
    "explanation": "Türkçe detaylı klinik açıklama."
  }
]`;

  const rawContent = await callOpenRouter(prompt);
  const questions = JSON.parse(rawContent);

  await savePooledData("pflegeQuestions", docId, { questions });
  return questions;
}

// 3. Pflegefachkraft Ausbildung Bilgi / Çalışma Notu Üretici
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
