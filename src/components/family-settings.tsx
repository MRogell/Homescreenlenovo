"use client";
import { useState } from "react";
import { MAX_MEMBERS, MEMBER_KINDS, MEMBER_KIND_LABEL, type FamilyMember, type Handover, type MemberKind } from "@/lib/activity";

/** Familjemedlemmarna som kan väljas som deltagare och ansvariga när man lägger in en aktivitet. */
export function FamilySettings({ initial, initialHandover }: { initial: FamilyMember[]; initialHandover: Handover }) {
  const [list, setList] = useState(initial);
  const [handover, setHandover] = useState(initialHandover);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<MemberKind>("adult");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; bad: boolean } | null>(null);

  async function save(next: FamilyMember[], h: Handover = handover) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/family", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ members: next.map((m) => (m.id ? m : { name: m.name, kind: m.kind })), handover: h }) });
      const j = (await res.json().catch(() => null)) as { members?: FamilyMember[]; handover?: Handover; error?: string } | null;
      if (!res.ok || !j?.members) throw new Error(j?.error ?? "Det gick inte att spara.");
      setList(j.members);
      if (j.handover) setHandover(j.handover);
      return true;
    } catch (e) {
      setMsg({ text: e instanceof Error && e.message !== "Failed to fetch" ? e.message : "Ingen kontakt med servern.", bad: true });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    if (await save([...list, { name: n, kind } as FamilyMember])) setName("");
  }

  return (
    <section className="card" aria-label="Familjemedlemmar">
      <div className="card-head"><span className="name">Familjemedlemmar</span></div>
      <p className="mid">Personerna du kan välja som deltagare och ansvariga när du lägger in en aktivitet.</p>
      {list.length > 0 && (
        <ul className="rows" style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {list.map((m) => (
            <li className="row" key={m.id} style={{ alignItems: "center", flexWrap: "wrap" }}>
              <span><b>{m.name}</b> <small className="mid">{MEMBER_KIND_LABEL[m.kind]}</small></span>
              <button type="button" className="sm-btn" disabled={busy} aria-label={`Ta bort ${m.name}`} onClick={() => void save(list.filter((x) => x.id !== m.id))}>Ta bort</button>
            </li>
          ))}
        </ul>
      )}
      {list.length < MAX_MEMBERS && (
        <form className="fam-add" onSubmit={add}>
          <div className="fam-field fam-name">
            <label className="dn-label" htmlFor="fam-n">Namn</label>
            <input id="fam-n" className="ca-field" value={name} onChange={(e) => setName(e.target.value)} maxLength={30} autoComplete="off" placeholder="t.ex. Mickael" />
          </div>
          <div className="fam-field fam-kind">
            <label className="dn-label" htmlFor="fam-k">Vuxen eller barn</label>
            <select id="fam-k" className="ca-field" value={kind} onChange={(e) => setKind(e.target.value as MemberKind)}>{MEMBER_KINDS.map((k) => <option key={k} value={k}>{MEMBER_KIND_LABEL[k]}</option>)}</select>
          </div>
          <button type="submit" className="sm-btn primary fam-btn" disabled={busy || !name.trim()}>Lägg till</button>
        </form>
      )}
      <div className="fam-handover">
        <b className="dn-label">När byter barnen hushåll?</b>
        <div className="ca-row">
          <div className="fam-field">
            <label className="dn-label" htmlFor="fam-w">Dag</label>
            <select id="fam-w" className="ca-field" value={handover.weekday} onChange={(e) => void save(list, { ...handover, weekday: Number(e.target.value) })}>{["måndag", "tisdag", "onsdag", "torsdag", "fredag", "lördag", "söndag"].map((d, i) => <option key={d} value={i + 1}>{d}</option>)}</select>
          </div>
          <div className="fam-field">
            <label className="dn-label" htmlFor="fam-t">Klockan</label>
            <input id="fam-t" className="ca-field" type="time" value={handover.time} onChange={(e) => { if (e.target.value) void save(list, { ...handover, time: e.target.value }); }} />
          </div>
        </div>
        <p className="mid small">Visas som &quot;Nästa växling&quot; när du trycker på Barnvecka.</p>
      </div>
      {msg && <p className={msg.bad ? "err" : "mid"} role={msg.bad ? "alert" : "status"}>{msg.text}</p>}
    </section>
  );
}
