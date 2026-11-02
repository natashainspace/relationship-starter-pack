/* ============================================================
   Общая логика казино: спины, призы, окошки.
   Подключается на casino.html, claw.html и slots.html.
   Всё хранится в браузере того, кто играет (localStorage).
   ============================================================ */

var Casino = (function () {

  // ===== НАСТРОЙКИ =====
  var FREE_PER_DAY = 3;          // фри спинов в день, обновляются в 00:00 по москве
  var WIN_CHANCE = 1 / 7;        // шанс что-то выиграть за один спин

  // Обычные призы. weight - насколько часто выпадает (чем больше, тем чаще)
  var PRIZES = [
    { text: "поцелуйчик 😚", weight: 20 },
    { text: "чесание спинки ногтями с гель лаком 1 минуту 🤗", weight: 20 },
    { text: "чесание спинки ногтями с гель лаком 3 минуты 😋", weight: 16 },
    { text: "фул сервис по чесанию спинки ногтями с гель лаком, поцелуйчиками и массажем головы 🤭", weight: 9 },
    { text: "массажик 🎀", weight: 9 },
    { text: "секси фоточка от наташи 🥵", weight: 8 },
    { text: "минетик 🍬", weight: 6 },
    { text: "купон \"ты прав\" 😵", weight: 6 },
    { text: "заказ еды у наташи 🍟", weight: 6 },
    { text: "наташа покупает тебе лего 🎁", weight: 2 }     // самый редкий
  ];

  // Особый приз: выпадает ровно один раз в первые SPECIAL_DAYS дней
  // с первого захода в казино, потом не выпадает никогда
  var SPECIAL = "работающий чпд кюл на пром 🫪";
  var SPECIAL_DAYS = 3;

  var KEY = "casino-v2";
  // =====================

  var DAY = 86400000, MSK = 3 * 3600000;

  function mskDay(t) { return Math.floor(((t || Date.now()) + MSK) / DAY); }
  function nextReset() { return (mskDay() + 1) * DAY - MSK; }
  function rand(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }

  // ----- хранение -----
  var memory = null;

  // если браузер не даёт хранилище (например, некоторые режимы инкогнито),
  // работаем с копией в памяти до закрытия страницы
  function read() {
    try {
      var s = JSON.parse(localStorage.getItem(KEY));
      return s && s.v === 1 ? s : null;
    } catch (e) {
      return memory;
    }
  }

  function write(s) {
    memory = s;
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {}
    listeners.forEach(function (fn) { fn(); });
  }

  // текущее состояние; заодно выдаёт новые фри спины, если наступил новый день
  function state() {
    var today = mskDay();
    var s = read();
    if (!s) {
      s = {
        v: 1, start: today, day: today,
        free: FREE_PER_DAY, paid: 0, spinsToday: 0,
        special: { day: rand(0, SPECIAL_DAYS - 1), spin: rand(1, FREE_PER_DAY), given: false },
        prizes: []
      };
      memory = s;
      try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {}
    }
    if (s.day !== today) {           // фри спины не копятся: всегда ровно 3
      s.day = today;
      s.free = FREE_PER_DAY;
      s.spinsToday = 0;
      memory = s;
      try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {}
    }
    return s;
  }

  var listeners = [];
  function onChange(fn) { listeners.push(fn); }

  function total() { var s = state(); return s.free + s.paid; }

  function pickPrize() {
    var sum = PRIZES.reduce(function (a, p) { return a + p.weight; }, 0);
    var r = Math.random() * sum;
    for (var i = 0; i < PRIZES.length; i++) {
      r -= PRIZES[i].weight;
      if (r < 0) return PRIZES[i].text;
    }
    return PRIZES[0].text;
  }

  // тратит один спин и сразу решает исход. null - если спинов нет
  function spin(machine) {
    var s = state();
    if (s.free > 0) s.free--;
    else if (s.paid > 0) s.paid--;
    else return null;
    s.spinsToday++;

    var result = { win: false, prize: null };
    var sp = s.special;
    var dayIndex = s.day - s.start;
    if (!sp.given && dayIndex < SPECIAL_DAYS &&
        (dayIndex > sp.day || (dayIndex === sp.day && s.spinsToday >= sp.spin))) {
      sp.given = true;
      result = { win: true, prize: SPECIAL };
    } else if (Math.random() < WIN_CHANCE) {
      result = { win: true, prize: pickPrize() };
    }

    if (result.win) s.prizes.unshift({ text: result.prize, t: Date.now(), machine: machine || "" });
    write(s);
    return result;
  }

  function addPaid(n) { var s = state(); s.paid += n; write(s); }

  // ----- форматирование -----
  function pad(n) { return n < 10 ? "0" + n : "" + n; }

  function timeLeft() {
    var sec = Math.max(0, Math.floor((nextReset() - Date.now()) / 1000));
    return pad(Math.floor(sec / 3600)) + ":" + pad(Math.floor(sec % 3600 / 60)) + ":" + pad(sec % 60);
  }

  function shortDate(t) {
    var d = new Date(t + MSK);
    return pad(d.getUTCDate()) + "." + pad(d.getUTCMonth() + 1);
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  // ----- окошки -----
  var openModal = null;

  function modal(opts) {
    if (openModal) openModal.close();
    var back = el("div", "c-modal");
    var card = el("div", "c-modal-card" + (opts.win ? " is-win" : ""));
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-modal", "true");
    var h = el("h2", "c-modal-title", opts.title);
    h.id = "c-modal-title";
    card.setAttribute("aria-labelledby", h.id);
    card.appendChild(h);
    (opts.body || []).forEach(function (node) { card.appendChild(node); });

    var row = el("div", "c-modal-buttons");
    var first = null;
    (opts.buttons || [{ label: "ok" }]).forEach(function (b) {
      var btn = el("button", "c-btn" + (b.primary ? " is-primary" : ""), b.label);
      btn.type = "button";
      btn.addEventListener("click", function () {
        if (b.onClick && b.onClick() === false) return;   // false - не закрывать
        close();
      });
      row.appendChild(btn);
      if (!first) first = btn;
    });
    card.appendChild(row);
    back.appendChild(card);
    document.body.appendChild(back);

    var timers = opts.timers || [];
    function close() {
      timers.forEach(clearInterval);
      back.remove();
      document.removeEventListener("keydown", onKey);
      if (openModal === api) openModal = null;
      if (opts.onClose) opts.onClose();
    }
    function onKey(e) { if (e.key === "Escape") close(); }
    back.addEventListener("click", function (e) { if (e.target === back) close(); });
    document.addEventListener("keydown", onKey);

    var api = { close: close, card: card };
    openModal = api;
    (opts.focus || first).focus();
    return api;
  }

  function outOfSpins() {
    var timer = el("p", "c-modal-note");
    function tick() { timer.textContent = "free spins refill in " + timeLeft(); }
    tick();
    modal({
      title: "out of spins 🫠",
      body: [
        el("p", "c-modal-text", "the casino doesn't give credit, baby 😤 come back after midnight for free spins or pay natusik in kisses 😚"),
        timer
      ],
      timers: [setInterval(tick, 1000)],
      buttons: [
        { label: "i paid", primary: true, onClick: function () { setTimeout(pay, 0); } },
        { label: "ok" }
      ]
    });
  }

  function pay() {
    var label = el("label", "c-modal-text", "how many kisses did you give natusik?");
    label.htmlFor = "c-kisses";
    var input = el("input", "c-input");
    input.id = "c-kisses";
    input.type = "number";
    input.min = "1";
    input.max = "999";
    input.step = "1";
    input.value = "1";
    input.inputMode = "numeric";
    var error = el("p", "c-modal-error");
    var rate = el("p", "c-modal-note", "1 kiss = 1 spin");

    function submit() {
      var n = Number(input.value);
      if (!Number.isInteger(n) || n < 1 || n > 999) {
        error.textContent = "enter a whole number from 1 to 999";
        input.focus();
        return false;
      }
      addPaid(n);
      setTimeout(function () { toast("+" + n + (n === 1 ? " spin" : " spins") + " added 😚"); }, 0);
    }

    var m = modal({
      title: "i paid",
      body: [label, input, error, rate],
      focus: input,
      buttons: [
        { label: "add spins", primary: true, onClick: submit },
        { label: "cancel" }
      ]
    });
    input.select();
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && submit() !== false) m.close();
    });
  }

  function result(res) {
    if (res.win) {
      modal({
        title: "you won!",
        win: true,
        body: [
          el("p", "c-modal-prize", res.prize),
          el("p", "c-modal-note", "take a screenshot and show it to natusik to get your prize 📸 it's also saved in your prizes on the casino page")
        ],
        buttons: [{ label: "yay", primary: true }]
      });
    } else {
      var left = total();
      modal({
        title: "maybe next time....",
        body: [el("p", "c-modal-note", left ? "spins left: " + left : "that was your last spin for now")],
        buttons: [{ label: "ok", primary: true }]
      });
    }
  }

  // проверка перед игрой: false и забавная надпись, если спинов нет
  function guard() {
    if (total() > 0) return true;
    outOfSpins();
    return false;
  }

  function toast(text) {
    var t = el("div", "c-toast", text);
    t.setAttribute("role", "status");
    document.body.appendChild(t);
    setTimeout(function () { t.classList.add("is-out"); }, 1800);
    setTimeout(function () { t.remove(); }, 2300);
  }

  // ----- панель со спинами -----
  function panel(root) {
    root.classList.add("spins");
    root.innerHTML =
      '<div class="spins-box">' +
        '<h2 class="spins-title">free spins</h2>' +
        '<p class="spins-num"><span data-free>3</span> <small>of ' + FREE_PER_DAY + '</small></p>' +
        '<p class="spins-note" data-free-note></p>' +
      '</div>' +
      '<div class="spins-box">' +
        '<h2 class="spins-title">paid spins</h2>' +
        '<p class="spins-num"><span data-paid>0</span></p>' +
        '<div class="spins-pay-row">' +
          '<button class="c-btn is-primary" type="button" data-pay>i paid</button>' +
          '<p class="spins-note">1 spin = 1 kiss 😚</p>' +
        '</div>' +
      '</div>';

    var free = root.querySelector("[data-free]");
    var freeNote = root.querySelector("[data-free-note]");
    var paid = root.querySelector("[data-paid]");
    root.querySelector("[data-pay]").addEventListener("click", pay);

    var lastPaid = null;
    function update() {
      var s = state();
      free.textContent = s.free;
      if (lastPaid !== null && s.paid > lastPaid) {
        paid.classList.remove("is-bump"); void paid.offsetWidth; paid.classList.add("is-bump");
      }
      paid.textContent = s.paid;
      lastPaid = s.paid;
      freeNote.textContent = s.free === 0
        ? "new free spins in " + timeLeft()
        : "refill at 00:00 moscow time";
    }
    update();
    onChange(update);
    setInterval(update, 1000);     // обратный отсчёт и смена дня
  }

  // ----- список выигранных призов -----
  function prizesList(root) {
    function update() {
      var list = state().prizes;
      root.hidden = list.length === 0;
      var ul = root.querySelector("ul");
      ul.innerHTML = "";
      list.forEach(function (p) {
        var li = el("li");
        li.appendChild(el("time", null, shortDate(p.t)));
        li.appendChild(el("span", null, p.text));
        ul.appendChild(li);
      });
    }
    update();
    onChange(update);
  }

  // картинки-мемы шевелятся по нажатию
  function wiggle() {
    document.querySelectorAll(".cd-pic").forEach(function (pic) {
      pic.addEventListener("click", function () {
        pic.classList.remove("is-moving");
        void pic.offsetWidth;
        pic.classList.add("is-moving");
      });
      pic.addEventListener("animationend", function () { pic.classList.remove("is-moving"); });
    });
  }

  return {
    state: state, total: total, spin: spin, guard: guard, onChange: onChange,
    result: result, outOfSpins: outOfSpins, pay: pay,
    panel: panel, prizesList: prizesList, wiggle: wiggle
  };
})();
