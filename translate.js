/* APEX site — Russian → English layer.
   Injected by serve_en.py into every page served from localhost. */
(function () {
  var DICT = /*__DICT__*/;

  var HIDE = {};
  (DICT["__hide__"] || []).forEach(function (k) { HIDE[k.toLowerCase()] = 1; });
  delete DICT["__hide__"];

  /* phrases that make a whole notice irrelevant outside Russia; matched as a
     substring, but never on the legal pages, whose whole text is built on them */
  var HIDE_CONTAINS = (DICT["__hide_contains__"] || []).map(function (k) {
    return k.toLowerCase();
  });
  delete DICT["__hide_contains__"];
  var LEGAL_PAGES = ["/policy", "/agree", "/cookie", "/operationwarranty", "/details"];

  function isLegalPage() {
    var p = (location.pathname || "").replace(/\/+$/, "");
    return LEGAL_PAGES.indexOf(p) !== -1;
  }

  function hitsContains(t) {
    if (!HIDE_CONTAINS.length || isLegalPage()) return false;
    if (t.length > 600) return false;
    var low = t.toLowerCase();
    for (var i = 0; i < HIDE_CONTAINS.length; i++) {
      if (low.indexOf(HIDE_CONTAINS[i]) !== -1) return true;
    }
    return false;
  }

  var EXACT_ONLY = {};
  (DICT["__exact_only__"] || []).forEach(function (k) { EXACT_ONLY[k] = 1; });
  delete DICT["__exact_only__"];

  var ATTRS = ["placeholder", "alt", "title", "aria-label", "value"];
  var SKIP = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, CODE: 1, PRE: 1 };
  var CYR = /[А-Яа-яЁё]/;

  function norm(s) {
    return s.replace(/ /g, " ").replace(/\s+/g, " ").trim();
  }

  /* one big regex for phrases that appear inside longer text nodes */
  function escapeRe(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  var keys = Object.keys(DICT).sort(function (a, b) { return b.length - a.length; });

  /* case-insensitive index: many labels are uppercased by CSS */
  var LOWER = {};
  keys.forEach(function (k) {
    var lk = k.toLowerCase();
    if (LOWER[lk] === undefined) LOWER[lk] = DICT[k];
  });

  function matchCase(src, out) {
    var letters = src.replace(/[^A-Za-zА-Яа-яЁё]/g, "");
    if (letters && letters === letters.toUpperCase()) return out.toUpperCase();
    return out;
  }

  function lookup(s) {
    if (DICT[s] !== undefined) return DICT[s];
    var hit = LOWER[s.toLowerCase()];
    return hit === undefined ? undefined : matchCase(s, hit);
  }
  var partial = null;
  var LETTER = "[А-Яа-яЁёA-Za-z0-9]";
  try {
    partial = new RegExp(
      "(?<!" + LETTER + ")(?:" +
      keys.filter(function (k) { return k.length > 3 && !EXACT_ONLY[k]; })
          .map(escapeRe).join("|") +
      ")(?!" + LETTER + ")", "gi");
  } catch (e) {
    try {
      partial = new RegExp(keys.filter(function (k) { return k.length > 12 && !EXACT_ONLY[k]; })
        .map(escapeRe).join("|"), "gi");
    } catch (e2) { partial = null; }
  }

  function translate(value) {
    var trimmed = norm(value);
    if (!trimmed || !CYR.test(trimmed)) return null;

    var direct = lookup(trimmed);
    if (direct !== undefined) {
      var lead = value.match(/^\s*/)[0];
      var tail = value.match(/\s*$/)[0];
      return lead + direct + tail;
    }
    if (partial) {
      var out = value.replace(partial, function (m) {
        var hit = lookup(norm(m));
        return hit === undefined ? m : hit;
      });
      if (out !== value) return out;
    }
    return null;
  }

  /* Sentences that are broken up by <b>/<span> children never match as single
     text nodes — translate them at element level first. */
  var INLINE = { B: 1, STRONG: 1, I: 1, EM: 1, SPAN: 1, BR: 1, SMALL: 1, U: 1, MARK: 1 };

  /* textContent ignores <br>, which would glue words together */
  function elText(el) {
    var out = "";
    for (var i = 0; i < el.childNodes.length; i++) {
      var n = el.childNodes[i];
      if (n.nodeType === 3) out += n.nodeValue;
      else if (n.nodeType === 1) out += (n.tagName === "BR" ? " " : elText(n));
    }
    return out;
  }

  function elementPass(root) {
    if (!root || !root.querySelectorAll) return;
    var pool = [];
    if (root.nodeType === 1) pool.push(root);
    pool = pool.concat(Array.prototype.slice.call(
      root.querySelectorAll("p, li, div, h1, h2, h3, h4, h5, span, td, th, figcaption")));

    pool.forEach(function (el) {
      if (!el.children || el.children.length === 0) return;
      if (el.querySelector("a, button, input, textarea, select, img, svg, script, style")) return;
      var kids = el.querySelectorAll("*");
      for (var i = 0; i < kids.length; i++) {
        if (!INLINE[kids[i].tagName]) return;      /* any depth of inline wrappers is fine */
      }
      var text = norm(elText(el));
      if (text.length < 8 || !CYR.test(text)) return;
      var hit = lookup(text);
      if (hit === undefined) return;
      el.textContent = hit;
    });
  }

  /* contacts that should not appear on the English site at all.
     In Tilda zero-blocks the items are absolutely positioned, so simply hiding
     one leaves a hole — the items below it are pulled up by the same gap. */
  var hiddenEls = [];
  var shifted = [];

  function resetHidden() {
    hiddenEls.forEach(function (el) { el.style.display = ""; });
    hiddenEls = [];
    shifted.forEach(function (rec) { rec.el.style.top = rec.top; });
    shifted = [];
  }

  function collectTargets() {
    var found = [];
    var pool = Array.prototype.slice.call(
      document.querySelectorAll("a, li, button, div, span, p, h1, h2, h3, h4, td"));
    pool.forEach(function (el) {
      var t = norm(elText(el));
      if (!t) return;
      var byPhrase = hitsContains(t);
      if (!HIDE[t.toLowerCase()] && !byPhrase) return;
      var STOP = { BODY: 1, HTML: 1, MAIN: 1, HEADER: 1, FOOTER: 1 };
      if (STOP[el.tagName]) return;
      var target = el;
      for (var i = 0; i < 3; i++) {
        var p = target.parentElement;
        if (!p || STOP[p.tagName]) break;
        var pt = norm(elText(p));
        if (pt !== t && !(byPhrase && pt.length < t.length + 80)) break;
        target = p;
      }
      if (STOP[target.tagName]) return;
      if (found.indexOf(target) === -1 && !found.some(function (f) { return f.contains(target); })) {
        found.push(target);
      }
    });
    return found;
  }

  function hideAndReflow() {
    resetHidden();
    collectTargets().forEach(function (el) {
      var style = window.getComputedStyle(el);
      var rect = el.getBoundingClientRect();
      var below = [];

      if (style.position === "absolute" || style.position === "fixed") {
        var sibs = el.parentElement ? el.parentElement.children : [];
        for (var i = 0; i < sibs.length; i++) {
          var s = sibs[i];
          if (s === el) continue;
          var cs = window.getComputedStyle(s);
          if (cs.position !== "absolute" && cs.position !== "fixed") continue;
          var r = s.getBoundingClientRect();
          if (Math.abs(r.left - rect.left) > 6) continue;      /* same column only */
          if (r.top <= rect.top + 1) continue;                  /* only items below */
          below.push({ el: s, rect: r });
        }
        below.sort(function (a, b) { return a.rect.top - b.rect.top; });
      }

      el.style.display = "none";
      hiddenEls.push(el);

      /* a hidden block inside a normal flow leaves no gap, but Tilda often
         wraps such notices in a fixed-height record — collapse that too */
      var wrap = el.parentElement;
      for (var w = 0; w < 2 && wrap; w++) {
        if (norm(elText(wrap)) !== "" || wrap.querySelector("img, svg, input, a")) break;
        wrap.style.display = "none";
        hiddenEls.push(wrap);
        wrap = wrap.parentElement;
      }

      if (!below.length) return;
      var delta = below[0].rect.top - rect.top;
      if (!(delta > 0) || delta > 400) return;
      below.forEach(function (item) {
        var cur = parseFloat(window.getComputedStyle(item.el).top);
        if (isNaN(cur)) return;
        shifted.push({ el: item.el, top: item.el.style.top });
        item.el.style.top = (cur - delta) + "px";
      });
    });
  }

  function walk(root) {
    if (!root) return;
    elementPass(root);

    if (root.nodeType === 3) {
      var t = translate(root.nodeValue);
      if (t !== null) root.nodeValue = t;
      return;
    }
    if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;

    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        return n.parentElement && SKIP[n.parentElement.tagName]
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_ACCEPT;
      }
    });
    var node, batch = [];
    while ((node = walker.nextNode())) batch.push(node);
    batch.forEach(function (n) {
      var t = translate(n.nodeValue);
      if (t !== null) n.nodeValue = t;
    });

    var els = root.nodeType === 1 ? [root] : [];
    if (root.querySelectorAll) {
      els = els.concat(Array.prototype.slice.call(root.querySelectorAll("*")));
    }
    els.forEach(function (el) {
      ATTRS.forEach(function (a) {
        if (!el.getAttribute) return;
        var v = el.getAttribute(a);
        if (!v) return;
        if (a === "value" && !/^(button|submit|reset)$/i.test(el.type || "")) return;
        var t = translate(v);
        if (t !== null) el.setAttribute(a, t);
      });
    });
  }

  function run() {
    walk(document.body);
    hideAndReflow();
    var dt = translate(document.title);
    if (dt !== null) document.title = dt;
    document.documentElement.setAttribute("lang", "en");
  }

  function start() {
    run();
    var pending = [];
    var timer = null;
    var observer = new MutationObserver(function (records) {
      records.forEach(function (r) {
        if (r.type === "characterData") pending.push(r.target);
        else Array.prototype.forEach.call(r.addedNodes, function (n) { pending.push(n); });
      });
      if (timer) return;
      timer = setTimeout(function () {
        timer = null;
        var nodes = pending.splice(0, pending.length);
        observer.disconnect();
        nodes.forEach(walk);
        var dt = translate(document.title);
        if (dt !== null) document.title = dt;
        observe();
      }, 60);
    });
    function observe() {
      observer.observe(document.documentElement, {
        childList: true, subtree: true, characterData: true
      });
    }
    observe();
    /* client-side routing / late hydration safety net */
    setTimeout(run, 400);
    setTimeout(run, 1500);
    var rt = null;
    window.addEventListener("resize", function () {
      clearTimeout(rt);
      rt = setTimeout(hideAndReflow, 250);
    });
    window.addEventListener("popstate", function () { setTimeout(run, 300); });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
