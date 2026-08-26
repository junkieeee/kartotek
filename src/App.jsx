import React, { useState, useEffect } from 'react';
import { auth } from './firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import Auth from './Auth';
import {
  fetchQuestionsFromOpenRouter,
  fetchAusbildungContentFromOpenRouter,
  fetchPflegeQuestionsFromOpenRouter
} from './openrouter';
import './App.css';

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

export default function App() {
    const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [theme, setTheme] = useState(() => localStorage.getItem('kartotek_theme') || 'dark');
  const [language, setLanguage] = useState(() => localStorage.getItem('kartotek_lang') || 'tr');
  const [streak, setStreak] = useState(() => loadStreak());
  const [stats, setStats] = useState(() => loadStats());

  const [activeTab, setActiveTab] = useState('home');
  const [questions, setQuestions] = useState([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState(null);

  const [selectedLevelOrTopic, setSelectedLevelOrTopic] = useState(null);
  const [selectedPflegeTopic, setSelectedPflegeTopic] = useState(null);
  const [selectedMainCategory, setSelectedMainCategory] = useState(null);
  const [selectedSubTopic, setSelectedSubTopic] = useState(null);

  const [ausbildungContent, setAusbildungContent] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState("Sorular hazırlanıyor...");
  const [error, setError] = useState("");

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

  const dilCategories = ["A1", "A2", "B1", "B2", "Gramer Pratiği"];

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

  const loadDilQuestions = async (levelOrTopic) => {
    setSelectedLevelOrTopic(levelOrTopic);
    setIsLoading(true);
    setLoadingLabel("Sorular hazırlanıyor...");
    setError("");
    setQuestions([]);
    setCurrentQuestionIndex(0);
    setSelectedAnswer(null);

    try {
      const generated = await fetchQuestionsFromOpenRouter("Almanca Dil Eğitimi", levelOrTopic, 10);
      setQuestions(generated);
      setStreak(recordStudyToday());
    } catch (err) {
      setError("Sorular yüklenirken hata oluştu: " + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const loadPflegeQuestions = async (topic) => {
    setSelectedPflegeTopic(topic);
    setIsLoading(true);
    setLoadingLabel("Sorular hazırlanıyor...");
    setError("");
    setQuestions([]);
    setCurrentQuestionIndex(0);
    setSelectedAnswer(null);

    try {
      const generated = await fetchPflegeQuestionsFromOpenRouter(topic, 10);
      setQuestions(generated);
      setStreak(recordStudyToday());
    } catch (err) {
      setError("Mesleki sorular yüklenirken hata oluştu: " + err.message);
    } finally {
      setIsLoading(false);
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
    setSelectedLevelOrTopic(null);
    setSelectedPflegeTopic(null);
    setSelectedMainCategory(null);
    setSelectedSubTopic(null);
    setAusbildungContent("");
    setQuestions([]);
  };

  const goTo = (tab) => { setActiveTab(tab); resetNav(); };

const handleLogout = async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Çıkış yapılamadı:", error);
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
                <div className="stat-num">{stats.correct}</div>
                <div className="stat-label">doğru cevap</div>
              </div>
            </div>

            <div className="chart-card">
              <div className="chart-title">Son 7 gün</div>
              <WeeklyChart daily={stats.daily} />
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
        {!isLoading && activeTab === 'dil' && !selectedLevelOrTopic && (
          <div>
            <div className="section-head">
              <h2>Almanca Dil Eğitimi</h2>
              <p>Seviyeni seç, testle çalış.</p>
            </div>
            <div className="row-list">
              {dilCategories.map((lvl) => (
                <button key={lvl} onClick={() => loadDilQuestions(lvl)} className="row-btn">
                  <span>
                    <span className="row-title">{lvl}</span>
                    <span className="row-sub">Gramer ve dil testi</span>
                  </span>
                  <span className="row-arrow">→</span>
                </button>
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

        {/* ORTAK SORU EKRANI */}
        {!isLoading && (selectedLevelOrTopic || selectedPflegeTopic) && questions.length > 0 && (
          <div>
            <button onClick={resetNav} className="back-link">← Kategorilere geri dön</button>
            <div className="question-card">
              <span className="q-progress">SORU {currentQuestionIndex + 1} / {questions.length}</span>
              <h3 className="q-title">{questions[currentQuestionIndex].question}</h3>

              <div className="options-list">
                {questions[currentQuestionIndex].options.map((opt, idx) => {
                  let cls = "option-btn";
                  if (selectedAnswer !== null) {
                    if (idx === questions[currentQuestionIndex].correctIndex) cls += " correct";
                    else if (idx === selectedAnswer) cls += " incorrect";
                  }
                  return (
                    <button
                      key={idx}
                      disabled={selectedAnswer !== null}
                      onClick={() => {
                        setSelectedAnswer(idx);
                        setStats(recordAnswer(idx === questions[currentQuestionIndex].correctIndex));
                      }}
                      className={cls}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>

              {selectedAnswer !== null && (
                <div className="explanation-box">
                  <strong>Açıklama</strong>
                  {questions[currentQuestionIndex].explanation}
                </div>
              )}

              {selectedAnswer !== null && (
                <button
                  onClick={() => {
                    if (currentQuestionIndex < questions.length - 1) {
                      setCurrentQuestionIndex(prev => prev + 1);
                      setSelectedAnswer(null);
                    } else {
                      alert("Tebrikler, test bitti!");
                      resetNav();
                    }
                  }}
                  className="primary-btn"
                >
                  Sonraki soru →
                </button>
              )}
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