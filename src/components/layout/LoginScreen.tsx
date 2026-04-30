'use client';

import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import styles from './LoginScreen.module.css';

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [onthoud, setOnthoud] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    if (!email || !password) {
      setError('Vul e-mail en wachtwoord in.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await signIn(email, password, onthoud);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Inloggen mislukt.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.screen}>
      <div className={styles.box}>
        <div className={styles.logoArea}>
          <svg viewBox="0 0 88.7 120.8" className={styles.shield} fill="none" xmlns="http://www.w3.org/2000/svg">
            <path fill="#921B39" d="M88.7,0H0v62c0,7.8,1.3,24.6,11.4,35.4c12,12.9,27.6,20.8,30.6,22.3l2.3,1.1l2.3-1.1c3-1.5,18.6-9.4,30.6-22.3C87.2,86.6,88.5,69.8,88.7,62V0z"/>
          </svg>
          <span className={styles.logoText}>PEPE <span>Flow</span></span>
        </div>
        <div className={styles.title}>Welkom terug</div>
        <div className={styles.sub}>Wagenparkbeheer — log in om verder te gaan</div>

        <div className={styles.field}>
          <label>E-mailadres</label>
          <input
            type="email"
            placeholder="naam@pepe.nl"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </div>
        <div className={styles.field}>
          <label>Wachtwoord</label>
          <input
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
          />
        </div>

        <div className={styles.onthoudRij} onClick={() => setOnthoud((v) => !v)}>
          <div className={`${styles.checkbox} ${onthoud ? styles.checkboxAan : ''}`}>
            {onthoud && (
              <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                <polyline points="1,4 4,7 9,1" stroke="#000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </div>
          <span>Onthoud mij</span>
        </div>

        <button className={styles.loginBtn} onClick={handleLogin} disabled={loading}>
          {loading ? 'Bezig...' : 'Inloggen →'}
        </button>
        {error && <div className={styles.err}>{error}</div>}
      </div>
    </div>
  );
}
