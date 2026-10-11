import mark from "../assets/tessera.svg";
import { DEPLOYMENT } from "../chain/ledger";

export type View = "consortium" | "ledger" | "screen";

const LINKS: [View | "how", string][] = [
  ["consortium", "Consortium"],
  ["ledger", "Ledger"],
  ["screen", "Screen a transaction"],
  ["how", "How it works"],
];

export default function TopBar({ view, onView, onHow }: { view: View; onView: (v: View) => void; onHow: () => void }) {
  const live = !!DEPLOYMENT.ledger;
  return (
    <header className="topbar">
      <a className="brand" href="#main" aria-label="Tessera home" onClick={() => onView("consortium")}>
        <img src={mark} alt="" width="32" height="32" />
        <span>Tessera</span>
      </a>
      <nav className="header-links" aria-label="Sections">
        {LINKS.map(([key, label]) => (
          <button key={key} onClick={() => (key === "how" ? onHow() : onView(key))} className={key === view ? "current" : undefined}
            aria-current={key === view ? "page" : undefined}>
            {label}
          </button>
        ))}
      </nav>
      <span className={`connection ${live ? "" : "offline"}`} role="status">
        <i />
        {live ? "Ledger live · BSC testnet" : "Ledger pending · BSC testnet"}
      </span>
    </header>
  );
}
