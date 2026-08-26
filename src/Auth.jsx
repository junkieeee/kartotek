import React, { useState } from "react";
import { auth } from "./firebase";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from "firebase/auth";
import "./Auth.css";

export default function Auth() {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      if (isRegister) {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err) {
      setError("Giriş başarısız. Lütfen bilgilerinizi kontrol edin.");
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <span className="tab">KARTOTEK</span>

        <div className="auth-head">
          <h2>Kartotek</h2>
          <p>{isRegister ? "Çalışma grubuna hemen katıl" : "Hesabınla giriş yap"}</p>
        </div>

        {error && <div className="auth-error">{error}</div>}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="field">
            <label>E-posta adresi</label>
            <input
              type="email"
              placeholder="ornek@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="field">
            <label>Şifre</label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button type="submit" className="auth-submit">
            {isRegister ? "Kayıt Ol" : "Giriş Yap"}
          </button>
        </form>

        <p className="auth-switch">
          {isRegister ? "Zaten hesabın var mı?" : "Hesabın yok mu?"}{" "}
          <span onClick={() => setIsRegister(!isRegister)}>
            {isRegister ? "Giriş Yap" : "Kayıt Ol"}
          </span>
        </p>
      </div>
    </div>
  );
}