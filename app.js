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

  const LOGO_SRC = "images/logo.jpg";
  const DEFAULT_AVATAR = "images/default-avatar.png";
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

  // A player counts as "registration paid" unless explicitly marked false.
  // This keeps existing data (saved before this field existed) working as
  // before, while letting an admin uncheck specific players going forward.
  function isPaid(p) {
    return p.registrationPaid !== false;
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
    const [tournaments, setTournaments] = useState([]);
    const [challenges, setChallenges] = useState([]);
    const [challengeLedger, setChallengeLedger] = useState([]);
    const [activeChallengeId, setActiveChallengeId] = useState(null);
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
        const [p, m, t, c, l] = await Promise.all([
          fsGetList("players"), fsGetList("matches"), fsGetList("tournaments"),
          fsGetList("challenges"), fsGetList("challengeLedger")
        ]);
        if (!editingRef.current) setPlayers(p);
        setMatches(m);
        setTournaments(t);
        setChallenges(c);
        setChallengeLedger(l);
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
    async function saveTournaments(next) {
      setTournaments(next);
      try {
        await fsSetList("tournaments", next);
        setConnError(null);
      } catch (e) {
        setConnError(e.message);
      }
    }
    async function saveChallenges(next) {
      setChallenges(next);
      try { await fsSetList("challenges", next); setConnError(null); }
      catch (e) { setConnError(e.message); }
    }
    async function saveChallengeLedger(next) {
      setChallengeLedger(next);
      try { await fsSetList("challengeLedger", next); setConnError(null); }
      catch (e) { setConnError(e.message); }
    }
    function startAcceptedChallenge(id) {
      setActiveChallengeId(id);
      setView("match");
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
          ? h(PlayersView, { players, savePlayers, editingRef, isAdmin, matches })
          : view === "match"
          ? h(MatchView, { players, savePlayers, matches, saveMatches, tournaments, saveTournaments, challenges, saveChallenges, challengeLedger, saveChallengeLedger, activeChallengeId, setActiveChallengeId, isAdmin, onViewRankings: () => setView("players") })
          : view === "challenges"
          ? h(ChallengesView, { players, challenges, saveChallenges, challengeLedger, onStartChallenge: startAcceptedChallenge })
          : view === "challengeLeaders"
          ? h(ChallengeLeaderboard, { players, challengeLedger })
          : view === "history"
          ? h(HistoryView, { matches, players, savePlayers, saveMatches, isAdmin })
          : h(StandingsView, { tournaments, matches })
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
      { id: "challenges", label: "Challenges" },
      { id: "challengeLeaders", label: "Challenge Leaders" },
      { id: "history", label: "History" },
      { id: "standings", label: "Standings" }
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
  function PlayersView({ players, savePlayers, editingRef, isAdmin, matches }) {
    const [bulkText, setBulkText] = useState("");
    const [name, setName] = useState("");
    const [rating, setRating] = useState("");
    const [photo, setPhoto] = useState("");
    const [paidChecked, setPaidChecked] = useState(true);
    const [ratingEditId, setRatingEditId] = useState(null);
    const [editRating, setEditRating] = useState("");
    const [editingPlayer, setEditingPlayer] = useState(null);
    const [search, setSearch] = useState("");
    const [openPlayerId, setOpenPlayerId] = useState(null);
    const [compareOpen, setCompareOpen] = useState(false);

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
          totalFouls: 0,
          registrationPaid: true
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
          totalFouls: 0,
          registrationPaid: paidChecked
        }
      ]);
      setName("");
      setRating("");
      setPhoto("");
      setPaidChecked(true);
    }

    function deletePlayer(id) {
      savePlayers(players.filter((p) => p.id !== id));
      if (openPlayerId === id) setOpenPlayerId(null);
    }

    function togglePaid(id) {
      savePlayers(players.map((p) => (p.id === id ? { ...p, registrationPaid: !isPaid(p) } : p)));
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
            h(
              "label",
              { className: "form-row form-row--checkbox" },
              h("input", {
                type: "checkbox",
                checked: paidChecked,
                onChange: (e) => setPaidChecked(e.target.checked)
              }),
              h("span", { className: "form-label" }, "Registration paid")
            ),
            h("button", { onClick: addSingle, className: "btn btn--gold" }, "Save")
          )
        : h("div", { className: "panel-card no-print" }, h("p", { className: "panel-card__hint" }, "Sign in as admin (top right) to add or edit players.")),

      h(
        "div",
        { className: "rankings-title-row no-print" },
        h("h2", { className: "section-title", style: { marginBottom: 0 } }, "Rankings"),
        h(
          "div",
          { style: { display: "flex", gap: 8 } },
          h("button", { onClick: () => setCompareOpen(true), className: "btn btn--outline btn--sm" }, "\u2696 Compare"),
          h("button", { onClick: () => window.print(), className: "btn btn--outline btn--sm" }, "\u2B07 Download PDF")
        )
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
                onDelete: () => deletePlayer(p.id),
                onTogglePaid: () => togglePaid(p.id)
              });
            })
          ),

      openPlayer && h(PlayerModal, { player: openPlayer, rank: openPlayerRank, matches, onClose: () => setOpenPlayerId(null) }),
      editingPlayer && h(EditPlayerModal, { player: editingPlayer, onCancel: () => setEditingPlayer(null), onSave: saveEditedPlayer }),
      compareOpen && h(CompareModal, { players, matches, onClose: () => setCompareOpen(false) })
    );
  }

  function PlayerCard({ player: p, rank, isAdmin, editing, editRating, setEditRating, onOpen, onStartRatingEdit, onSaveRatingEdit, onEditPlayer, onDelete, onTogglePaid }) {
    const medal = null;
    const paid = isPaid(p);
    return h(
      "div",
      {
        className: "player-card" + (paid ? "" : " player-card--unpaid"),
        onClick: onOpen
      },
      h(
        "div",
        { className: "player-card__rank-wrap" },
        h("div", { className: "player-card__rank" + (medal ? " player-card__rank--medal" : "") }, medal || rank + 1),
        h(RankChangeArrow, { current: rank, prev: p.prevRank })
      ),
      h(Avatar, { src: p.photo, name: p.name, className: "player-card__avatar" }),
      h(
        "div",
        { className: "player-card__info" },
        h(
          "div",
          { className: "player-card__name" },
          p.name,
          !paid && h("span", { className: "unpaid-tag", title: "Registration not paid" }, "\u{1F512} Unpaid")
        ),
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
          : paid
          ? h("span", { className: "rating-badge" }, "\u2B50", p.rating)
          : h("span", { className: "rating-badge rating-badge--hidden", title: "Rating hidden until registration is paid" }, "\u{1F512} Hidden"),
        isAdmin &&
          !editing &&
          h(
            "div",
            { className: "player-card__admin-actions no-print" },
            h(
              "label",
              { className: "paid-toggle", title: "Registration paid" },
              h("input", { type: "checkbox", checked: paid, onChange: onTogglePaid }),
              h("span", null, "Paid")
            ),
            h("button", { onClick: onStartRatingEdit, className: "icon-btn", title: "Quick-edit rating" }, "\u270E"),
            h("button", { onClick: onEditPlayer, className: "icon-btn", title: "Edit player" }, "\u2699"),
            h("button", { onClick: onDelete, className: "icon-btn icon-btn--danger", title: "Remove player" }, "\u2716")
          )
      )
    );
  }

  function RankChangeArrow({ current, prev }) {
    if (prev === undefined || prev === null || prev === current) return null;
    const movedUp = current < prev; // lower index = higher on the leaderboard
    return h(
      "span",
      { className: "rank-arrow " + (movedUp ? "rank-arrow--up" : "rank-arrow--down"), title: movedUp ? "Moved up" : "Moved down" },
      movedUp ? "\u25B2" : "\u25BC"
    );
  }

  /* ---- Shared helpers for player performance features ---- */
  function getPlayerMatches(matches, playerId) {
    const list = [];
    matches.forEach((m) => {
      const blackEntry = m.black.find((e) => e.id === playerId);
      const whiteEntry = m.white.find((e) => e.id === playerId);
      const side = blackEntry ? "black" : whiteEntry ? "white" : null;
      if (!side) return;
      const entry = side === "black" ? blackEntry : whiteEntry;
      const teammates = side === "black" ? m.black : m.white;
      const partner = teammates.find((e) => e.id !== playerId);
      list.push({
        match: m,
        side,
        entry,
        partnerId: partner ? partner.id : null,
        partnerName: partner ? partner.name : null,
        won: m.winner === side,
        isDraw: m.winner === "draw",
        delta: entry.delta || 0,
        date: m.date
      });
    });
    list.sort((a, b) => new Date(a.date) - new Date(b.date));
    return list;
  }

  function computeRatingHistory(player, matches) {
    const pm = getPlayerMatches(matches, player.id);
    const totalDelta = pm.reduce((sum, x) => sum + x.delta, 0);
    let running = player.rating - totalDelta;
    const points = [{ label: "Start", rating: running }];
    pm.forEach((x) => {
      running += x.delta;
      points.push({ label: new Date(x.date).toLocaleDateString(void 0, { month: "short", day: "numeric" }), rating: running });
    });
    return points;
  }

  function computeLongestWinStreak(playerMatches) {
    let longest = 0;
    let current = 0;
    playerMatches.forEach((x) => {
      if (x.won) {
        current += 1;
        longest = Math.max(longest, current);
      } else if (!x.isDraw) {
        current = 0;
      }
    });
    return longest;
  }

  function computeBestPartner(playerMatches) {
    const byPartner = {};
    playerMatches.forEach((x) => {
      if (!x.partnerId) return;
      if (!byPartner[x.partnerId]) byPartner[x.partnerId] = { name: x.partnerName, played: 0, wins: 0 };
      byPartner[x.partnerId].played += 1;
      if (x.won) byPartner[x.partnerId].wins += 1;
    });
    const list = Object.values(byPartner).filter((p) => p.played >= 2); // need at least 2 matches together to mean anything
    if (list.length === 0) return null;
    list.sort((a, b) => b.wins / b.played - a.wins / a.played || b.played - a.played);
    const best = list[0];
    return { name: best.name, played: best.played, wins: best.wins, winPct: Math.round((best.wins / best.played) * 100) };
  }

  function computeBadges(player, playerMatches) {
    const badges = [];
    if (player.played >= 1) badges.push({ icon: "\u{1F396}\uFE0F", label: "First Match" });
    if (player.played >= 10) badges.push({ icon: "\u{1F396}\uFE0F", label: "10 Matches" });
    if (player.played >= 50) badges.push({ icon: "\u{1F3C5}", label: "50 Matches" });
    if (player.wins >= 1) badges.push({ icon: "\u{1F3C6}", label: "First Win" });
    const streak = computeLongestWinStreak(playerMatches);
    if (streak >= 3) badges.push({ icon: "\u{1F525}", label: streak + "-Win Streak" });
    if ((player.totalReds || 0) >= 10) badges.push({ icon: "\u{1F451}", label: "Queen Collector" });
    if ((player.totalCoins || 0) >= 50) badges.push({ icon: "\u{1FA99}", label: "Coin Master" });
    return badges;
  }

  function RatingGraph({ points }) {
    if (points.length < 2) return h("p", { className: "panel-card__hint" }, "Not enough match history yet for a graph.");
    const width = 280;
    const height = 90;
    const pad = 8;
    const ratings = points.map((p) => p.rating);
    const min = Math.min(...ratings);
    const max = Math.max(...ratings);
    const range = max - min || 1;
    const stepX = (width - pad * 2) / (points.length - 1);
    const coords = points.map((p, i) => {
      const x = pad + i * stepX;
      const y = pad + (1 - (p.rating - min) / range) * (height - pad * 2);
      return [x, y];
    });
    const pathD = coords.map(([x, y], i) => (i === 0 ? "M" : "L") + x.toFixed(1) + "," + y.toFixed(1)).join(" ");
    const last = coords[coords.length - 1];
    return h(
      "svg",
      { viewBox: "0 0 " + width + " " + height, className: "rating-graph", preserveAspectRatio: "none" },
      h("path", { d: pathD, fill: "none", stroke: "#B8923F", strokeWidth: 2 }),
      h("circle", { cx: last[0], cy: last[1], r: 3, fill: "#A32F26" })
    );
  }

  function PlayerModal({ player, rank, matches, onClose }) {
    const playerMatches = getPlayerMatches(matches, player.id);
    const ratingHistory = computeRatingHistory(player, matches);
    const badges = computeBadges(player, playerMatches);
    const bestPartner = computeBestPartner(playerMatches);
    const paid = isPaid(player);

    return h(
      "div",
      { className: "modal-overlay", onClick: onClose },
      h(
        "div",
        { className: "modal", onClick: (e) => e.stopPropagation() },
        h("button", { className: "modal__close", onClick: onClose }, "\u2715"),
        h(Avatar, { src: player.photo, name: player.name, className: "modal__avatar" }),
        h("h3", { className: "modal__name" }, player.name),
        h("p", { className: "modal__rank" }, "Rank " + (rank + 1)),
        !paid &&
          h(
            "p",
            { className: "panel-card__hint", style: { textAlign: "center" } },
            "\u{1F512} Registration not paid \u2014 rating is hidden and this player can't be picked for a new match."
          ),
        false && badges.length > 0 &&
          h(
            "div",
            { className: "badge-row" },
            badges.map((b) => h("span", { key: b.label, className: "badge-chip", title: b.label }, b.icon, " ", b.label))
          ),
        h(
          "div",
          { className: "modal__stats-grid" },
          h(Stat, { label: "Rating", value: paid ? "\u2B50 " + player.rating : "\u{1F512} Hidden" }),
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
        ),
        bestPartner &&
          h(
            "div",
            { className: "best-partner-box" },
            h("div", { className: "best-partner-box__label" }, "\u{1F91D} Best Partner"),
            h("div", { className: "best-partner-box__value" }, bestPartner.name, " \u2014 ", bestPartner.winPct, "% in ", bestPartner.played, " matches")
          ),
        paid &&
          h(React.Fragment, null,
            h("div", { className: "rating-graph-label" }, "Rating over time"),
            h(RatingGraph, { points: ratingHistory })
          )
      )
    );
  }
  function Stat({ label, value }) {
    return h("div", { className: "modal__stat" }, h("div", { className: "modal__stat-label" }, label), h("div", { className: "modal__stat-value" }, value));
  }

  function CompareModal({ players, matches, onClose }) {
    const [idA, setIdA] = useState("");
    const [idB, setIdB] = useState("");
    const comparablePlayers = players.filter(isPaid);
    const playerA = comparablePlayers.find((p) => p.id === idA);
    const playerB = comparablePlayers.find((p) => p.id === idB);

    function headToHead() {
      if (!playerA || !playerB) return null;
      let aWins = 0;
      let bWins = 0;
      let draws = 0;
      matches.forEach((m) => {
        const aInBlack = m.black.some((e) => e.id === playerA.id);
        const aInWhite = m.white.some((e) => e.id === playerA.id);
        const bInBlack = m.black.some((e) => e.id === playerB.id);
        const bInWhite = m.white.some((e) => e.id === playerB.id);
        const opposed = (aInBlack && bInWhite) || (aInWhite && bInBlack);
        if (!opposed) return;
        if (m.winner === "draw") draws += 1;
        else if ((aInBlack && m.winner === "black") || (aInWhite && m.winner === "white")) aWins += 1;
        else bWins += 1;
      });
      return { aWins, bWins, draws, total: aWins + bWins + draws };
    }
    const record = headToHead();

    function row(label, va, vb) {
      return h(
        "div",
        { className: "compare-row" },
        h("div", { className: "compare-row__val" }, va),
        h("div", { className: "compare-row__label" }, label),
        h("div", { className: "compare-row__val" }, vb)
      );
    }

    return h(
      "div",
      { className: "modal-overlay", onClick: onClose },
      h(
        "div",
        { className: "modal compare-modal", onClick: (e) => e.stopPropagation() },
        h("button", { className: "modal__close", onClick: onClose }, "\u2715"),
        h("h3", { className: "panel-card__title", style: { textAlign: "center" } }, "\u2696 Compare Players"),
        h(
          "div",
          { className: "compare-pickers" },
          h(
            "select",
            { value: idA, onChange: (e) => setIdA(e.target.value), className: "form-select" },
            h("option", { value: "" }, "Player A"),
            comparablePlayers.filter((p) => p.id !== idB).map((p) => h("option", { key: p.id, value: p.id }, p.name))
          ),
          h(
            "select",
            { value: idB, onChange: (e) => setIdB(e.target.value), className: "form-select" },
            h("option", { value: "" }, "Player B"),
            comparablePlayers.filter((p) => p.id !== idA).map((p) => h("option", { key: p.id, value: p.id }, p.name))
          )
        ),
        playerA &&
          playerB &&
          h(
            "div",
            { style: { marginTop: 16 } },
            row("Rating", "\u2B50 " + playerA.rating, "\u2B50 " + playerB.rating),
            row("Matches", playerA.played, playerB.played),
            row("Wins", playerA.wins, playerB.wins),
            row("Losses", playerA.losses, playerB.losses),
            row("Win %", winPct(playerA) + "%", winPct(playerB) + "%"),
            row("Coins taken", playerA.totalCoins || 0, playerB.totalCoins || 0),
            row("Reds taken", playerA.totalReds || 0, playerB.totalReds || 0),
            record &&
              record.total > 0 &&
              h(
                "div",
                { className: "h2h-box" },
                h("div", { className: "h2h-box__label" }, "Head-to-head (as opponents)"),
                h("div", { className: "h2h-box__value" }, playerA.name, " ", record.aWins, " \u2013 ", record.bWins, " ", playerB.name, record.draws ? " (" + record.draws + " draws)" : "")
              ),
            record &&
              record.total === 0 &&
              h("p", { className: "panel-card__hint", style: { textAlign: "center", marginTop: 10 } }, "These two haven't played against each other yet.")
          )
      )
    );
  }



  function EditPlayerModal({ player, onCancel, onSave }) {
    const [name, setName] = useState(player.name);
    const [rating, setRating] = useState(String(player.rating));
    const [photo, setPhoto] = useState(player.photo || "");
    const [paidChecked, setPaidChecked] = useState(isPaid(player));

    function submit() {
      const r = parseInt(rating, 10);
      onSave({
        id: player.id,
        name: name.trim() || player.name,
        rating: Number.isFinite(r) ? r : player.rating,
        photo: photo.trim(),
        registrationPaid: paidChecked
      });
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
          "label",
          { className: "form-row form-row--checkbox" },
          h("input", {
            type: "checkbox",
            checked: paidChecked,
            onChange: (e) => setPaidChecked(e.target.checked)
          }),
          h("span", { className: "form-label" }, "Registration paid")
        ),
        h(
          "p",
          { className: "panel-card__hint", style: { marginTop: -6 } },
          "Unpaid players' ratings are hidden and they can't be picked for a new match."
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
   * Challenge Mode
   * ==================================================================== */
  function challengeStats(players, ledger) {
    const map = {};
    players.forEach((p) => { map[p.id] = { player: p, points: 0, played: 0, wins: 0, losses: 0, draws: 0 }; });
    ledger.filter((x) => !x.reversed).forEach((entry) => {
      (entry.changes || []).forEach((change) => {
        const s = map[change.playerId]; if (!s) return;
        s.points += Number(change.points) || 0; s.played += 1;
        if (change.points > 0) s.wins += 1; else if (change.points < 0) s.losses += 1; else s.draws += 1;
      });
    });
    return Object.values(map).sort((a,b) => b.points-a.points || b.wins-a.wins || (b.played ? b.wins/b.played : 0)-(a.played ? a.wins/a.played : 0) || b.played-a.played || a.player.name.localeCompare(b.player.name));
  }

  function ChallengeLeaderboard({ players, challengeLedger }) {
    const rows = challengeStats(players.filter(isPaid), challengeLedger);
    return h("div", null,
      h("div", { className: "panel-card" }, h("h2", { className: "panel-card__title" }, "⚔ Challenge Leaders"),
        h("p", { className: "panel-card__hint" }, "Challenge Points are separate from regular FICA ratings. Rankings here alone determine Specific Challenge limits.")),
      h("div", { className: "panel-card standings-table-wrap" },
        h("table", { className: "standings-table" },
          h("thead", null, h("tr", null, ["Rank","Player","CP","P","W","L","D","Win %"].map((x) => h("th", { key:x }, x)))),
          h("tbody", null, rows.map((r,i) => h("tr", { key:r.player.id }, h("td",null,i+1), h("td",{className:"standings-table__team"},r.player.name), h("td",{className:"standings-table__pts"},r.points), h("td",null,r.played), h("td",null,r.wins), h("td",null,r.losses), h("td",null,r.draws), h("td",null,r.played ? Math.round(r.wins/r.played*100)+"%" : "0%"))))
        )
      )
    );
  }

  function ChallengesView({ players, challenges, saveChallenges, challengeLedger, onStartChallenge }) {
    const eligible = players.filter(isPaid);
    const [type,setType]=useState("open"), [a1,setA1]=useState(""), [a2,setA2]=useState(""), [b1,setB1]=useState(""), [b2,setB2]=useState(""), [points,setPoints]=useState("1"), [message,setMessage]=useState("");
    const [counter,setCounter]=useState({});
    function p(id){ return players.find((x)=>x.id===id); }
    function ranks(){ const rows=challengeStats(eligible, challengeLedger); const m={}; rows.forEach((x,i)=>m[x.player.id]=i+1); return m; }
    function specificMax(){
      if(type!=="specific" || !a1 || !a2 || !b1 || !b2) return 5;
      const r=ranks(), ca=(r[a1]+r[a2])/2, cb=(r[b1]+r[b2])/2;
      if(ca<=cb) return 5;
      const gap=ca-cb; return gap<=2?5:gap<=5?4:gap<=10?3:2;
    }
    const maxPoints=type==="open"?10:specificMax();
    function validFour(){ const ids=type==="open"?[a1,a2]:[a1,a2,b1,b2]; return ids.every(Boolean) && new Set(ids).size===ids.length; }
    function post(){
      if(!validFour()) return alert(type==="open"?"Select two different challenger players.":"Select four different players.");
      const stake=parseInt(points,10); if(!Number.isFinite(stake)||stake<1||stake>maxPoints) return alert("Choose between 1 and "+maxPoints+" Challenge Points.");
      const now=new Date().toISOString();
      const item={id:uid(),type,status:type==="open"?"OPEN":"PENDING",challenger:{p1:a1,p2:a2},opponent:{p1:type==="specific"?b1:null,p2:type==="specific"?b2:null},points:stake,message:message.trim(),createdAt:now};
      saveChallenges([item,...challenges]); setA1("");setA2("");setB1("");setB2("");setPoints("1");setMessage("");
    }
    function acceptOpen(c){ const ct=counter[c.id]||{}; if(!ct.p1||!ct.p2||ct.p1===ct.p2) return alert("Create a two-player counter-team first."); saveChallenges(challenges.map((x)=>x.id===c.id?{...x,status:"ACCEPTED",opponent:{p1:ct.p1,p2:ct.p2},acceptedAt:new Date().toISOString()}:x)); }
    function update(c,status){ saveChallenges(challenges.map((x)=>x.id===c.id?{...x,status,[status.toLowerCase()+"At"]:new Date().toISOString()}:x)); }
    function names(team){ return team&&team.p1&&team.p2 ? p(team.p1).name+" + "+p(team.p2).name : "Awaiting counter-team"; }
    const used=[a1,a2,b1,b2].filter(Boolean);
    function opts(current, exclude=[]){ return eligible.filter((x)=>x.id===current||(!used.includes(x.id)&&!exclude.includes(x.id))); }
    return h("div",null,
      h("div",{className:"panel-card"},h("h2",{className:"panel-card__title"},"⚔ Create a Challenge"),
        h("div",{className:"match-type-toggle"},["open","specific"].map((x)=>h("button",{key:x,onClick:()=>{setType(x);setPoints("1");},className:"match-type-toggle__btn"+(type===x?" match-type-toggle__btn--active":"")},x==="open"?"Open Challenge":"Specific Challenge"))),
        h("p",{className:"panel-card__hint"},type==="open"?"Anyone may create a counter-team and accept. Maximum 10 CP.":"Choose both teams. Maximum 5 CP, reduced when a lower Challenge-ranked team challenges a higher-ranked team."),
        h("div",{className:"team-grid"},
          h("div",null,h("div",{className:"team-picker__label"},"Challenger Team"),selectBox(a1,setA1,"Player 1",opts(a1)),selectBox(a2,setA2,"Player 2",opts(a2))),
          type==="specific"&&h("div",null,h("div",{className:"team-picker__label"},"Challenged Team"),selectBox(b1,setB1,"Player 1",opts(b1)),selectBox(b2,setB2,"Player 2",opts(b2)))
        ),
        h("div",{className:"form-grid"},h("div",{className:"form-row"},h("label",{className:"form-label"},"Challenge Points (max "+maxPoints+")"),h("input",{type:"number",min:1,max:maxPoints,value:points,onChange:(e)=>setPoints(e.target.value),className:"form-input"})),h("div",{className:"form-row"},h("label",{className:"form-label"},"Message (optional)"),h("input",{value:message,onChange:(e)=>setMessage(e.target.value),className:"form-input",placeholder:"Add a challenge message"}))),
        h("button",{onClick:post,className:"btn btn--gold btn--block"},type==="open"?"Post Open Challenge":"Send Specific Challenge")
      ),
      h("h2",{className:"section-title"},"Challenge Board"),
      challenges.length===0?h("div",{className:"panel-card empty-state"},"No challenges posted yet."):
      challenges.map((c)=>h("div",{key:c.id,className:"panel-card challenge-card"},
        h("div",{className:"challenge-card__head"},h("strong",null,c.type==="open"?"OPEN CHALLENGE":"SPECIFIC CHALLENGE"),h("span",{className:"challenge-cp"},c.points," CP")),
        h("div",{className:"challenge-vs"},h("span",null,names(c.challenger)),h("b",null," VS "),h("span",null,names(c.opponent))),
        c.message&&h("p",{className:"panel-card__hint"},'“'+c.message+'”'),h("span",{className:"challenge-status challenge-status--"+c.status.toLowerCase()},c.status.replace("_"," ")),
        c.type==="open"&&c.status==="OPEN"&&h("div",{className:"challenge-counter"},selectBox((counter[c.id]||{}).p1,(v)=>setCounter({...counter,[c.id]:{...(counter[c.id]||{}),p1:v}}),"Counter player 1",eligible.filter(x=>![c.challenger.p1,c.challenger.p2,(counter[c.id]||{}).p2].includes(x.id))),selectBox((counter[c.id]||{}).p2,(v)=>setCounter({...counter,[c.id]:{...(counter[c.id]||{}),p2:v}}),"Counter player 2",eligible.filter(x=>![c.challenger.p1,c.challenger.p2,(counter[c.id]||{}).p1].includes(x.id))),h("button",{onClick:()=>acceptOpen(c),className:"btn btn--primary btn--sm"},"Accept")),
        c.type==="specific"&&c.status==="PENDING"&&h("div",{className:"match-actions"},h("button",{onClick:()=>update(c,"ACCEPTED"),className:"btn btn--primary btn--sm"},"Accept"),h("button",{onClick:()=>update(c,"REJECTED"),className:"btn btn--danger btn--sm"},"Reject")),
        c.status==="ACCEPTED"&&h("button",{onClick:()=>onStartChallenge(c.id),className:"btn btn--gold btn--block"},"Start Match"),
        ["OPEN","PENDING"].includes(c.status)&&h("button",{onClick:()=>update(c,"CANCELLED"),className:"link-btn",style:{marginTop:10}},"Cancel challenge")
      ))
    );
    function selectBox(value,setter,label,options){ return h("select",{value,onChange:(e)=>setter(e.target.value),className:"form-select",style:{marginBottom:8}},h("option",{value:""},label),options.map((x)=>h("option",{key:x.id,value:x.id},x.name))); }
  }

  /* ==================================================================== *
   * New Match
   * ==================================================================== */
  function MatchView({ players, savePlayers, matches, saveMatches, tournaments, saveTournaments, challenges, saveChallenges, challengeLedger, saveChallengeLedger, activeChallengeId, setActiveChallengeId, isAdmin, onViewRankings }) {
    // Only players whose registration is marked paid are eligible to be
    // picked into a new match (friendly or tournament team).
    const eligiblePlayers = players.filter(isPaid);
    const empty = { blackA: "", blackB: "", whiteA: "", whiteB: "" };
    const [sel, setSel] = useState(empty);
    const [started, setStarted] = useState(false);
    const [pts, setPts] = useState({});
    const [rawStats, setRawStats] = useState({});
    const [history, setHistory] = useState([]);
    const [coinsUsed, setCoinsUsed] = useState({ black: 0, white: 0, red: 0 });
    const [lastCoinSource, setLastCoinSource] = useState({ black: null, white: null }); // 'pot' | 'foul' | null - source of the MOST RECENT coin taken for each color (not cumulative)
    const [summary, setSummary] = useState(null);
    const [matchType, setMatchType] = useState(activeChallengeId ? "challenge" : "friendly"); // friendly | tournament | challenge
    const [tourId, setTourId] = useState("");
    const [teamBlackId, setTeamBlackId] = useState("");
    const [teamWhiteId, setTeamWhiteId] = useState("");
    const [matchMeta, setMatchMeta] = useState(null); // captured at start(): { tournamentId, tournamentName, blackTeamName, whiteTeamName } or null for friendly

    const selectedTournament = tournaments.find((t) => t.id === tourId) || null;
    const activeChallenge = challenges.find((c) => c.id === activeChallengeId && c.status === "ACCEPTED") || null;

    // In tournament mode, derive the effective player selection directly from
    // the chosen teams at render time (not via a separate effect+state sync,
    // which could race with canStart()/OddsPanel rendering before it catches up).
    function computeEffectiveSel() {
      if (matchType === "challenge" && activeChallenge) {
        return { blackA: activeChallenge.challenger.p1, blackB: activeChallenge.challenger.p2, whiteA: activeChallenge.opponent.p1, whiteB: activeChallenge.opponent.p2 };
      }
      if (matchType !== "tournament" || !selectedTournament) return sel;
      const teamBlack = selectedTournament.teams.find((t) => t.id === teamBlackId);
      const teamWhite = selectedTournament.teams.find((t) => t.id === teamWhiteId);
      return {
        blackA: teamBlack ? teamBlack.p1 : "",
        blackB: teamBlack ? teamBlack.p2 : "",
        whiteA: teamWhite ? teamWhite.p1 : "",
        whiteB: teamWhite ? teamWhite.p2 : ""
      };
    }
    const effectiveSel = computeEffectiveSel();

    const slots = ["blackA", "blackB", "whiteA", "whiteB"];
    const chosenIds = slots.map((s) => sel[s]).filter(Boolean);

    function optionsFor(slot) {
      return eligiblePlayers.filter((p) => p.id === sel[slot] || !chosenIds.includes(p.id));
    }
    function canStart() {
      if (matchType === "challenge") return !!activeChallenge;
      if (matchType === "tournament") {
        if (!tourId || !teamBlackId || !teamWhiteId || teamBlackId === teamWhiteId) return false;
        return !!(effectiveSel.blackA && effectiveSel.blackB && effectiveSel.whiteA && effectiveSel.whiteB);
      }
      return slots.every((s) => sel[s]) && new Set(chosenIds).size === 4;
    }
    function start() {
      if (!canStart()) return;
      const s = effectiveSel; // freeze the resolved selection for this match, synchronously
      setSel(s);
      setPts({ [s.blackA]: 0, [s.blackB]: 0, [s.whiteA]: 0, [s.whiteB]: 0 });
      setRawStats({
        [s.blackA]: { coins: 0, reds: 0, fouls: 0 },
        [s.blackB]: { coins: 0, reds: 0, fouls: 0 },
        [s.whiteA]: { coins: 0, reds: 0, fouls: 0 },
        [s.whiteB]: { coins: 0, reds: 0, fouls: 0 }
      });
      setCoinsUsed({ black: 0, white: 0, red: 0 });
      setLastCoinSource({ black: null, white: null });
      setHistory([]);
      setSummary(null);
      if (matchType === "challenge" && activeChallenge) {
        setMatchMeta({ challengeId: activeChallenge.id, challengePoints: activeChallenge.points, challengeType: activeChallenge.type });
        saveChallenges(challenges.map((c) => c.id === activeChallenge.id ? { ...c, status: "IN_PROGRESS", startedAt: new Date().toISOString() } : c));
      } else if (matchType === "tournament" && selectedTournament) {
        const teamBlack = selectedTournament.teams.find((t) => t.id === teamBlackId);
        const teamWhite = selectedTournament.teams.find((t) => t.id === teamWhiteId);
        setMatchMeta({
          tournamentId: selectedTournament.id,
          tournamentName: selectedTournament.name,
          blackTeamId: teamBlack ? teamBlack.id : "",
          blackTeamName: teamBlack ? teamBlack.name : "",
          whiteTeamId: teamWhite ? teamWhite.id : "",
          whiteTeamName: teamWhite ? teamWhite.name : ""
        });
      } else {
        setMatchMeta(null);
      }
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
      setLastCoinSource((s) => ({ ...s, [last.coinsUsedKey]: null }));
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
      setLastCoinSource((s) => ({ ...s, [team]: "pot" }));
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
      setLastCoinSource((s) => ({ ...s, [oppColor]: "foul" }));
      addPoints(playerId, -2);
      bumpRaw(playerId, "fouls");
      pushAction({ playerId, statKey: "fouls", pointDelta: -2, coinsUsedKey: oppColor });
    }
    function playerById(id) {
      return players.find((p) => p.id === id);
    }

    // A team wins by emptying all 9 of their own coins, with the queen accounted
    // for (taken by either side) - this is the real carrom win condition, not
    // whoever has more points. Always computed fresh from the current board
    // state (not remembered), so Undo can never leave a stale result behind.
    function computeFinishState() {
      // For a given color: null = not finished yet. Otherwise returns which
      // team actually WINS as a result of that color emptying out - which
      // isn't always the same team the color belongs to:
      //   - If the coin that COMPLETED this color's 9 came from the
      //     OPPONENT's foul, this team wins outright, queen or no queen (not
      //     their fault it emptied). An earlier, unrelated foul earlier in
      //     the match doesn't count here - only the actual completing coin.
      //   - Otherwise (the completing coin was this team's own legitimate
      //     pot): if the queen has been taken, this team wins normally. If
      //     the queen is still on the board, they ran out without covering
      //     it - so the OPPONENT wins instead.
      function evaluate(color, oppColor) {
        if (coinsUsed[color] < MAX_COLOR_COINS) return null;
        if (lastCoinSource[color] === "foul") return color;
        return coinsUsed.red >= MAX_QUEEN ? color : oppColor;
      }
      const blackResult = evaluate("black", "white");
      const whiteResult = evaluate("white", "black");
      if (blackResult && whiteResult) return blackResult === whiteResult ? blackResult : null; // both finished with conflicting outcomes - ambiguous, fall back to points
      return blackResult || whiteResult || null;
    }

    const blackTotal = (pts[sel.blackA] || 0) + (pts[sel.blackB] || 0);
    const whiteTotal = (pts[sel.whiteA] || 0) + (pts[sel.whiteB] || 0);

    function finish() {
      // Real carrom win condition: whoever empties their 9 coins (with the
      // queen accounted for) wins - not whoever has more points. Points only
      // decide the outcome if the match is ended before anyone actually finishes.
      const finisher = computeFinishState();
      const blackWon = finisher ? finisher === "black" : blackTotal > whiteTotal;
      const whiteWon = finisher ? finisher === "white" : whiteTotal > blackTotal;
      const isDraw = !finisher && blackTotal === whiteTotal;

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
      // Snapshot everyone's rank position as it stood right before this match,
      // so the Rankings screen can show an up/down arrow for whoever moved.
      const rankedBefore = [...players].sort((a, b) => b.rating - a.rating);
      const prevRankMap = {};
      rankedBefore.forEach((p, i) => {
        prevRankMap[p.id] = i;
      });

      const nextPlayers = players.map((p) => {
        if (!(p.id in deltas)) return { ...p, prevRank: prevRankMap[p.id] };
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
          totalFouls: (p.totalFouls || 0) + raw.fouls,
          prevRank: prevRankMap[p.id]
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
        scoreWhite: whiteTotal,
        winner: isDraw ? "draw" : blackWon ? "black" : "white",
        tournamentId: matchMeta ? matchMeta.tournamentId : null,
        tournamentName: matchMeta ? matchMeta.tournamentName : null,
        blackTeamId: matchMeta ? matchMeta.blackTeamId : null,
        blackTeamName: matchMeta ? matchMeta.blackTeamName : null,
        whiteTeamId: matchMeta ? matchMeta.whiteTeamId : null,
        whiteTeamName: matchMeta ? matchMeta.whiteTeamName : null,
        matchMode: matchMeta && matchMeta.challengeId ? "challenge" : (matchMeta && matchMeta.tournamentId ? "tournament" : "friendly"),
        challengeId: matchMeta && matchMeta.challengeId ? matchMeta.challengeId : null,
        challengePoints: matchMeta && matchMeta.challengeId ? matchMeta.challengePoints : null
      };
      if (matchMeta && matchMeta.challengeId) {
        const stake = Number(matchMeta.challengePoints) || 0;
        const changes = [];
        [sel.blackA, sel.blackB].forEach((id) => changes.push({ playerId: id, points: isDraw ? 0 : blackWon ? stake : -stake }));
        [sel.whiteA, sel.whiteB].forEach((id) => changes.push({ playerId: id, points: isDraw ? 0 : whiteWon ? stake : -stake }));
        const ledgerEntry = { id: uid(), challengeId: matchMeta.challengeId, matchId: record.id, date: record.date, stake, winner: record.winner, changes, reversed: false };
        saveChallengeLedger([ledgerEntry, ...challengeLedger]);
        saveChallenges(challenges.map((c) => c.id === matchMeta.challengeId ? { ...c, status: "COMPLETED", completedAt: record.date, matchId: record.id, winner: record.winner } : c));
        setActiveChallengeId(null);
      }
      savePlayers(nextPlayers);
      saveMatches([record, ...matches]);
      setSummary(record);
      setStarted(false);
    }
    function newMatch() {
      setSel(empty);
      setTeamBlackId("");
      setTeamWhiteId("");
      setMatchMeta(null);
      setSummary(null);
    }

    if (eligiblePlayers.length < 4) {
      return h(
        "div",
        { className: "panel-card" },
        h(
          "p",
          { className: "panel-card__hint" },
          players.length < 4
            ? "You need at least 4 players on the board before starting a doubles match. Add players in the Rankings tab."
            : "You need at least 4 players with registration paid before starting a doubles match. An admin can mark players as paid in the Rankings tab."
        )
      );
    }

    if (summary) {
      // Use the actual recorded winner (based on who finished their coins),
      // not raw points - only fall back to comparing scores for older records
      // saved before the "winner" field existed.
      const summaryWinnerSide = summary.winner || (summary.scoreBlack === summary.scoreWhite ? "draw" : summary.scoreBlack > summary.scoreWhite ? "black" : "white");
      const winner = summaryWinnerSide === "draw" ? "Draw" : summaryWinnerSide === "black" ? "Team \u26AB Black wins" : "Team \u25CB White wins";
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
        (() => {
          const liveFinisher = computeFinishState();
          return (
            liveFinisher &&
            h(
              "div",
              { className: "winner-banner" },
              "\u{1F3C6} ",
              liveFinisher === "black" ? "\u26AB Team Black wins" : "\u25CB Team White wins",
              " \u2014 tap Finish match to record it!"
            )
          );
        })(),
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
      isAdmin && h(TournamentManager, { players: eligiblePlayers, tournaments, saveTournaments }),

      h("h2", { className: "panel-card__title" }, "Pick players"),
      h(
        "div",
        { className: "match-type-toggle" },
        h(
          "button",
          {
            onClick: () => setMatchType("friendly"),
            className: "match-type-toggle__btn" + (matchType === "friendly" ? " match-type-toggle__btn--active" : "")
          },
          "Friendly"
        ),
        h(
          "button",
          {
            onClick: () => setMatchType("tournament"),
            className: "match-type-toggle__btn" + (matchType === "tournament" ? " match-type-toggle__btn--active" : "")
          },
          "Tournament"
        )
      ),

      matchType === "friendly"
        ? h(
            "div",
            { className: "team-grid" },
            h(TeamPicker, { label: "\u26AB Team Black", slotA: "blackA", slotB: "blackB", sel, setSel, optionsFor }),
            h(TeamPicker, { label: "\u25CB Team White", slotA: "whiteA", slotB: "whiteB", sel, setSel, optionsFor })
          )
        : matchType === "tournament"
        ? h(TournamentMatchPicker, {
            tournaments, tourId, setTourId, teamBlackId, setTeamBlackId, teamWhiteId, setTeamWhiteId, playerById
          })
        : activeChallenge
        ? h("div", { className: "challenge-match-banner" },
            h("strong", null, "Challenge Match · ", activeChallenge.points, " CP"),
            h("div", null, playerById(activeChallenge.challenger.p1).name, " + ", playerById(activeChallenge.challenger.p2).name, " vs ", playerById(activeChallenge.opponent.p1).name, " + ", playerById(activeChallenge.opponent.p2).name))
        : h("div", { className: "panel-card__hint", style: { padding: "12px 0" } }, "Accept a challenge from the Challenges tab, then select Start Match."),

      canStart() && h(OddsPanel, { black: [playerById(effectiveSel.blackA), playerById(effectiveSel.blackB)], white: [playerById(effectiveSel.whiteA), playerById(effectiveSel.whiteB)] }),
      h(
        "button",
        { onClick: start, disabled: !canStart(), className: "btn btn--primary btn--block", style: { marginTop: 20 } },
        "Start match"
      )
    );
  }

  function TournamentMatchPicker({ tournaments, tourId, setTourId, teamBlackId, setTeamBlackId, teamWhiteId, setTeamWhiteId, playerById }) {
    const tournament = tournaments.find((t) => t.id === tourId) || null;
    const teams = tournament ? tournament.teams : [];

    function teamLabel(team) {
      if (!team) return "";
      const p1 = playerById(team.p1);
      const p2 = playerById(team.p2);
      return team.name + " (" + (p1 ? p1.name : "?") + " + " + (p2 ? p2.name : "?") + ")";
    }

    if (tournaments.length === 0) {
      return h(
        "div",
        { className: "panel-card__hint", style: { padding: "10px 0" } },
        "No tournaments yet. Ask an admin to create one (button above) with at least two teams."
      );
    }

    return h(
      "div",
      null,
      h(
        "div",
        { className: "form-row" },
        h("label", { className: "form-label" }, "Tournament"),
        h(
          "select",
          {
            value: tourId,
            onChange: (e) => {
              setTourId(e.target.value);
              setTeamBlackId("");
              setTeamWhiteId("");
            },
            className: "form-select"
          },
          h("option", { value: "" }, "Select tournament"),
          tournaments.map((t) => h("option", { key: t.id, value: t.id }, t.name))
        )
      ),
      tournament &&
        (teams.length < 2
          ? h("p", { className: "panel-card__hint" }, "This tournament needs at least two teams before a match can be played.")
          : h(
              "div",
              { className: "team-grid", style: { marginTop: 10 } },
              h(
                "div",
                null,
                h("div", { className: "team-picker__label" }, "\u26AB Team Black"),
                h(
                  "select",
                  { value: teamBlackId, onChange: (e) => setTeamBlackId(e.target.value), className: "form-select" },
                  h("option", { value: "" }, "Select team"),
                  teams
                    .filter((t) => t.id !== teamWhiteId)
                    .map((t) => h("option", { key: t.id, value: t.id }, teamLabel(t)))
                )
              ),
              h(
                "div",
                null,
                h("div", { className: "team-picker__label" }, "\u25CB Team White"),
                h(
                  "select",
                  { value: teamWhiteId, onChange: (e) => setTeamWhiteId(e.target.value), className: "form-select" },
                  h("option", { value: "" }, "Select team"),
                  teams
                    .filter((t) => t.id !== teamBlackId)
                    .map((t) => h("option", { key: t.id, value: t.id }, teamLabel(t)))
                )
              )
            ))
    );
  }

  function TournamentManager({ players, tournaments, saveTournaments }) {
    const [open, setOpen] = useState(false);
    const [newTourName, setNewTourName] = useState("");
    const [activeTourId, setActiveTourId] = useState("");
    const [teamName, setTeamName] = useState("");
    const [teamP1, setTeamP1] = useState("");
    const [teamP2, setTeamP2] = useState("");

    function addTournament() {
      if (!newTourName.trim()) return;
      const t = { id: uid(), name: newTourName.trim(), teams: [] };
      saveTournaments([...tournaments, t]);
      setNewTourName("");
      setActiveTourId(t.id);
    }
    function deleteTournament(id) {
      if (!window.confirm("Delete this tournament and all its teams? Past match history is not affected.")) return;
      saveTournaments(tournaments.filter((t) => t.id !== id));
      if (activeTourId === id) setActiveTourId("");
    }
    function addTeam(tourId) {
      if (!teamName.trim() || !teamP1 || !teamP2 || teamP1 === teamP2) return;
      const next = tournaments.map((t) =>
        t.id === tourId ? { ...t, teams: [...t.teams, { id: uid(), name: teamName.trim(), p1: teamP1, p2: teamP2 }] } : t
      );
      saveTournaments(next);
      setTeamName("");
      setTeamP1("");
      setTeamP2("");
    }
    function deleteTeam(tourId, teamId) {
      const next = tournaments.map((t) => (t.id === tourId ? { ...t, teams: t.teams.filter((tm) => tm.id !== teamId) } : t));
      saveTournaments(next);
    }

    const activeTour = tournaments.find((t) => t.id === activeTourId) || null;
    const usedPlayerIds = activeTour ? activeTour.teams.flatMap((tm) => [tm.p1, tm.p2]) : [];
    function playerOptions(current) {
      return players.filter((p) => p.id === current || !usedPlayerIds.includes(p.id));
    }

    return h(
      "div",
      { className: "panel-card", style: { background: "var(--bg)" } },
      h(
        "div",
        { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } },
        h("h2", { className: "panel-card__title", style: { marginBottom: 0 } }, "\u{1F3C6} Manage Tournaments"),
        h("button", { onClick: () => setOpen((o) => !o), className: "btn btn--outline btn--sm" }, open ? "Hide" : "Manage")
      ),
      open &&
        h(
          "div",
          { style: { marginTop: 14 } },
          h(
            "div",
            { className: "flex-row-input", style: { marginBottom: 16 } },
            h("input", {
              value: newTourName,
              onChange: (e) => setNewTourName(e.target.value),
              placeholder: "New tournament name",
              className: "form-input"
            }),
            h("button", { onClick: addTournament, className: "btn btn--gold btn--sm" }, "Create")
          ),
          tournaments.length === 0
            ? h("p", { className: "panel-card__hint" }, "No tournaments yet.")
            : tournaments.map((t) =>
                h(
                  "div",
                  { key: t.id, className: "tournament-item" },
                  h(
                    "div",
                    { className: "tournament-item__header", onClick: () => setActiveTourId(activeTourId === t.id ? "" : t.id) },
                    h("span", { className: "tournament-item__name" }, t.name, " \u00B7 ", t.teams.length, " team(s)"),
                    h(
                      "button",
                      {
                        onClick: (e) => {
                          e.stopPropagation();
                          deleteTournament(t.id);
                        },
                        className: "icon-btn icon-btn--danger"
                      },
                      "\u2716"
                    )
                  ),
                  activeTourId === t.id &&
                    h(
                      "div",
                      { className: "tournament-item__body" },
                      t.teams.length === 0
                        ? h("p", { className: "panel-card__hint" }, "No teams yet.")
                        : t.teams.map((tm) =>
                            h(
                              "div",
                              { key: tm.id, className: "tournament-team-row" },
                              h(
                                "span",
                                null,
                                tm.name,
                                " \u2014 ",
                                (players.find((p) => p.id === tm.p1) || {}).name || "?",
                                " + ",
                                (players.find((p) => p.id === tm.p2) || {}).name || "?"
                              ),
                              h("button", { onClick: () => deleteTeam(t.id, tm.id), className: "icon-btn icon-btn--danger" }, "\u2716")
                            )
                          ),
                      h(
                        "div",
                        { className: "form-row", style: { marginTop: 10 } },
                        h("label", { className: "form-label" }, "New team name"),
                        h("input", { value: teamName, onChange: (e) => setTeamName(e.target.value), className: "form-input", placeholder: "e.g. Team Titans" })
                      ),
                      h(
                        "div",
                        { className: "form-grid" },
                        h(
                          "div",
                          { className: "form-row" },
                          h("label", { className: "form-label" }, "Player 1"),
                          h(
                            "select",
                            { value: teamP1, onChange: (e) => setTeamP1(e.target.value), className: "form-select" },
                            h("option", { value: "" }, "Select player"),
                            playerOptions(teamP1).map((p) => h("option", { key: p.id, value: p.id }, p.name))
                          )
                        ),
                        h(
                          "div",
                          { className: "form-row" },
                          h("label", { className: "form-label" }, "Player 2"),
                          h(
                            "select",
                            { value: teamP2, onChange: (e) => setTeamP2(e.target.value), className: "form-select" },
                            h("option", { value: "" }, "Select player"),
                            playerOptions(teamP2).map((p) => h("option", { key: p.id, value: p.id }, p.name))
                          )
                        )
                      ),
                      h("button", { onClick: () => addTeam(t.id), className: "btn btn--gold btn--sm", style: { marginTop: 8 } }, "Add team")
                    )
                )
              )
        )
    );
  }

  function OddsPanel({ black, white }) {
    if (!black[0] || !black[1] || !white[0] || !white[1]) return null; // players not fully resolved yet - render nothing rather than crash
    const avgBlack = (black[0].rating + black[1].rating) / 2;
    const avgWhite = (white[0].rating + white[1].rating) / 2;
    const higherAvg = Math.max(avgBlack, avgWhite);
    const lowerAvg = Math.min(avgBlack, avgWhite);
    const gapPct = ((higherAvg - lowerAvg) / Math.max(lowerAvg, 1)) * 100;
    const isFairlyEqual = gapPct <= 10;
    const blackIsFavourite = avgBlack >= avgWhite;

    function underdogLabel() {
      if (gapPct > 75) return "Ultra Pro Max Dog";
      if (gapPct > 50) return "Ultra Dog";
      return "Underdog";
    }

    const rows = [
      { team: "\u26AB Team Black", avg: avgBlack, isFav: blackIsFavourite },
      { team: "\u25CB Team White", avg: avgWhite, isFav: !blackIsFavourite }
    ];

    return h(
      "div",
      { className: "odds-panel" },
      h("div", { className: "odds-panel__title" }, "Match Odds"),
      rows.map((r) =>
        h(
          "div",
          { key: r.team, className: "odds-panel__row" },
          h("span", { className: "odds-panel__team" }, r.team, " \u00B7 avg ", Math.round(r.avg)),
          h(
            "span",
            {
              className:
                "odds-panel__tag" +
                (isFairlyEqual ? " odds-panel__tag--equal" : r.isFav ? " odds-panel__tag--fav" : " odds-panel__tag--dog")
            },
            isFairlyEqual ? "Fairly Equal" : r.isFav ? "Favourite" : underdogLabel()
          )
        )
      ),
      h("div", { className: "odds-panel__gap" }, "Gap: ", gapPct.toFixed(0), "%")
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

        // Fall back to inferring win/loss from the recorded winner (or, for very
        // old records saved before that field existed, from scores).
        const winnerSide = m.winner || (m.scoreBlack === m.scoreWhite ? "draw" : m.scoreBlack > m.scoreWhite ? "black" : "white");
        const isDraw = winnerSide === "draw";
        const blackWon = winnerSide === "black";
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
    // Use the actual recorded winner (based on who finished their coins), not
    // raw points - only fall back to comparing scores for older records saved
    // before the "winner" field existed.
    const winnerSide = m.winner || (m.scoreBlack === m.scoreWhite ? "draw" : m.scoreBlack > m.scoreWhite ? "black" : "white");
    const isDraw = winnerSide === "draw";
    const blackWon = winnerSide === "black";
    const resultLabel = isDraw ? "Draw" : blackWon ? "\u26AB Black won" : "\u25CB White won";
    const winnerTeam = isDraw ? null : blackWon ? { label: "\u26AB Winner", players: m.black } : { label: "\u25CB Winner", players: m.white };
    const loserTeam = isDraw ? null : blackWon ? { label: "\u25CB Loser", players: m.white } : { label: "\u26AB Loser", players: m.black };

    return h(
      "div",
      { className: "panel-card" },
      m.tournamentName &&
        h(
          "div",
          { className: "tournament-badge" },
          "\u{1F3C6} ",
          m.tournamentName,
          m.blackTeamName && m.whiteTeamName ? " \u00B7 " + m.blackTeamName + " vs " + m.whiteTeamName : ""
        ),
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

  /* ==================================================================== *
   * Standings (tournament league table)
   * Win = +5 points, Draw = +2 points, Loss = +0. REF column = total reds
   * (queens) taken by that team across all their tournament matches.
   * ==================================================================== */
  function StandingsView({ tournaments, matches }) {
    const [tourId, setTourId] = useState(tournaments.length === 1 ? tournaments[0].id : "");
    const tournament = tournaments.find((t) => t.id === tourId) || null;

    if (tournaments.length === 0) {
      return h("div", { className: "panel-card empty-state" }, "No tournaments yet. An admin can create one from the New Match screen.");
    }

    const rows = tournament
      ? tournament.teams.map((team) => {
          const row = { name: team.name, played: 0, won: 0, lost: 0, draw: 0, points: 0, reds: 0 };
          matches.forEach((m) => {
            if (m.tournamentId !== tournament.id) return;
            const isBlack = m.blackTeamId ? m.blackTeamId === team.id : m.blackTeamName === team.name;
            const isWhite = m.whiteTeamId ? m.whiteTeamId === team.id : m.whiteTeamName === team.name;
            if (!isBlack && !isWhite) return;
            row.played += 1;
            const teamReds = (isBlack ? m.black : m.white).reduce((sum, pl) => sum + (pl.reds || 0), 0);
            row.reds += teamReds;
            if (m.winner === "draw") {
              row.draw += 1;
              row.points += 2;
            } else if ((isBlack && m.winner === "black") || (isWhite && m.winner === "white")) {
              row.won += 1;
              row.points += 5;
            } else {
              row.lost += 1;
            }
          });
          return row;
        })
      : [];
    rows.sort((a, b) => b.points - a.points || b.reds - a.reds);

    return h(
      "div",
      null,
      h(
        "div",
        { className: "panel-card" },
        h("h2", { className: "panel-card__title" }, "Tournament Standings"),
        h(
          "div",
          { className: "form-row" },
          h("label", { className: "form-label" }, "Tournament"),
          h(
            "select",
            { value: tourId, onChange: (e) => setTourId(e.target.value), className: "form-select" },
            h("option", { value: "" }, "Select tournament"),
            tournaments.map((t) => h("option", { key: t.id, value: t.id }, t.name))
          )
        ),
        h("p", { className: "panel-card__hint" }, "Win = +5 pts \u00B7 Draw = +2 pts \u00B7 Loss = +0 pts \u00B7 REF = total reds (queens) taken")
      ),
      tournament &&
        (rows.length === 0
          ? h("div", { className: "panel-card empty-state" }, "This tournament has no teams yet.")
          : h(
              "div",
              { className: "panel-card standings-table-wrap" },
              h(
                "table",
                { className: "standings-table" },
                h(
                  "thead",
                  null,
                  h(
                    "tr",
                    null,
                    h("th", null, "Team"),
                    h("th", null, "P"),
                    h("th", null, "W"),
                    h("th", null, "L"),
                    h("th", null, "D"),
                    h("th", null, "PTS"),
                    h("th", null, "REF")
                  )
                ),
                h(
                  "tbody",
                  null,
                  rows.map((r, i) =>
                    h(
                      "tr",
                      { key: r.name },
                      h("td", { className: "standings-table__team" }, i + 1, ". ", r.name),
                      h("td", null, r.played),
                      h("td", null, r.won),
                      h("td", null, r.lost),
                      h("td", null, r.draw),
                      h("td", { className: "standings-table__pts" }, r.points),
                      h("td", null, r.reds)
                    )
                  )
                )
              )
            ))
    );
  }


  const challengeStyle = document.createElement("style");
  challengeStyle.textContent = `
    .challenge-card{border-left:5px solid #b8923f}.challenge-card__head{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px}
    .challenge-cp{background:#2d1a0f;color:#f2c14e;border-radius:999px;padding:6px 12px;font-weight:800}.challenge-vs{display:flex;gap:12px;justify-content:center;align-items:center;flex-wrap:wrap;font-size:1.05rem;margin:12px 0}
    .challenge-status{display:inline-block;margin:8px 0;padding:4px 9px;border-radius:999px;background:#ece7dc;font-size:.75rem;font-weight:800}.challenge-status--accepted{background:#dff2e5;color:#146b32}.challenge-status--completed{background:#dfe9f7;color:#194f8a}.challenge-status--rejected,.challenge-status--cancelled{background:#f8dddd;color:#8a1c1c}
    .challenge-counter{display:grid;grid-template-columns:1fr 1fr auto;gap:8px;align-items:start;margin-top:12px}.challenge-match-banner{background:#fff7df;border:1px solid #d4aa4b;border-radius:14px;padding:16px;margin:12px 0;text-align:center}.challenge-match-banner strong{display:block;color:#8a5a00;margin-bottom:6px}
    @media(max-width:700px){.challenge-counter{grid-template-columns:1fr}.tabs{overflow-x:auto;justify-content:flex-start}.tab-btn{min-width:130px}.challenge-vs{flex-direction:column}}
  `;
  document.head.appendChild(challengeStyle);

  ReactDOM.createRoot(document.getElementById("root")).render(h(CarromRatings, null));
})();
