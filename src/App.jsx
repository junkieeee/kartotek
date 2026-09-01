import React, { useState, useEffect, useRef } from 'react';
import { auth } from './firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import Auth from './Auth';
import {
  fetchQuestionsFromOpenRouter,
  fetchAusbildungContentFromOpenRouter,
  fetchPflegeQuestionsFromOpenRouter,
  fetchLevelLessonFromOpenRouter,
  fetchDilBatchForUnlimitedMode,
  topUpDilPool,
  topUpPflegePool
} from './openrouter';
import './App.css';

const DIL_CATEGORY = "Almanca Dil Eğitimi";

/* ---------- ikonlar (emoji değil, çizgi SVG) ---------- */

const Icon = {
  Home: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}>
      <path d="M3 11.5 12 4l9 7.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5.5 10v9a1 1 0 0 0 1 1H10v-6h4v6h3.5a1 1 0 0 0 1-1v-9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  Language: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.6 3.8 5.7 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.7-3.8-9s1.3-6.4 3.8-9Z" />
    </svg>
  ),
  Medical: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="3" />
      <path d="M12 8v8M8 12h8" strokeLinecap="round" />
    </svg>
  ),
  Notes: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}>
      <path d="M6 3.5h9L19 8v12.5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-16a1 1 0 0 1 1-1Z" />
      <path d="M14 3.5V8h5M8.5 12.5h7M8.5 16h7" strokeLinecap="round" />
    </svg>
  ),
  Settings: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 13.5a7.6 7.6 0 0 0 0-3l2-1.4-2-3.4-2.3.8a7.6 7.6 0 0 0-2.6-1.5L14 2.5h-4l-.5 2.5a7.6 7.6 0 0 0-2.6 1.5l-2.3-.8-2 3.4 2 1.4a7.6 7.6 0 0 0 0 3l-2 1.4 2 3.4 2.3-.8c.75.66 1.63 1.17 2.6 1.5l.5 2.5h4l.5-2.5a7.6 7.6 0 0 0 2.6-1.5l2.3.8 2-3.4-2-1.4Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  Streak: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}>
      <path d="M12 3c1 3-2 4-2 7a4 4 0 0 0 8 0c1.5 1.6 2 3.4 2 5a6 6 0 1 1-12 0c0-3.5 2-5 4-12Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  Sun: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}>
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.5v2M12 19.5v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2.5 12h2M19.5 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" strokeLinecap="round" />
    </svg>
  ),
  Moon: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}>
      <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
};

/* ---------- basit günlük seri (streak) takibi ---------- */

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function loadStreak() {
  try {
    const raw = localStorage.getItem('kartotek_streak');
    return raw ? JSON.parse(raw) : { count: 0, lastDate: null };
  } catch {
    return { count: 0, lastDate: null };
  }
}

function recordStudyToday() {
  const today = todayStr();
  const data = loadStreak();
  if (data.lastDate === today) return data;

  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const nextCount = data.lastDate === yesterday ? data.count + 1 : 1;
  const next = { count: nextCount, lastDate: today };
  localStorage.setItem('kartotek_streak', JSON.stringify(next));
  return next;
}

/* ---------- soru istatistikleri (toplam / doğru / günlük) ---------- */

function loadStats() {
  try {
    const raw = localStorage.getItem('kartotek_stats');
    return raw ? JSON.parse(raw) : { total: 0, correct: 0, daily: {} };
  } catch {
    return { total: 0, correct: 0, daily: {} };
  }
}

function recordAnswer(isCorrect) {
  const today = todayStr();
  const data = loadStats();
  data.total += 1;
  if (isCorrect) data.correct += 1;
  data.daily[today] = (data.daily[today] || 0) + 1;
  localStorage.setItem('kartotek_stats', JSON.stringify(data));
  return data;
}

/* ---------- sınav geçmişi (başarı oranı grafiği + not skalası için) ---------- */

function loadExamHistory() {
  try {
    const raw = localStorage.getItem('kartotek_examHistory');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveExamResult(entry) {
  const history = loadExamHistory();
  const next = [...history, entry].slice(-50);
  localStorage.setItem('kartotek_examHistory', JSON.stringify(next));
  return next;
}

const GRADE_SCALE = [
  { min: 90, label: "A+", desc: "Mükemmel" },
  { min: 80, label: "A", desc: "Çok İyi" },
  { min: 70, label: "B", desc: "İyi" },
  { min: 60, label: "C", desc: "Orta" },
  { min: 50, label: "D", desc: "Zayıf" },
  { min: 0, label: "F", desc: "Başarısız" },
];

function getGrade(percentage) {
  return GRADE_SCALE.find(g => percentage >= g.min) || GRADE_SCALE[GRADE_SCALE.length - 1];
}

function shuffleArray(arr) {
  const a = [...(arr || [])];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const DAY_LABELS = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

function last7Days(daily) {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const key = d.toISOString().slice(0, 10);
    days.push({ key, label: DAY_LABELS[(d.getDay() + 6) % 7], count: daily[key] || 0 });
  }
  return days;
}

/* ---------- sade haftalık çubuk grafik (dış kütüphane yok) ---------- */

function WeeklyChart({ daily }) {
  const days = last7Days(daily);
  const max = Math.max(1, ...days.map(d => d.count));
  const barW = 28, gap = 14, h = 90;
  const width = days.length * (barW + gap) - gap;

  return (
    <svg viewBox={`0 0 ${width} ${h + 22}`} width="100%" style={{ maxWidth: 340, display: 'block', margin: '0 auto' }}>
      {days.map((d, i) => {
        const barH = Math.round((d.count / max) * (h - 8));
        const x = i * (barW + gap);
        return (
          <g key={d.key}>
            <rect x={x} y={0} width={barW} height={h} rx={6} fill="var(--surface-alt)" />
            <rect x={x} y={h - barH} width={barW} height={Math.max(barH, d.count ? 4 : 0)} rx={6} fill="var(--primary)" />
            <text x={x + barW / 2} y={h + 15} textAnchor="middle" fontSize="10" fill="var(--text-muted)">{d.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

/* ---------- başarı oranı grafiği (son sınavlar, yüzde çizgisi) ---------- */

function SuccessRateChart({ history }) {
  const recent = history.slice(-10);

  if (recent.length === 0) {
    return <p className="empty-chart-note">Henüz tamamlanmış bir sınav yok. Bir test bitirdiğinde burada grafik olarak görünecek.</p>;
  }

  const w = 320, h = 110, padX = 16, padY = 14;
  const stepX = recent.length > 1 ? (w - padX * 2) / (recent.length - 1) : 0;
  const points = recent.map((r, i) => {
    const x = padX + i * stepX;
    const y = padY + (1 - r.percentage / 100) * (h - padY * 2);
    return { x, y, entry: r };
  });
  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const avg = Math.round(recent.reduce((s, r) => s + r.percentage, 0) / recent.length);

  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" style={{ maxWidth: 360, display: 'block', margin: '0 auto' }}>
        <line x1={padX} y1={h - padY} x2={w - padX} y2={h - padY} stroke="var(--border)" strokeWidth="1" />
        <line x1={padX} y1={padY} x2={padX} y2={h - padY} stroke="var(--border)" strokeWidth="1" />
        <path d={pathD} fill="none" stroke="var(--primary)" strokeWidth="2" />
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={3.6} fill={p.entry.percentage >= 50 ? "var(--success)" : "var(--danger)"} />
        ))}
      </svg>
      <div className="chart-avg-note">
        Son {recent.length} sınav ortalaması: <strong>%{avg}</strong>
      </div>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [theme, setTheme] = useState(() => localStorage.getItem('kartotek_theme') || 'dark');
  const [language, setLanguage] = useState(() => localStorage.getItem('kartotek_lang') || 'tr');
  const [streak, setStreak] = useState(() => loadStreak());
  const [stats, setStats] = useState(() => loadStats());
  const [examHistory, setExamHistory] = useState(() => loadExamHistory());

  const [activeTab, setActiveTab] = useState('home');
  const [questions, setQuestions] = useState([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState(null);

  const [dilMode, setDilMode] = useState('test'); // 'test' | 'unlimited'
  const [isUnlimitedMode, setIsUnlimitedMode] = useState(false);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [quizCorrect, setQuizCorrect] = useState(0);
  const [quizTotal, setQuizTotal] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const [resultData, setResultData] = useState(null);

  // cümle kurma egzersizi için
  const [sentenceWords, setSentenceWords] = useState([]);
  const [sentenceAnswer, setSentenceAnswer] = useState([]);
  const [sentenceChecked, setSentenceChecked] = useState(false);

  const [selectedLevelOrTopic, setSelectedLevelOrTopic] = useState(null);
  const [selectedPflegeTopic, setSelectedPflegeTopic] = useState(null);
  const [selectedMainCategory, setSelectedMainCategory] = useState(null);
  const [selectedSubTopic, setSelectedSubTopic] = useState(null);
  const [selectedLessonTopic, setSelectedLessonTopic] = useState(null);
  const [lessonContent, setLessonContent] = useState(null);

  const [ausbildungContent, setAusbildungContent] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState("Sorular hazırlanıyor...");
  const [error, setError] = useState("");

  const backgroundStarted = useRef(false);
  // Sınırsız pratikte arka planda getirilen soru paketlerinin, kullanıcı
  // başka bir yere geçtikten SONRA gelip listeye eklenmesini (eski sorunların
  // altta "takılı" kalmasını) engellemek için basit bir oturum sayacı.
  const sessionIdRef = useRef(0);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    localStorage.setItem('kartotek_theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('kartotek_lang', language);
  }, [language]);

  const dilCategories = ["A1", "A2", "B1", "B2","C1", "Gramer Pratiği"];

  // Seviyeye göre "Konu Anlatımı" başlıkları. "Gramer Pratiği" zaten karışık
  // bir tekrar modu olduğu için ayrı bir konu listesi yok — direkt teste gider.
  const levelTopics = {
    "A1": [
      "Artikel: der, die, das",
      "Personalpronomen",
      "Präsens (Şimdiki Zaman)",
      "Akkusativ",
      "Possessivpronomen",
      "Modalverben (Grundlagen)",
      "Perfekt (Grundlagen)",
      "Trennbare Verben",
      "W-Fragen ve Ja/Nein Fragen",
      "Negation: nicht / kein"
    ],
    "A2": [
      "Präteritum: sein, haben, Modalverben",
      "Dativ",
      "Wechselpräpositionen",
      "Komparativ ve Superlativ",
      "Adjektivdeklination (Grundlagen)",
      "Nebensätze: weil, dass, wenn",
      "Reflexive Verben",
      "Imperativ"
    ],
    "B1": [
      "Relativsätze",
      "Konjunktiv II (Grundlagen)",
      "Passiv (Grundlagen)",
      "Genitiv",
      "Temporale Nebensätze: als, wenn, während",
      "Infinitiv mit zu",
      "Indirekte Fragesätze"
    ],
    "B2": [
      "Konjunktiv I (Berichte / Referate)",
      "Partizipialkonstruktionen (Grundlagen)",
      "Nominalstil",
      "Doppelkonnektoren",
      "Modalpartikeln",
      "Kausale, konzessive ve konditionale Nebensätze"
    ],
    "C1": [
      "Konnektoren / Bağlaçlar",
      "Konjunktiv II",
      "Konjunktiv I",
      "Passiv & Passiversatzformen",
      "Partizipialkonstruktionen",
      "Nominalisierung"
    ]
  };
  const LEVELS_WITH_LESSONS = ["A1", "A2", "B1", "B2", "C1"];
  const pflegeTopics = [
    "Hasta İletişimi ve Mülakat",
    "Vital Bulgular (Tansiyon, Nabız, Ateş)",
    "İlaç Uygulama Kuralları",
    "Temel Bakım ve Hijyen",
    "Acil Durum ve Raporlama"
  ];

  const ausbildungCategories = {
    "Grundpflege (Temel Bakım ve Destek)": [
      "Körperpflege (Kişisel Hijyen ve Yıkama)",
      "Ernährung und Trinken (Beslenme ve Sıvı Takibi)",
      "Mobilität und Lagerung (Hareketlilik ve Pozisyon Verme)"
    ],
    "Krankenbeobachtung (Klinik Gözlem)": [
      "Vitalzeichen (Tansiyon, Puls, Temperatur, Atmung)",
      "Bewusstsein und Schmerz (Bilinç ve Ağrı Değerlendirmesi)",
      "Exkrete (İdrar, Dışkı ve Kusmuk Takibi)"
    ],
    "Pflegeprozess & Dokumentation (Süreç ve Belgeleme)": [
      "SIS (Strukturiertes Informationsgespräch)",
      "Pflegeplanung (Bakım Planı Hazırlama)",
      "Übergabe (Nöbet Devir Teslimi)"
    ],
    "Medizinische Grundlagen (Tıbbi Temeller)": [
      "Hygiene und Infektionsschutz (Hijyen ve Enfeksiyon Önleme)",
      "Medikamentenlehre (Temel İlaç Bilgisi)",
      "Wundversorgung (Yara Bakım İlkeleri)"
    ]
  };

  // Uygulama açıldığında (kullanıcı giriş yaptıktan sonra), her kur ve her mesleki
  // konu için AI'ın arka planda soru havuzunu büyütmesini sırayla tetikler.
  // Kullanıcıyı bekletmez; API'yi boğmamak için aralara bekleme koyar.
  useEffect(() => {
    if (!user || backgroundStarted.current) return;
    backgroundStarted.current = true;
    let cancelled = false;

    (async () => {
      for (const lvl of dilCategories) {
        if (cancelled) return;
        try { await topUpDilPool(DIL_CATEGORY, lvl, 25); } catch (e) { console.warn("Arka plan dil üretimi başarısız:", e); }
        await new Promise(res => setTimeout(res, 8000));
      }
      for (const top of pflegeTopics) {
        if (cancelled) return;
        try { await topUpPflegePool(top, 25); } catch (e) { console.warn("Arka plan mesleki üretim başarısız:", e); }
        await new Promise(res => setTimeout(res, 8000));
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Sınırsız pratik modunda, kullanıcı yüklenen sorunun sonuna yaklaşınca
  // arka planda bir sonraki paketi getirir (havuz gerekirse büyütülür).
  useEffect(() => {
    if (!isUnlimitedMode || questions.length === 0 || isFetchingMore) return;
    if (currentQuestionIndex >= questions.length - 3) {
      const sessionAtStart = sessionIdRef.current;
      setIsFetchingMore(true);
      fetchDilBatchForUnlimitedMode(DIL_CATEGORY, selectedLevelOrTopic, questions.length, 10)
        .then((more) => {
          // Kullanıcı bu sırada geri döndüyse ya da başka bir seviyeye geçtiyse,
          // gecikmiş bu sonucu görmezden gel — yoksa eski sorular "altta" listeye eklenip kalır.
          if (sessionIdRef.current !== sessionAtStart) return;
          if (more?.length) setQuestions(prev => [...prev, ...more]);
        })
        .catch((err) => console.warn("Ek soru yüklenemedi:", err))
        .finally(() => {
          if (sessionIdRef.current === sessionAtStart) setIsFetchingMore(false);
        });
    }
  }, [currentQuestionIndex, isUnlimitedMode, questions.length, selectedLevelOrTopic, isFetchingMore]);

  // Aktif soru "cümle kurma" tipindeyse kelime çiplerini hazırla
  useEffect(() => {
    const q = questions[currentQuestionIndex];
    if (q?.type === 'sentence_order') {
      setSentenceWords(shuffleArray(q.words));
      setSentenceAnswer([]);
      setSentenceChecked(false);
    }
  }, [currentQuestionIndex, questions]);

  const loadDilQuestions = async (levelOrTopic, unlimited = false) => {
    sessionIdRef.current += 1;
    setSelectedLevelOrTopic(levelOrTopic);
    setIsUnlimitedMode(unlimited);
    setIsLoading(true);
    setLoadingLabel("Sorular hazırlanıyor...");
    setError("");
    setQuestions([]);
    setCurrentQuestionIndex(0);
    setSelectedAnswer(null);
    setQuizCorrect(0);
    setQuizTotal(0);
    setShowResult(false);
    setResultData(null);

    const sessionAtStart = sessionIdRef.current;
    try {
      const generated = unlimited
        ? await fetchDilBatchForUnlimitedMode(DIL_CATEGORY, levelOrTopic, 0, 10)
        : await fetchQuestionsFromOpenRouter(DIL_CATEGORY, levelOrTopic, 10);
      if (sessionIdRef.current !== sessionAtStart) return; // kullanıcı bu arada başka bir yere geçti
      setQuestions(generated);
      setStreak(recordStudyToday());
      // bu kur için havuzu arka planda büyütmeye devam et
      topUpDilPool(DIL_CATEGORY, levelOrTopic, 40).catch(() => {});
    } catch (err) {
      if (sessionIdRef.current === sessionAtStart) setError("Sorular yüklenirken hata oluştu: " + err.message);
    } finally {
      if (sessionIdRef.current === sessionAtStart) setIsLoading(false);
    }
  };

  const loadLevelLesson = async (level, topic) => {
    setSelectedLessonTopic(topic);
    setIsLoading(true);
    setLoadingLabel(`${level} konu anlatımı hazırlanıyor...`);
    setError("");
    setLessonContent(null);

    try {
      const lesson = await fetchLevelLessonFromOpenRouter(level, topic);

      setLessonContent(lesson);
      setStreak(recordStudyToday());
    } catch (err) {
      setError(
        "Konu anlatımı yüklenirken hata oluştu: " + err.message
      );
    } finally {
      setIsLoading(false);
    }
  };

  const loadPflegeQuestions = async (topic) => {
    sessionIdRef.current += 1;
    setSelectedPflegeTopic(topic);
    setIsUnlimitedMode(false);
    setIsLoading(true);
    setLoadingLabel("Sorular hazırlanıyor...");
    setError("");
    setQuestions([]);
    setCurrentQuestionIndex(0);
    setSelectedAnswer(null);
    setQuizCorrect(0);
    setQuizTotal(0);
    setShowResult(false);
    setResultData(null);

    const sessionAtStart = sessionIdRef.current;
    try {
      const generated = await fetchPflegeQuestionsFromOpenRouter(topic, 10);
      if (sessionIdRef.current !== sessionAtStart) return;
      setQuestions(generated);
      setStreak(recordStudyToday());
      topUpPflegePool(topic, 40).catch(() => {});
    } catch (err) {
      if (sessionIdRef.current === sessionAtStart) setError("Mesleki sorular yüklenirken hata oluştu: " + err.message);
    } finally {
      if (sessionIdRef.current === sessionAtStart) setIsLoading(false);
    }
  };

  const loadAusbildungTopicContent = async (mainCategory, subTopic) => {
    setSelectedMainCategory(mainCategory);
    setSelectedSubTopic(subTopic);
    setIsLoading(true);
    setLoadingLabel("Not hazırlanıyor...");
    setError("");
    setAusbildungContent("");

    try {
      const generatedText = await fetchAusbildungContentFromOpenRouter(mainCategory, subTopic);
      setAusbildungContent(generatedText);
      setStreak(recordStudyToday());
    } catch (err) {
      setError("Konu içeriği yüklenirken hata oluştu: " + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const resetNav = () => {
    sessionIdRef.current += 1;
    setSelectedLevelOrTopic(null);
    setSelectedPflegeTopic(null);
    setSelectedMainCategory(null);
    setSelectedSubTopic(null);
    setSelectedLessonTopic(null);
    setLessonContent(null);
    setAusbildungContent("");
    setQuestions([]);
    setCurrentQuestionIndex(0);
    setSelectedAnswer(null);
    setQuizCorrect(0);
    setQuizTotal(0);
    setShowResult(false);
    setResultData(null);
    setIsUnlimitedMode(false);
    setSentenceAnswer([]);
    setSentenceWords([]);
    setSentenceChecked(false);
  };

  const goTo = (tab) => { setActiveTab(tab); resetNav(); };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Çıkış yapılamadı:", error);
    }
  };

  const currentQ = questions[currentQuestionIndex];

  const isSentenceCorrect =
    currentQ?.type === 'sentence_order' && sentenceChecked &&
    sentenceAnswer.join(' ').trim().toLowerCase() === (currentQ.correctSentence || '').trim().toLowerCase();

  const answered = currentQ?.type === 'sentence_order' ? sentenceChecked : selectedAnswer !== null;

  const handleChoiceAnswer = (idx) => {
    const isCorrect = idx === currentQ.correctIndex;
    setSelectedAnswer(idx);
    setStats(recordAnswer(isCorrect));
    setQuizTotal(t => t + 1);
    setQuizCorrect(c => (isCorrect ? c + 1 : c));
  };

  const pickWord = (word, idx) => {
    if (sentenceChecked) return;
    setSentenceAnswer(prev => [...prev, word]);
    setSentenceWords(prev => prev.filter((_, i) => i !== idx));
  };

  const undoWord = () => {
    if (sentenceChecked || sentenceAnswer.length === 0) return;
    const last = sentenceAnswer[sentenceAnswer.length - 1];
    setSentenceAnswer(prev => prev.slice(0, -1));
    setSentenceWords(prev => [...prev, last]);
  };

  const checkSentenceOrder = () => {
    const built = sentenceAnswer.join(' ').trim().toLowerCase();
    const correct = (currentQ.correctSentence || '').trim().toLowerCase();
    const isCorrect = built === correct;
    setSentenceChecked(true);
    setStats(recordAnswer(isCorrect));
    setQuizTotal(t => t + 1);
    setQuizCorrect(c => (isCorrect ? c + 1 : c));
  };

  const finishQuiz = () => {
    const total = quizTotal;
    const correct = quizCorrect;
    const percentage = total > 0 ? Math.round((correct / total) * 1000) / 10 : 0;
    const grade = getGrade(percentage);
    const entry = {
      id: Date.now(),
      date: todayStr(),
      category: selectedPflegeTopic ? 'mesleki' : 'dil',
      levelOrTopic: selectedPflegeTopic || selectedLevelOrTopic,
      correct,
      total,
      percentage,
      gradeLabel: grade.label,
      gradeDesc: grade.desc
    };
    setExamHistory(saveExamResult(entry));
    setResultData(entry);
    setShowResult(true);
  };

  const goNextQuestion = () => {
    const isLast = currentQuestionIndex >= questions.length - 1;
    if (isUnlimitedMode || !isLast) {
      setCurrentQuestionIndex(prev => prev + 1);
      setSelectedAnswer(null);
    } else {
      finishQuiz();
    }
  };

  if (authLoading) {
    return null;
  }

  if (!user) {
    return <Auth />;
  }

  return (
    <div className="app-shell" data-theme={theme}>
      <header className="app-header">
        <span className="brand">Kartotek</span>
        <button className="logout-btn" onClick={handleLogout}>Çıkış</button>
      </header>

      <main className="app-main">
        {error && <div className="error-box">{error}</div>}

        {isLoading && (
          <div className="loading-state">
            <div className="loading-dot" />
            <p>{loadingLabel}</p>
          </div>
        )}

        {/* HOME — DASHBOARD */}
        {!isLoading && activeTab === 'home' && (
          <div>
            <div className="dashboard-card">
              <Icon.Streak className="streak-icon" width={34} height={34} />
              <div>
                <div className="streak-count">{streak.count}</div>
                <div className="streak-label">günlük çalışma serisi</div>
              </div>
            </div>

            <div className="stats-row">
              <div className="stat-tile">
                <div className="stat-num">{stats.daily[todayStr()] || 0}</div>
                <div className="stat-label">bugün çözülen</div>
              </div>
              <div className="stat-tile">
                <div className="stat-num">{stats.total}</div>
                <div className="stat-label">toplam soru</div>
              </div>
              <div className="stat-tile">
                <div className="stat-num">{stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0}%</div>
                <div className="stat-label">genel başarı</div>
              </div>
            </div>

            <div className="chart-card">
              <div className="chart-title">Son 7 gün</div>
              <WeeklyChart daily={stats.daily} />
            </div>

            <div className="chart-card">
              <div className="chart-title">Başarı Oranı (son sınavlar)</div>
              <SuccessRateChart history={examHistory} />
            </div>

            <div className="section-head"><h2>Bugün ne çalışalım?</h2></div>
            <div className="quick-grid">
              <button className="quick-btn" onClick={() => goTo('dil')}>
                <Icon.Language width={22} height={22} />
                <span>
                  <span className="quick-btn-title">Almanca Dil Eğitimi </span>
                  <span className="quick-btn-sub">Seviyene göre test</span>
                </span>
              </button>
              <button className="quick-btn" onClick={() => goTo('mesleki')}>
                <Icon.Medical width={22} height={22} />
                <span>
                  <span className="quick-btn-title">Mesleki Pratik </span>
                  <span className="quick-btn-sub">Bakım senaryoları</span>
                </span>
              </button>
            </div>
          </div>
        )}

        {/* 1. DİL SEKMESİ */}
        {!isLoading && activeTab === 'dil' && !selectedLevelOrTopic && !selectedLessonTopic && (
          <div>
            <div className="section-head">
              <h2>Almanca Dil Eğitimi</h2>
              <p>Seviyeni seç, testle çalış.</p>
            </div>
            <div className="segmented dil-mode-toggle">
              <button className={dilMode === 'test' ? 'active' : ''} onClick={() => setDilMode('test')}>
                10 Soruluk Test
              </button>
              <button className={dilMode === 'unlimited' ? 'active' : ''} onClick={() => setDilMode('unlimited')}>
                ♾️ Sınırsız Pratik
              </button>
            </div>
            <div className="row-list">
              {dilCategories.map((lvl) => (
                <button
                  key={lvl}
                  className="row-btn"
                  onClick={() => {
                    if (LEVELS_WITH_LESSONS.includes(lvl)) {
                      sessionIdRef.current += 1;
                      setSelectedLevelOrTopic(lvl);
                      setSelectedLessonTopic(null);
                      setLessonContent(null);
                      setQuestions([]);
                    } else {
                      loadDilQuestions(lvl, dilMode === 'unlimited');
                    }
                  }}
                >
                  <span>
                    <span className="row-title">{lvl}</span>
                    <span className="row-sub">
                      {dilMode === 'unlimited'
                        ? 'Sınırsız — çoktan seçmeli, boşluk doldurma, cümle kurma karışık'
                        : 'Gramer ve dil testi'}
                    </span>
                  </span>
                  <span className="row-arrow">→</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* SEVİYE ANA MENÜ (A1–C1: Konu Anlatımı veya Test seç) */}
{!isLoading &&
  activeTab === 'dil' &&
  LEVELS_WITH_LESSONS.includes(selectedLevelOrTopic) &&
  !selectedLessonTopic && (
    <div>
      <button onClick={resetNav} className="back-link">
        ← Dil seviyelerine geri dön
      </button>

      <div className="section-head">
        <h2>{selectedLevelOrTopic} Almanca</h2>
        <p>Konu anlatımı veya test seç.</p>
      </div>

      <div className="row-list">

        <button
          onClick={() => {
            setSelectedLessonTopic("menu");
          }}
          className="row-btn"
        >
          <span>
            <span className="row-title">Konu Anlatımları</span>
            <span className="row-sub">
              {selectedLevelOrTopic} gramer konularını detaylı öğren
            </span>
          </span>

          <span className="row-arrow">→</span>
        </button>

        <button
          onClick={() => loadDilQuestions(selectedLevelOrTopic, dilMode === 'unlimited')}
          className="row-btn"
        >
          <span>
            <span className="row-title">{selectedLevelOrTopic} Testleri</span>
            <span className="row-sub">
              {selectedLevelOrTopic} seviyesinde kendini test et
            </span>
          </span>

          <span className="row-arrow">→</span>
        </button>

      </div>
    </div>
  )}

  {/* SEVİYE KONU LİSTESİ */}
{!isLoading &&
  activeTab === 'dil' &&
  LEVELS_WITH_LESSONS.includes(selectedLevelOrTopic) &&
  selectedLessonTopic === 'menu' &&(
    <div>
      <button
        onClick={() => {
          setSelectedLessonTopic(null);
        }}
        className="back-link"
      >
        ← {selectedLevelOrTopic}'e geri dön
      </button>

      <div className="section-head">
        <h2>{selectedLevelOrTopic} Konu Anlatımları</h2>
        <p>Konuyu öğren, örneklerle pekiştir.</p>
      </div>

      <div className="row-list">
        {(levelTopics[selectedLevelOrTopic] || []).map((topic) => (
          <button
            key={topic}
            onClick={() => loadLevelLesson(selectedLevelOrTopic, topic)}
            className="row-btn"
          >
            <span>
              <span className="row-title">{topic}</span>
              <span className="row-sub">
                Detaylı {selectedLevelOrTopic} konu anlatımı
              </span>
            </span>

            <span className="row-arrow">→</span>
          </button>
        ))}
      </div>
    </div>
  )}

  {/* SEVİYE KONU ANLATIMI */}
{!isLoading &&
  activeTab === 'dil' &&
  LEVELS_WITH_LESSONS.includes(selectedLevelOrTopic) &&
  selectedLessonTopic &&
  selectedLessonTopic !== 'menu' &&
  lessonContent && (
    <div style={{ textAlign: 'left' }}>
      <button
        onClick={() => {
          setSelectedLessonTopic("menu");
          setLessonContent(null);
        }}
        className="back-link"
      >
        ← {selectedLevelOrTopic} konularına geri dön
      </button>

      <div className="note-card">

        <h3>{lessonContent.title}</h3>

        {lessonContent.intro && (
          <div className="note-body">
            {lessonContent.intro}
          </div>
        )}

        {Array.isArray(lessonContent.sections) &&
          lessonContent.sections.map((section, index) => (
            <div key={index} className="lesson-section">

              <h3>{section.title}</h3>

              {section.explanation && (
                <p>
                  {section.explanation}
                </p>
              )}

              {section.structure && (
                <div className="lesson-structure">
                  <strong>Cümle yapısı</strong>
                  <div>{section.structure}</div>
                </div>
              )}

              {Array.isArray(section.examples) &&
                section.examples.map((example, exampleIndex) => (
                  <div
                    key={exampleIndex}
                    className="lesson-example"
                  >
                    <strong>Örnek {exampleIndex + 1}</strong>

                    <div>
                      {example.german}
                    </div>

                    <div>
                      {example.turkish}
                    </div>
                  </div>
                ))}

              {section.commonMistake && (
                <div className="lesson-mistake">
                  <strong>Sık yapılan hata</strong>
                  <div>
                    {section.commonMistake}
                  </div>
                </div>
              )}

              {section.importantNote && (
                <div className="lesson-important">
                  <strong>{selectedLevelOrTopic} notu</strong>
                  <div>
                    {section.importantNote}
                  </div>
                </div>
              )}

            </div>
          ))}

      </div>
    </div>
  )}

        {/* 2. MESLEKİ ALMANCA SEKMESİ */}
        {!isLoading && activeTab === 'mesleki' && !selectedPflegeTopic && (
          <div>
            <div className="section-head">
              <h2>Pflegefachkraft — Mesleki Pratik</h2>
              <p>Türkçe açıklamalı hastane ve bakım senaryoları.</p>
            </div>
            <div className="row-list">
              {pflegeTopics.map((top) => (
                <button key={top} onClick={() => loadPflegeQuestions(top)} className="row-btn">
                  <span className="row-title">{top}</span>
                  <span className="row-arrow">→</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ORTAK SORU EKRANI (çoktan seçmeli / boşluk doldurma / cümle kurma) */}
        {!isLoading && !showResult && (selectedLevelOrTopic || selectedPflegeTopic) && questions.length > 0 && currentQ && (
          <div>
            <button onClick={resetNav} className="back-link">← Kategorilere geri dön</button>
            <div className="question-card">
              <div className="q-topbar">
                <span className="q-progress">
                  {isUnlimitedMode ? `SORU ${currentQuestionIndex + 1} · Sınırsız` : `SORU ${currentQuestionIndex + 1} / ${questions.length}`}
                </span>
                <span className="q-live-score">{quizCorrect}/{quizTotal} doğru</span>
              </div>

              {currentQ.type === 'fill_blank' && (
                <h3 className="q-title">{(currentQ.sentence || '').replace('___', '▁▁▁▁')}</h3>
              )}
              {(currentQ.type === 'multiple_choice' || !currentQ.type) && (
                <h3 className="q-title">{currentQ.question}</h3>
              )}

              {(currentQ.type === 'multiple_choice' || currentQ.type === 'fill_blank' || !currentQ.type) && (
                <div className="options-list">
                  {currentQ.options.map((opt, idx) => {
                    let cls = "option-btn";
                    if (selectedAnswer !== null) {
                      if (idx === currentQ.correctIndex) cls += " correct";
                      else if (idx === selectedAnswer) cls += " incorrect";
                    }
                    return (
                      <button
                        key={idx}
                        disabled={selectedAnswer !== null}
                        onClick={() => handleChoiceAnswer(idx)}
                        className={cls}
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>
              )}

              {currentQ.type === 'sentence_order' && (
                <div className="sentence-order">
                  <p className="q-title sentence-instruction">Kelimeleri doğru sırada dizerek cümleyi kur:</p>
                  <div className="sentence-answer-row">
                    {sentenceAnswer.length === 0 && (
                      <span className="sentence-placeholder">Kelimelere dokunarak başla…</span>
                    )}
                    {sentenceAnswer.map((w, i) => (
                      <span
                        key={i}
                        className={`word-chip picked${sentenceChecked ? (isSentenceCorrect ? ' correct' : ' incorrect') : ''}`}
                      >
                        {w}
                      </span>
                    ))}
                  </div>
                  <div className="word-bank">
                    {sentenceWords.map((w, i) => (
                      <button key={i} className="word-chip" disabled={sentenceChecked} onClick={() => pickWord(w, i)}>
                        {w}
                      </button>
                    ))}
                  </div>
                  <div className="sentence-actions">
                    <button className="ghost-btn" disabled={sentenceChecked || sentenceAnswer.length === 0} onClick={undoWord}>
                      ← Geri al
                    </button>
                    <button className="primary-btn" disabled={sentenceChecked || sentenceAnswer.length === 0} onClick={checkSentenceOrder}>
                      Kontrol Et
                    </button>
                  </div>
                  {sentenceChecked && !isSentenceCorrect && (
                    <p className="correct-answer-hint">Doğru cümle: <strong>{currentQ.correctSentence}</strong></p>
                  )}
                </div>
              )}

              {answered && (
                <div className="explanation-box">
                  <strong>Açıklama</strong>
                  {currentQ.explanation}
                </div>
              )}

              {answered && (
                <div className="quiz-nav-actions">
                  <button onClick={goNextQuestion} className="primary-btn">
                    {isUnlimitedMode
                      ? 'Sonraki soru →'
                      : (currentQuestionIndex < questions.length - 1 ? 'Sonraki soru →' : 'Testi Bitir ve Sonucu Gör')}
                  </button>
                  {isUnlimitedMode && (
                    <button onClick={finishQuiz} className="ghost-btn">Testi Bitir</button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* SINAV SONUCU / NOT SKALASI */}
        {!isLoading && showResult && resultData && (
          <div>
            <div className="result-card">
              <div className={`result-grade grade-${resultData.gradeLabel.replace('+', 'plus')}`}>
                {resultData.gradeLabel}
              </div>
              <h2 className="result-title">{resultData.gradeDesc}</h2>
              <p className="result-sub">{resultData.levelOrTopic}</p>
              <div className="result-score">
                %{resultData.percentage} · {resultData.correct}/{resultData.total} doğru
              </div>
              <div className="result-actions">
                <button
                  className="primary-btn"
                  onClick={() => {
                    if (resultData.category === 'mesleki') {
                      loadPflegeQuestions(resultData.levelOrTopic);
                    } else {
                      loadDilQuestions(resultData.levelOrTopic, isUnlimitedMode);
                    }
                  }}
                >
                  Tekrar Dene
                </button>
                <button className="ghost-btn" onClick={resetNav}>Kategorilere Dön</button>
              </div>
            </div>
          </div>
        )}

        {/* 3. AUSBİLDUNG NOTLAR SEKMESİ */}
        {!isLoading && activeTab === 'ausbildung' && !selectedSubTopic && (
          <div>
            <div className="section-head">
              <h2>Ausbildung Çalışma Notları</h2>
              <p>Alman hemşirelik müfredatı alt konu özetleri.</p>
            </div>
            {Object.entries(ausbildungCategories).map(([mainCat, subTopics]) => (
              <div key={mainCat} className="category-block">
                <h3>{mainCat}</h3>
                <div className="subtopic-list">
                  {subTopics.map((sub) => (
                    <button
                      key={sub}
                      onClick={() => loadAusbildungTopicContent(mainCat, sub)}
                      className="subtopic-btn"
                    >
                      <span>{sub}</span>
                      <span className="row-arrow">→</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {!isLoading && activeTab === 'ausbildung' && selectedSubTopic && ausbildungContent && (
          <div>
            <button onClick={resetNav} className="back-link">← Alt konulara geri dön</button>
            <div className="note-card">
              <h3>{selectedSubTopic}</h3>
              <div className="note-body">{ausbildungContent}</div>
            </div>
          </div>
        )}

        {/* AYARLAR */}
        {!isLoading && activeTab === 'settings' && (
          <div>
            <div className="section-head"><h2>Ayarlar</h2></div>
            <div className="settings-list">
              <div className="settings-row">
                <div>
                  <div className="settings-row-title">Görünüm</div>
                  <div className="settings-row-sub">Koyu veya açık tema</div>
                </div>
                <div className="segmented">
                  <button
                    className={theme === 'dark' ? 'active' : ''}
                    onClick={() => setTheme('dark')}
                  >
                    <Icon.Moon width={14} height={14} /> Koyu
                  </button>
                  <button
                    className={theme === 'light' ? 'active' : ''}
                    onClick={() => setTheme('light')}
                  >
                    <Icon.Sun width={14} height={14} /> Açık
                  </button>
                </div>
              </div>

              <div className="settings-row">
                <div>
                  <div className="settings-row-title">Uygulama Dili</div>
                  <div className="settings-row-sub">Arayüz dilini seç</div>
                </div>
                <div className="segmented">
                  <button className={language === 'tr' ? 'active' : ''} onClick={() => setLanguage('tr')}>TR</button>
                  <button disabled title="Yakında">DE</button>
                  <button disabled title="Yakında">EN</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      <nav className="bottom-nav">
        <div className="bottom-nav-inner">
          <button onClick={() => goTo('home')} className={`nav-btn${activeTab === 'home' ? ' active' : ''}`}>
            <Icon.Home /><span>Home</span>
          </button>
          <button onClick={() => goTo('dil')} className={`nav-btn${activeTab === 'dil' ? ' active' : ''}`}>
            <Icon.Language /><span>Dil</span>
          </button>
          <button onClick={() => goTo('mesleki')} className={`nav-btn${activeTab === 'mesleki' ? ' active' : ''}`}>
            <Icon.Medical /><span>Mesleki</span>
          </button>
          <button onClick={() => goTo('ausbildung')} className={`nav-btn${activeTab === 'ausbildung' ? ' active' : ''}`}>
            <Icon.Notes /><span>Notlar</span>
          </button>
          <button onClick={() => goTo('settings')} className={`nav-btn${activeTab === 'settings' ? ' active' : ''}`}>
            <Icon.Settings /><span>Ayarlar</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
