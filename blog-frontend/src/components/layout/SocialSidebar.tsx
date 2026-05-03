export default function SocialSidebar() {
  return (
    <>
      <style>{`
        .ol-social-bar {
          position: fixed; right: 0; top: 50%; transform: translateY(-50%);
          z-index: 999; display: flex; flex-direction: column; gap: 2px;
        }
        .ol-social-btn {
          width: 44px; height: 44px; display: flex; align-items: center;
          justify-content: center; cursor: pointer; text-decoration: none;
          position: relative; overflow: hidden;
          transition: width 0.25s cubic-bezier(.4,0,.2,1), background 0.2s;
          border-radius: 10px 0 0 10px;
          border: 1px solid rgba(255,255,255,0.06); border-right: none;
        }
        .ol-social-btn svg { flex-shrink: 0; z-index: 1; transition: transform 0.2s; }
        .ol-social-btn:hover svg { transform: scale(1.15); }
        .ol-s-label {
          font-family: 'IBM Plex Mono', monospace; font-size: 0.52rem;
          letter-spacing: 0.06em; text-transform: uppercase; white-space: nowrap;
          opacity: 0; max-width: 0; overflow: hidden;
          transition: opacity 0.2s, max-width 0.25s; font-weight: 600;
        }
        .ol-social-btn:hover .ol-s-label { opacity: 1; max-width: 80px; margin-left: 8px; }
        .ol-social-btn:hover { width: auto; padding: 0 14px 0 10px; }
        .ol-s-twitter  { background: rgba(29,161,242,0.18);  color: #5bb8f5; }
        .ol-s-twitter:hover  { background: rgba(29,161,242,0.32); }
        .ol-s-whatsapp { background: rgba(37,211,102,0.18);  color: #4cd97a; }
        .ol-s-whatsapp:hover { background: rgba(37,211,102,0.32); }
        .ol-s-telegram { background: rgba(0,136,204,0.18);   color: #33aade; }
        .ol-s-telegram:hover { background: rgba(0,136,204,0.32); }
        .ol-s-youtube  { background: rgba(255,0,0,0.18);     color: #ff5555; }
        .ol-s-youtube:hover  { background: rgba(255,0,0,0.32); }
        .ol-s-facebook { background: rgba(24,119,242,0.18);  color: #5b8ef5; }
        .ol-s-facebook:hover { background: rgba(24,119,242,0.32); }
        @media (max-width: 768px) {
          .ol-social-bar { top: auto; bottom: 80px; transform: none; }
          .ol-social-btn { width: 38px; height: 38px; border-radius: 8px 0 0 8px; }
          .ol-social-btn:hover { width: 38px; padding: 0; }
          .ol-social-btn:hover .ol-s-label { opacity: 0; max-width: 0; margin: 0; }
        }
      `}</style>

      <div className="ol-social-bar">
        <a href="https://x.com/Optionslab001" target="_blank" rel="noopener noreferrer"
           className="ol-social-btn ol-s-twitter" title="Twitter / X">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.745l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
          </svg>
          <span className="ol-s-label">Twitter</span>
        </a>

        <a href="https://wa.me/message/optionslab" target="_blank" rel="noopener noreferrer"
           className="ol-social-btn ol-s-whatsapp" title="WhatsApp">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/>
          </svg>
          <span className="ol-s-label">WhatsApp</span>
        </a>

        <a href="https://t.me/optionslab_in" target="_blank" rel="noopener noreferrer"
           className="ol-social-btn ol-s-telegram" title="Telegram">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
          </svg>
          <span className="ol-s-label">Telegram</span>
        </a>

        <a href="https://www.youtube.com/@OptionLab-001" target="_blank" rel="noopener noreferrer"
           className="ol-social-btn ol-s-youtube" title="YouTube">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
          </svg>
          <span className="ol-s-label">YouTube</span>
        </a>

        <a href="https://www.facebook.com/profile.php?id=61589251376264" target="_blank" rel="noopener noreferrer"
           className="ol-social-btn ol-s-facebook" title="Facebook">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
          </svg>
          <span className="ol-s-label">Facebook</span>
        </a>
      </div>
    </>
  )
}
