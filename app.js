/* ==========================================================================
   app.js — FICA Ratings
   UI/UX only. Firestore access, rating math, and admin-PIN logic are
   unchanged from the original app (now living in firebase.js).
   ========================================================================== */

(function () {
  "use strict";

  const { useState, useEffect, useRef, useLayoutEffect } = React;
  const h = React.createElement;
  const { fsGetList, fsSetList, fsGetDoc, fsSetDoc } = window.FB;

  const LOGO_SRC = "logo.jpg";
  const DEFAULT_AVATAR = "default-avatar.png";
  const MEDALS = ["\u{1F947}", "\u{1F948}", "\u{1F949}"];
  const MAX_COLOR_COINS = 9;
  const MAX_QUEEN = 1;

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function initials(name) {
    if (!name) return "?";
    const parts = name.trim().split(/\s+/);
    return ((parts[0][0] || "") + (parts[1] ? parts[1][0] : "")).toUpperCase();
  }

  function winPct(p) {
    if (!p.played) return 0;
    return Math.round((p.wins / p.played) * 100);
  }

  /* ------------------------------------------------------------------ *
   * Avatar — falls back: given photo -> default-avatar.png -> initials
   * ------------------------------------------------------------------ */
  function Avatar({ src, name, className }) {
    const [stage, setStage] = useState(src ? 0 : 1);
    useEffect(() => { setStage(src ? 0 : 1); }, [src]);

    if (stage >= 2) {
      return h("div", { className: (className || "") + " avatar-initials" }, initials(name));
    }
    const current = stage === 0 ? src : DEFAULT_AVATAR;
    return h("img", {
      src: current,
      alt: name || "player",
      className,
      onError: () => setStage((s) => (s === 0 ? 1 : 2))
    });
  }

  /* ==================================================================== *
   * Root
   * ==================================================================== */
  function CarromRatings() {
    const [players, setPlayers] = useState([]);
    const [matches, setMatches] = useState([]);
    const [loaded, setLoaded] = useState(false);
    const [view, setView] = useState("players");
    const [connError, setConnError] = useState(null);
    const [adminPin, setAdminPin] = useState(void 0);
    const [isAdmin, setIsAdmin] = useState(false);
    const editingRef = useRef(false);

    async function loadAdminPin() {
      try {
        const config = await fsGetDoc("config");
        setAdminPin(config && config.adminPin ? config.adminPin : null);
      } catch (e) {
        setAdminPin(null);
      }
    }
    async function createAdminPin(pin) {
      await fsSetDoc("config", { adminPin: pin });
      setAdminPin(pin);
      setIsAdmin(true);
    }
    function trySignIn(pin) {
      if (adminPin && pin === adminPin) {
        setIsAdmin(true);
        return true;
      }
      return false;
    }
    function signOut() {
      setIsAdmin(false);
    }

    async function refresh() {
      try {
        const [p, m] = await Promise.all([fsGetList("players"), fsGetList("matches")]);
        if (!editingRef.current) setPlayers(p);
        setMatches(m);
        setConnError(null);
      } catch (e) {
        setConnError(e.message);
      } finally {
        setLoaded(true);
      }
    }

    useEffect(() => {
      refresh();
      loadAdminPin();
      const interval = setInterval(refresh, 6000);
      return () => clearInterval(interval);
    }, []);

    async function savePlayers(next) {
      setPlayers(next);
      try {
        await fsSetList("players", next);
        setConnError(null);
      } catch (e) {
        setConnError(e.message);
      }
    }
    async function saveMatches(next) {
      setMatches(next);
      try {
        await fsSetList("matches", next);
        setConnError(null);
      } catch (e) {
        setConnError(e.message);
      }
    }

    return h(
      "div",
      { className: "app-shell" },
      h(Header, { view, setView, adminPin, isAdmin, onCreatePin: createAdminPin, onSignIn: trySignIn, onSignOut: signOut }),
      connError && h("div", { className: "conn-error" }, "\u26A0\uFE0F Couldn't reach the database: ", connError),
      h(
        "main",
        { className: "main" },
        !loaded
          ? h("p", { className: "boot-loading" }, "Loading board\u2026")
          : view === "players"
          ? h(PlayersView, { players, savePlayers, editingRef, isAdmin })
          : view === "match"
          ? h(MatchView, { players, savePlayers, matches, saveMatches, onViewRankings: () => setView("players") })
          : h(HistoryView, { matches, players, savePlayers, saveMatches, isAdmin })
      )
    );
  }

  /* ==================================================================== *
   * Header + Tabs (animated underline)
   * ==================================================================== */
  function Header({ view, setView, adminPin, isAdmin, onCreatePin, onSignIn, onSignOut }) {
    const [showBox, setShowBox] = useState(false);
    const [pinInput, setPinInput] = useState("");
    const [err, setErr] = useState("");

    function submit() {
      setErr("");
      if (adminPin === null) {
        if (pinInput.length < 4) {
          setErr("Use at least 4 characters.");
          return;
        }
        onCreatePin(pinInput)
          .then(() => { setShowBox(false); setPinInput(""); })
          .catch((e) => setErr("Save failed: " + e.message));
      } else {
        const ok = onSignIn(pinInput);
        if (!ok) { setErr("Wrong PIN."); return; }
        setShowBox(false);
        setPinInput("");
      }
    }

    return h(
      "div",
      { className: "site-header no-print" },
      h(
        "div",
        { className: "site-header__top" },
        h(
          "button",
          {
            className: "admin-toggle" + (isAdmin ? " admin-toggle--active" : ""),
            onClick: () => (isAdmin ? onSignOut() : setShowBox((s) => !s))
          },
          isAdmin ? "Admin \u2713 \u00B7 sign out" : "\u{1F512} Admin"
        ),
        h(
          "div",
          { className: "site-header__brand" },
          h("img", { src: LOGO_SRC, alt: "FICA logo", className: "site-header__logo" }),
          h("h1", { className: "site-header__title" }, "FICA Ratings")
        ),
        h("p", { className: "site-header__subtitle" }, "Official FICA Monthly Ratings")
      ),
      showBox &&
        !isAdmin &&
        h(
          "div",
          { className: "admin-panel" },
          h(
            "div",
            { className: "admin-panel__box" },
            adminPin === void 0
              ? h("p", { className: "admin-panel__hint" }, "Checking\u2026")
              : h(
                  React.Fragment,
                  null,
                  h(
                    "p",
                    { className: "admin-panel__hint" },
                    adminPin === null
                      ? "No admin PIN set yet. Create one to control who can add or edit players."
                      : "Enter the admin PIN to add or edit players."
                  ),
                  h("input", {
                    type: "password",
                    value: pinInput,
                    onChange: (e) => setPinInput(e.target.value),
                    onKeyDown: (e) => e.key === "Enter" && submit(),
                    placeholder: adminPin === null ? "Create a PIN (min 4 characters)" : "Enter PIN",
                    className: "form-input",
                    style: { marginBottom: 10 }
                  }),
                  err && h("p", { className: "admin-panel__error" }, err),
                  h(
                    "div",
                    { className: "admin-panel__actions" },
                    h("button", { onClick: submit, className: "btn btn--primary" }, adminPin === null ? "Set PIN & unlock" : "Unlock"),
                    h("button", { onClick: () => setShowBox(false), className: "link-btn" }, "Cancel")
                  )
                )
          )
        ),
      h(TabBar, { view, setView })
    );
  }

  function TabBar({ view, setView }) {
    const tabs = [
      { id: "players", label: "Rankings" },
      { id: "match", label: "New Match" },
      { id: "history", label: "History" }
    ];
    const btnRefs = useRef({});
    const [underline, setUnderline] = useState({ left: 0, width: 0 });

    function measure() {
      const btn = btnRefs.current[view];
      if (btn) setUnderline({ left: btn.offsetLeft, width: btn.offsetWidth });
    }

    useLayoutEffect(() => {
      measure();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [view]);

    useEffect(() => {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }, [view]);

    return h(
      "div",
      { className: "tabs" },
      tabs.map((t) =>
        h(
          "button",
          {
            key: t.id,
            ref: (el) => (btnRefs.current[t.id] = el),
            onClick: () => setView(t.id),
            className: "tab-btn" + (view === t.id ? " tab-btn--active" : "")
          },
          t.label
        )
      ),
      h("span", { className: "tab-underline", style: { left: underline.left, width: underline.width } })
    );
  }

  /* ==================================================================== *
   * Rankings
   * ==================================================================== */
  function PlayersView({ players, savePlayers, editingRef, isAdmin }) {
    const [bulkText, setBulkText] = useState("");
    const [name, setName] = useState("");
    const [rating, setRating] = useState("");
    const [photo, setPhoto] = useState("");
    const [ratingEditId, setRatingEditId] = useState(null);
    const [editRating, setEditRating] = useState("");
    const [editingPlayer, setEditingPlayer] = useState(null);
    const [search, setSearch] = useState("");
    const [openPlayerId, setOpenPlayerId] = useState(null);

    useEffect(() => {
      editingRef.current =
        ratingEditId !== null || !!editingPlayer || bulkText.length > 0 || name.length > 0;
    }, [ratingEditId, editingPlayer, bulkText, name]);

    function addBulk() {
      const lines = bulkText.split("\n").map((l) => l.trim()).filter(Boolean);
      if (!lines.length) return;
      const additions = lines.map((line) => {
        const [rawName, rawRating, rawPhoto] = line.split(",").map((s) => s && s.trim());
        const r = parseInt(rawRating, 10);
        return {
          id: uid(),
          name: rawName || "Unnamed",
          rating: Number.isFinite(r) ? r : 1000,
          photo: rawPhoto || "",
          wins: 0,
          losses: 0,
          played: 0,
          totalCoins: 0,
          totalReds: 0,
          totalFouls: 0
        };
      });
      savePlayers([...players, ...additions]);
      setBulkText("");
    }

    function addSingle() {
      if (!name.trim()) return;
      const r = parseInt(rating, 10);
      savePlayers([
        ...players,
        {
          id: uid(),
          name: name.trim(),
          rating: Number.isFinite(r) ? r : 1000,
          photo: photo.trim(),
          wins: 0,
          losses: 0,
          played: 0,
          totalCoins: 0,
          totalReds: 0,
          totalFouls: 0
        }
      ]);
      setName("");
      setRating("");
      setPhoto("");
    }

    function deletePlayer(id) {
      savePlayers(players.filter((p) => p.id !== id));
      if (openPlayerId === id) setOpenPlayerId(null);
    }

    function startRatingEdit(p) {
      setRatingEditId(p.id);
      setEditRating(String(p.rating));
    }
    function saveRatingEdit(id) {
      const r = parseInt(editRating, 10);
      savePlayers(players.map((p) => (p.id === id ? { ...p, rating: Number.isFinite(r) ? r : p.rating } : p)));
      setRatingEditId(null);
    }

    function saveEditedPlayer(updated) {
      savePlayers(players.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)));
      setEditingPlayer(null);
    }

    const ranked = [...players].sort((a, b) => b.rating - a.rating);
    const visible = search.trim()
      ? ranked.filter((p) => p.name.toLowerCase().includes(search.trim().toLowerCase()))
      : ranked;
    const openPlayer = openPlayerId ? players.find((p) => p.id === openPlayerId) : null;
    const openPlayerRank = openPlayer ? ranked.findIndex((p) => p.id === openPlayer.id) : -1;

    return h(
      "div",
      null,
      isAdmin
        ? h(
            "div",
            { className: "panel-card no-print" },
            h("h2", { className: "panel-card__title" }, "Add players"),
            h("p", { className: "panel-card__hint" }, 'Paste a list \u2014 one per line, as "Name, Rating, Photo path" (rating and photo optional).'),
            h("textarea", {
              value: bulkText,
              onChange: (e) => setBulkText(e.target.value),
              placeholder: "Asha, 1180, images/players/asha.jpg\nRohit, 1050\nMeera",
              rows: 3,
              className: "form-textarea",
              style: { marginBottom: 10 }
            }),
            h("button", { onClick: addBulk, className: "btn btn--primary" }, "Add list"),
            h("div", { style: { height: 16 } }),
            h("p", { className: "panel-card__hint" }, "Or add one player:"),
            h(
              "div",
              { className: "form-grid" },
              h(
                "div",
                { className: "form-row" },
                h("label", { className: "form-label" }, "Name"),
                h("input", { value: name, onChange: (e) => setName(e.target.value), className: "form-input", placeholder: "Player name" })
              ),
              h(
                "div",
                { className: "form-row" },
                h("label", { className: "form-label" }, "Rating"),
                h("input", { value: rating, onChange: (e) => setRating(e.target.value), className: "form-input", placeholder: "1000" })
              )
            ),
            h(
              "div",
              { className: "form-row" },
              h("label", { className: "form-label" }, "Photo path"),
              h("input", {
                value: photo,
                onChange: (e) => setPhoto(e.target.value),
                className: "form-input",
                placeholder: "images/players/name.jpg"
              })
            ),
            h("button", { onClick: addSingle, className: "btn btn--gold" }, "Save")
          )
        : h("div", { className: "panel-card no-print" }, h("p", { className: "panel-card__hint" }, "Sign in as admin (top right) to add or edit players.")),

      h(
        "div",
        { className: "rankings-title-row no-print" },
        h("h2", { className: "section-title", style: { marginBottom: 0 } }, "Rankings"),
        h("button", { onClick: () => window.print(), className: "btn btn--outline btn--sm" }, "\u2B07 Download PDF")
      ),
      h("h2", { className: "section-title print-only" }, "Rankings"),

      h(
        "div",
        { className: "search-bar no-print" },
        h("span", { className: "search-bar__icon" }, "\u{1F50D}"),
        h("input", {
          value: search,
          onChange: (e) => setSearch(e.target.value),
          placeholder: "Search players\u2026",
          className: "search-input"
        })
      ),

      visible.length === 0
        ? h("div", { className: "panel-card empty-state" }, players.length === 0 ? "No players yet. Add your current rating list above to start the board." : "No players match your search.")
        : h(
            "div",
            { className: "rankings-list" },
            visible.map((p) => {
              const rank = ranked.findIndex((x) => x.id === p.id);
              return h(PlayerCard, {
                key: p.id,
                player: p,
                rank,
                isAdmin,
                editing: ratingEditId === p.id,
                editRating,
                setEditRating,
                onOpen: () => setOpenPlayerId(p.id),
                onStartRatingEdit: () => startRatingEdit(p),
                onSaveRatingEdit: () => saveRatingEdit(p.id),
                onEditPlayer: () => setEditingPlayer(p),
                onDelete: () => deletePlayer(p.id)
              });
            })
          ),

      openPlayer && h(PlayerModal, { player: openPlayer, rank: openPlayerRank, onClose: () => setOpenPlayerId(null) }),
      editingPlayer && h(EditPlayerModal, { player: editingPlayer, onCancel: () => setEditingPlayer(null), onSave: saveEditedPlayer })
    );
  }

  function PlayerCard({ player: p, rank, isAdmin, editing, editRating, setEditRating, onOpen, onStartRatingEdit, onSaveRatingEdit, onEditPlayer, onDelete }) {
    const medal = rank < 3 ? MEDALS[rank] : null;
    return h(
      "div",
      { className: "player-card", onClick: onOpen },
      h("div", { className: "player-card__rank" + (medal ? " player-card__rank--medal" : "") }, medal || rank + 1),
      h(Avatar, { src: p.photo, name: p.name, className: "player-card__avatar" }),
      h(
        "div",
        { className: "player-card__info" },
        h("div", { className: "player-card__name" }, p.name),
        h(
          "div",
          { className: "player-card__meta" },
          p.played,
          " Matches \u00B7 ",
          h("span", { className: "w" }, p.wins, "W"),
          " \u00B7 ",
          h("span", { className: "l" }, p.losses, "L")
        )
      ),
      h(
        "div",
        { className: "player-card__right", onClick: (e) => e.stopPropagation() },
        editing
          ? h(
              "div",
              { className: "rating-edit" },
              h("input", { value: editRating, onChange: (e) => setEditRating(e.target.value) }),
              h("button", { onClick: onSaveRatingEdit, className: "btn btn--primary btn--sm" }, "Save")
            )
          : h("span", { className: "rating-badge" }, "\u2B50", p.rating),
        isAdmin &&
          !editing &&
          h(
            "div",
            { className: "player-card__admin-actions no-print" },
            h("button", { onClick: onStartRatingEdit, className: "icon-btn", title: "Quick-edit rating" }, "\u270E"),
            h("button", { onClick: onEditPlayer, className: "icon-btn", title: "Edit player" }, "\u2699"),
            h("button", { onClick: onDelete, className: "icon-btn icon-btn--danger", title: "Remove player" }, "\u2716")
          )
      )
    );
  }

  function PlayerModal({ player, rank, onClose }) {
    return h(
      "div",
      { className: "modal-overlay", onClick: onClose },
      h(
        "div",
        { className: "modal", onClick: (e) => e.stopPropagation() },
        h("button", { className: "modal__close", onClick: onClose }, "\u2715"),
        h(Avatar, { src: player.photo, name: player.name, className: "modal__avatar" }),
        h("h3", { className: "modal__name" }, player.name),
        h("p", { className: "modal__rank" }, rank >= 0 && rank < 3 ? MEDALS[rank] + " Rank " + (rank + 1) : "Rank " + (rank + 1)),
        h(
          "div",
          { className: "modal__stats-grid" },
          h(Stat, { label: "Rating", value: "\u2B50 " + player.rating }),
          h(Stat, { label: "Matches", value: player.played }),
          h(Stat, { label: "Wins", value: player.wins }),
          h(Stat, { label: "Losses", value: player.losses }),
          h(Stat, { label: "Winning %", value: winPct(player) + "%" }),
          h(Stat, { label: "Coins taken", value: player.totalCoins || 0 }),
          h(Stat, { label: "Reds taken", value: player.totalReds || 0 }),
          h(Stat, {
            label: "Coins/Match",
            value: player.played ? (((player.totalCoins || 0) + (player.totalReds || 0)) / player.played).toFixed(1) : "0.0"
          })
        )
      )
    );
  }
  function Stat({ label, value }) {
    return h("div", { className: "modal__stat" }, h("div", { className: "modal__stat-label" }, label), h("div", { className: "modal__stat-value" }, value));
  }

  function EditPlayerModal({ player, onCancel, onSave }) {
    const [name, setName] = useState(player.name);
    const [rating, setRating] = useState(String(player.rating));
    const [photo, setPhoto] = useState(player.photo || "");

    function submit() {
      const r = parseInt(rating, 10);
      onSave({ id: player.id, name: name.trim() || player.name, rating: Number.isFinite(r) ? r : player.rating, photo: photo.trim() });
    }

    return h(
      "div",
      { className: "modal-overlay", onClick: onCancel },
      h(
        "div",
        { className: "modal", onClick: (e) => e.stopPropagation(), style: { textAlign: "left" } },
        h("button", { className: "modal__close", onClick: onCancel }, "\u2715"),
        h("h3", { className: "panel-card__title", style: { textAlign: "center" } }, "Edit player"),
        h(
          "div",
          { className: "form-row" },
          h("label", { className: "form-label" }, "Name"),
          h("input", { value: name, onChange: (e) => setName(e.target.value), className: "form-input" })
        ),
        h(
          "div",
          { className: "form-row" },
          h("label", { className: "form-label" }, "Rating"),
          h("input", { value: rating, onChange: (e) => setRating(e.target.value), className: "form-input" })
        ),
        h(
          "div",
          { className: "form-row" },
          h("label", { className: "form-label" }, "Photo path"),
          h("input", { value: photo, onChange: (e) => setPhoto(e.target.value), className: "form-input", placeholder: "images/players/name.jpg" })
        ),
        h(
          "div",
          { className: "admin-panel__actions" },
          h("button", { onClick: submit, className: "btn btn--primary" }, "Save changes"),
          h("button", { onClick: onCancel, className: "link-btn" }, "Cancel")
        )
      )
    );
  }

  /* ==================================================================== *
   * New Match
   * ==================================================================== */
  function MatchView({ players, savePlayers, matches, saveMatches, onViewRankings }) {
    const empty = { blackA: "", blackB: "", whiteA: "", whiteB: "" };
    const [sel, setSel] = useState(empty);
    const [started, setStarted] = useState(false);
    const [pts, setPts] = useState({});
    const [rawStats, setRawStats] = useState({});
    const [history, setHistory] = useState([]);
    const [coinsUsed, setCoinsUsed] = useState({ black: 0, white: 0, red: 0 });
    const [summary, setSummary] = useState(null);
    const slots = ["blackA", "blackB", "whiteA", "whiteB"];
    const chosenIds = slots.map((s) => sel[s]).filter(Boolean);

    function optionsFor(slot) {
      return players.filter((p) => p.id === sel[slot] || !chosenIds.includes(p.id));
    }
    function canStart() {
      return slots.every((s) => sel[s]) && new Set(chosenIds).size === 4;
    }
    function start() {
      if (!canStart()) return;
      setPts({ [sel.blackA]: 0, [sel.blackB]: 0, [sel.whiteA]: 0, [sel.whiteB]: 0 });
      setRawStats({
        [sel.blackA]: { coins: 0, reds: 0, fouls: 0 },
        [sel.blackB]: { coins: 0, reds: 0, fouls: 0 },
        [sel.whiteA]: { coins: 0, reds: 0, fouls: 0 },
        [sel.whiteB]: { coins: 0, reds: 0, fouls: 0 }
      });
      setCoinsUsed({ black: 0, white: 0, red: 0 });
      setHistory([]);
      setSummary(null);
      setStarted(true);
    }
    function addPoints(playerId, delta) {
      setPts((s) => ({ ...s, [playerId]: (s[playerId] || 0) + delta }));
    }
    function bumpRaw(playerId, key) {
      setRawStats((s) => ({
        ...s,
        [playerId]: { ...s[playerId], [key]: (s[playerId] ? s[playerId][key] : 0) + 1 }
      }));
    }
    function pushAction(action) {
      setHistory((h) => [...h.slice(-2), action]); // keep at most the last 3 actions
    }
    function undoLast() {
      if (history.length === 0) return;
      const last = history[history.length - 1];
      setPts((s) => ({ ...s, [last.playerId]: (s[last.playerId] || 0) - last.pointDelta }));
      setCoinsUsed((c) => ({ ...c, [last.coinsUsedKey]: Math.max(0, c[last.coinsUsedKey] - 1) }));
      setRawStats((s) => ({
        ...s,
        [last.playerId]: {
          ...s[last.playerId],
          [last.statKey]: Math.max(0, (s[last.playerId] ? s[last.playerId][last.statKey] : 0) - 1)
        }
      }));
      setHistory((h) => h.slice(0, -1));
    }
    function handleCoin(playerId, team) {
      if (coinsUsed[team] >= MAX_COLOR_COINS) return;
      setCoinsUsed((c) => ({ ...c, [team]: c[team] + 1 }));
      addPoints(playerId, 1);
      bumpRaw(playerId, "coins");
      pushAction({ playerId, statKey: "coins", pointDelta: 1, coinsUsedKey: team });
    }
    function handleRed(playerId) {
      if (coinsUsed.red >= MAX_QUEEN) return;
      setCoinsUsed((c) => ({ ...c, red: c.red + 1 }));
      addPoints(playerId, 2);
      bumpRaw(playerId, "reds");
      pushAction({ playerId, statKey: "reds", pointDelta: 2, coinsUsedKey: "red" });
    }
    function handleFoul(playerId, team) {
      const oppColor = team === "black" ? "white" : "black";
      if (coinsUsed[oppColor] >= MAX_COLOR_COINS) return;
      setCoinsUsed((c) => ({ ...c, [oppColor]: c[oppColor] + 1 }));
      addPoints(playerId, -2);
      bumpRaw(playerId, "fouls");
      pushAction({ playerId, statKey: "fouls", pointDelta: -2, coinsUsedKey: oppColor });
    }
    function playerById(id) {
      return players.find((p) => p.id === id);
    }

    const blackTotal = (pts[sel.blackA] || 0) + (pts[sel.blackB] || 0);
    const whiteTotal = (pts[sel.whiteA] || 0) + (pts[sel.whiteB] || 0);

    function finish() {
      const blackWon = blackTotal > whiteTotal;
      const whiteWon = whiteTotal > blackTotal;
      const isDraw = blackTotal === whiteTotal;

      // Win/loss bonus = a flat base of +2/-2, PLUS a "delta bonus" that only
      // applies when the lower-rated (underdog) team wins by a gap over 10%:
      //   Delta bonus (team total) = 10 x Gap%   (Gap% expressed as a fraction, e.g. 0.46 for 46%)
      //   Split equally between the 2 players on each side, added to the
      //   winner's +2 and subtracted from the loser's -2.
      // If the higher-rated team wins, or the gap is 10% or under, no delta
      // bonus applies - just the flat +2/-2.
      const avgBlackRating = (playerById(sel.blackA).rating + playerById(sel.blackB).rating) / 2;
      const avgWhiteRating = (playerById(sel.whiteA).rating + playerById(sel.whiteB).rating) / 2;
      const higherAvg = Math.max(avgBlackRating, avgWhiteRating);
      const lowerAvg = Math.min(avgBlackRating, avgWhiteRating);
      const gapFraction = (higherAvg - lowerAvg) / Math.max(lowerAvg, 1);
      const blackIsLower = avgBlackRating <= avgWhiteRating;
      const lowerTeamWon = blackIsLower ? blackWon : whiteWon;

      let perPlayerDelta = 0;
      if (!isDraw && gapFraction > 0.1 && lowerTeamWon) {
        const deltaBonusTotal = 10 * gapFraction;
        perPlayerDelta = deltaBonusTotal / 2;
      }

      const blackBase = isDraw ? 0 : blackWon ? 2 : -2;
      const whiteBase = isDraw ? 0 : whiteWon ? 2 : -2;
      let blackBonus = blackBase;
      let whiteBonus = whiteBase;
      if (perPlayerDelta > 0) {
        if (blackIsLower) {
          blackBonus = blackBase + perPlayerDelta;
          whiteBonus = whiteBase - perPlayerDelta;
        } else {
          whiteBonus = whiteBase + perPlayerDelta;
          blackBonus = blackBase - perPlayerDelta;
        }
      }
      blackBonus = Math.round(blackBonus);
      whiteBonus = Math.round(whiteBonus);
      const ids = { blackA: sel.blackA, blackB: sel.blackB, whiteA: sel.whiteA, whiteB: sel.whiteB };
      const deltas = {};
      ["blackA", "blackB"].forEach((s) => (deltas[ids[s]] = (pts[ids[s]] || 0) + blackBonus));
      ["whiteA", "whiteB"].forEach((s) => (deltas[ids[s]] = (pts[ids[s]] || 0) + whiteBonus));
      const nextPlayers = players.map((p) => {
        if (!(p.id in deltas)) return p;
        const isBlack = p.id === sel.blackA || p.id === sel.blackB;
        const won = isBlack ? blackWon : whiteWon;
        const lost = isBlack ? whiteWon : blackWon;
        const raw = rawStats[p.id] || { coins: 0, reds: 0, fouls: 0 };
        return {
          ...p,
          rating: p.rating + deltas[p.id],
          played: p.played + 1,
          wins: p.wins + (won ? 1 : 0),
          losses: p.losses + (lost ? 1 : 0),
          totalCoins: (p.totalCoins || 0) + raw.coins,
          totalReds: (p.totalReds || 0) + raw.reds,
          totalFouls: (p.totalFouls || 0) + raw.fouls
        };
      });
      const record = {
        id: uid(),
        date: new Date().toISOString(),
        black: [sel.blackA, sel.blackB].map((id) => ({
          id,
          name: playerById(id).name,
          points: pts[id] || 0,
          delta: deltas[id],
          coins: (rawStats[id] || {}).coins || 0,
          reds: (rawStats[id] || {}).reds || 0,
          fouls: (rawStats[id] || {}).fouls || 0,
          won: blackWon,
          lost: whiteWon
        })),
        white: [sel.whiteA, sel.whiteB].map((id) => ({
          id,
          name: playerById(id).name,
          points: pts[id] || 0,
          delta: deltas[id],
          coins: (rawStats[id] || {}).coins || 0,
          reds: (rawStats[id] || {}).reds || 0,
          fouls: (rawStats[id] || {}).fouls || 0,
          won: whiteWon,
          lost: blackWon
        })),
        scoreBlack: blackTotal,
        scoreWhite: whiteTotal
      };
      savePlayers(nextPlayers);
      saveMatches([record, ...matches]);
      setSummary(record);
      setStarted(false);
    }
    function newMatch() {
      setSel(empty);
      setSummary(null);
    }

    if (players.length < 4) {
      return h("div", { className: "panel-card" }, h("p", { className: "panel-card__hint" }, "You need at least 4 players on the board before starting a doubles match. Add players in the Rankings tab."));
    }

    if (summary) {
      const winner =
        summary.scoreBlack === summary.scoreWhite ? "Draw" : summary.scoreBlack > summary.scoreWhite ? "Team \u26AB Black wins" : "Team \u25CB White wins";
      return h(
        "div",
        { className: "panel-card" },
        h("h2", { className: "match-summary__headline" }, winner),
        h("p", { className: "match-summary__score" }, summary.scoreBlack, " \u2014 ", summary.scoreWhite),
        h(
          "div",
          { className: "team-grid" },
          h("div", null, h("div", { className: "team-heading" }, "\u26AB Black"), summary.black.map((pl) => h(DeltaRow, { key: pl.name, pl }))),
          h("div", null, h("div", { className: "team-heading" }, "\u25CB White"), summary.white.map((pl) => h(DeltaRow, { key: pl.name, pl })))
        ),
        h(
          "div",
          { className: "match-actions" },
          h("button", { onClick: newMatch, className: "btn btn--primary" }, "Start another match"),
          h("button", { onClick: onViewRankings, className: "btn btn--outline" }, "View updated rankings")
        )
      );
    }

    if (started) {
      const black = [playerById(sel.blackA), playerById(sel.blackB)];
      const white = [playerById(sel.whiteA), playerById(sel.whiteB)];
      return h(
        "div",
        null,
        h(
          "div",
          { className: "match-scoreboard" },
          h("span", { className: "match-scoreboard__score" }, "\u26AB ", blackTotal),
          h("span", { className: "match-scoreboard__dash" }, "\u2014"),
          h("span", { className: "match-scoreboard__score" }, whiteTotal, " \u25CB")
        ),
        h(
          "div",
          { className: "coin-counts" },
          h("span", null, "\u26AB left: ", MAX_COLOR_COINS - coinsUsed.black, "/9"),
          h("span", null, "\u25CB left: ", MAX_COLOR_COINS - coinsUsed.white, "/9"),
          h("span", null, "\u{1F451} queen: ", coinsUsed.red >= MAX_QUEEN ? "taken" : "on board")
        ),
        h(
          "div",
          { style: { display: "flex", justifyContent: "center", marginBottom: 14 } },
          h(
            "button",
            {
              onClick: undoLast,
              disabled: history.length === 0,
              className: "btn btn--outline btn--sm"
            },
            "\u21A9 Undo last (" + history.length + "/3)"
          )
        ),
        h(
          "div",
          { className: "team-grid" },
          h(
            "div",
            null,
            h("div", { className: "team-heading" }, "\u26AB Team Black"),
            black.map((p) =>
              h(PlayerScorer, {
                key: p.id,
                player: p,
                points: pts[p.id] || 0,
                coinDisabled: coinsUsed.black >= MAX_COLOR_COINS,
                redDisabled: coinsUsed.red >= MAX_QUEEN,
                foulDisabled: coinsUsed.white >= MAX_COLOR_COINS,
                onCoin: () => handleCoin(p.id, "black"),
                onRed: () => handleRed(p.id),
                onFoul: () => handleFoul(p.id, "black")
              })
            )
          ),
          h(
            "div",
            null,
            h("div", { className: "team-heading" }, "\u25CB Team White"),
            white.map((p) =>
              h(PlayerScorer, {
                key: p.id,
                player: p,
                points: pts[p.id] || 0,
                coinDisabled: coinsUsed.white >= MAX_COLOR_COINS,
                redDisabled: coinsUsed.red >= MAX_QUEEN,
                foulDisabled: coinsUsed.black >= MAX_COLOR_COINS,
                onCoin: () => handleCoin(p.id, "white"),
                onRed: () => handleRed(p.id),
                onFoul: () => handleFoul(p.id, "white")
              })
            )
          )
        ),
        h(
          "div",
          { className: "match-actions" },
          h("button", { onClick: finish, className: "btn btn--danger btn--block" }, "Finish match"),
          h("button", { onClick: () => setStarted(false), className: "btn btn--ghost" }, "Cancel")
        )
      );
    }

    return h(
      "div",
      { className: "panel-card" },
      h("h2", { className: "panel-card__title" }, "Pick four players"),
      h(
        "div",
        { className: "team-grid" },
        h(TeamPicker, { label: "\u26AB Team Black", slotA: "blackA", slotB: "blackB", sel, setSel, optionsFor }),
        h(TeamPicker, { label: "\u25CB Team White", slotA: "whiteA", slotB: "whiteB", sel, setSel, optionsFor })
      ),
      h(
        "button",
        { onClick: start, disabled: !canStart(), className: "btn btn--primary btn--block", style: { marginTop: 20 } },
        "Start match"
      )
    );
  }

  function TeamPicker({ label, slotA, slotB, sel, setSel, optionsFor }) {
    return h(
      "div",
      null,
      h("div", { className: "team-picker__label" }, label),
      [slotA, slotB].map((slot) =>
        h(
          "select",
          {
            key: slot,
            value: sel[slot],
            onChange: (e) => setSel({ ...sel, [slot]: e.target.value }),
            className: "form-select",
            style: { marginBottom: 8 }
          },
          h("option", { value: "" }, "Select player"),
          optionsFor(slot).map((p) => h("option", { key: p.id, value: p.id }, p.name, " (", p.rating, ")"))
        )
      )
    );
  }

  function PlayerScorer({ player, points, coinDisabled, redDisabled, foulDisabled, onCoin, onRed, onFoul }) {
    return h(
      "div",
      { className: "player-scorer-card" },
      h(
        "div",
        { className: "player-scorer-card__head" },
        h("div", { className: "player-scorer-card__name" }, player.name),
        h("div", { className: "player-scorer-card__points" }, points)
      ),
      h(
        "div",
        { className: "player-scorer-card__actions" },
        h("button", { onClick: onCoin, disabled: coinDisabled, className: "btn btn--primary btn--sm" }, "+1"),
        h("button", { onClick: onRed, disabled: redDisabled, className: "btn btn--danger btn--sm" }, "+2\u{1F451}"),
        h("button", { onClick: onFoul, disabled: foulDisabled, className: "btn btn--outline btn--sm" }, "\u22122")
      )
    );
  }

  function DeltaRow({ pl }) {
    const positive = pl.delta > 0;
    return h(
      "div",
      { className: "delta-row" },
      h("div", { className: "delta-row__name" }, pl.name, " ", h("span", { className: "delta-row__pts" }, "\u00B7 ", pl.points, " pts")),
      h("div", { className: "delta-row__delta " + (positive ? "delta-row__delta--pos" : "delta-row__delta--neg") }, positive ? "+" : "", pl.delta)
    );
  }

  /* ==================================================================== *
   * History
   * ==================================================================== */
  function HistoryView({ matches, players, savePlayers, saveMatches, isAdmin }) {
    function deleteMatch(m) {
      if (!window.confirm("Delete this match? This will undo its effect on ratings, W/L, and coin/red/foul totals.")) return;

      const entries = [
        ...m.black.map((e) => ({ ...e, team: "black" })),
        ...m.white.map((e) => ({ ...e, team: "white" }))
      ];

      const nextPlayers = players.map((p) => {
        const entry = entries.find((e) => (e.id ? e.id === p.id : e.name === p.name));
        if (!entry) return p;

        // Fall back to inferring win/loss from scores for older records saved before this field existed.
        const isDraw = m.scoreBlack === m.scoreWhite;
        const blackWon = m.scoreBlack > m.scoreWhite;
        const won = "won" in entry ? entry.won : !isDraw && ((entry.team === "black") === blackWon);
        const lost = "lost" in entry ? entry.lost : !isDraw && !won;

        return {
          ...p,
          rating: p.rating - (entry.delta || 0),
          played: Math.max(0, p.played - 1),
          wins: Math.max(0, p.wins - (won ? 1 : 0)),
          losses: Math.max(0, p.losses - (lost ? 1 : 0)),
          totalCoins: Math.max(0, (p.totalCoins || 0) - (entry.coins || 0)),
          totalReds: Math.max(0, (p.totalReds || 0) - (entry.reds || 0)),
          totalFouls: Math.max(0, (p.totalFouls || 0) - (entry.fouls || 0))
        };
      });

      savePlayers(nextPlayers);
      saveMatches(matches.filter((x) => x.id !== m.id));
    }

    if (matches.length === 0) {
      return h("div", { className: "panel-card empty-state" }, "No matches recorded yet. Play one from the New Match tab and it will show up here.");
    }
    return h("div", null, matches.map((m) => h(HistoryCard, { key: m.id, m, isAdmin, onDelete: () => deleteMatch(m) })));
  }

  function HistoryCard({ m, isAdmin, onDelete }) {
    const date = new Date(m.date);
    const isDraw = m.scoreBlack === m.scoreWhite;
    const blackWon = m.scoreBlack > m.scoreWhite;
    const resultLabel = isDraw ? "Draw" : blackWon ? "\u26AB Black won" : "\u25CB White won";
    const winnerTeam = isDraw ? null : blackWon ? { label: "\u26AB Winner", players: m.black } : { label: "\u25CB Winner", players: m.white };
    const loserTeam = isDraw ? null : blackWon ? { label: "\u25CB Loser", players: m.white } : { label: "\u26AB Loser", players: m.black };

    return h(
      "div",
      { className: "panel-card" },
      h(
        "div",
        { className: "history-card__top" },
        h(
          "div",
          null,
          h(
            "span",
            { className: "history-card__date" },
            date.toLocaleDateString(void 0, { month: "short", day: "numeric", year: "numeric" }),
            " \u00B7 ",
            date.toLocaleTimeString(void 0, { hour: "2-digit", minute: "2-digit" })
          ),
          h("span", { className: "history-card__result", style: { marginLeft: 8 } }, resultLabel, " \u00B7 ", m.scoreBlack, "\u2013", m.scoreWhite)
        ),
        isAdmin && h("button", { onClick: onDelete, className: "icon-btn icon-btn--danger", title: "Delete match" }, "\u2716")
      ),
      h(
        "div",
        { className: "history-teams" },
        isDraw
          ? h(React.Fragment, null,
              h("div", null, h("div", { className: "history-team__label" }, "\u26AB Black"), m.black.map((pl) => h(DeltaRow, { key: pl.name, pl }))),
              h("div", null, h("div", { className: "history-team__label" }, "\u25CB White"), m.white.map((pl) => h(DeltaRow, { key: pl.name, pl })))
            )
          : h(React.Fragment, null,
              h("div", null, h("div", { className: "history-team__label" }, winnerTeam.label), winnerTeam.players.map((pl) => h(DeltaRow, { key: pl.name, pl }))),
              h("div", null, h("div", { className: "history-team__label" }, loserTeam.label), loserTeam.players.map((pl) => h(DeltaRow, { key: pl.name, pl })))
            )
      )
    );
  }

  ReactDOM.createRoot(document.getElementById("root")).render(h(CarromRatings, null));
})();
