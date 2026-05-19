'use client';

import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import styles from './LoginScreen.module.css';

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
      await signIn(email, password);
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
          <img src="/pepe-logo-cmyk-wit.svg" alt="PEPE" className={styles.logoImg} />
        </div>
        <div className={styles.title}>Welkom terug</div>
        <div className={styles.sub}>Wagenparkbeheer — log in om verder te gaan</div>

        <div className={styles.field}>
          <label>E-mailadres</label>
          <input
            type="email"
            placeholder="naam@pepewagenparkbeheer.nl"
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

        <button className={styles.loginBtn} onClick={handleLogin} disabled={loading}>
          {loading ? 'Bezig...' : 'Inloggen →'}
        </button>
        {error && <div className={styles.err}>{error}</div>}
      </div>
    </div>
  );
}
