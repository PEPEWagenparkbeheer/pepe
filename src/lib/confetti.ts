export function schietConfetti() {
  const kleuren = ['#921939', '#4ade80', '#60a5fa', '#fbbf24', '#f472b6', '#a78bfa', '#fb923c', '#fff'];

  for (let i = 0; i < 120; i++) {
    setTimeout(() => {
      const el = document.createElement('div');
      const kleur = kleuren[Math.floor(Math.random() * kleuren.length)];
      const size = Math.random() * 10 + 6;

      el.style.cssText = [
        'position:fixed',
        `left:${Math.random() * 100}vw`,
        'top:-10px',
        `background:${kleur}`,
        `width:${size}px`,
        `height:${size}px`,
        `border-radius:${Math.random() > 0.5 ? '50%' : '2px'}`,
        `animation:confettiFall ${Math.random() * 2 + 1.5}s linear forwards`,
        'pointer-events:none',
        'z-index:9999',
      ].join(';');

      document.body.appendChild(el);
      setTimeout(() => el.remove(), 4000);
    }, i * 18);
  }

  // Keyframes eenmalig injecteren
  if (!document.getElementById('confetti-style')) {
    const style = document.createElement('style');
    style.id = 'confetti-style';
    style.textContent = `
      @keyframes confettiFall {
        0%   { transform: translateY(0) rotate(0deg); opacity: 1; }
        100% { transform: translateY(110vh) rotate(720deg); opacity: 0; }
      }
    `;
    document.head.appendChild(style);
  }
}
