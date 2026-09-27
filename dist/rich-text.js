/*** @lekoala/rich-text v0.0.1 - https://github.com/lekoala/rich-text ***/
(() => {
  // src/helpers.js
  var TOOLBAR_SEPARATOR = "|";
  var DEFAULT_TOOLBAR = [
    "bold",
    "italic",
    TOOLBAR_SEPARATOR,
    "bullet-list",
    "ordered-list",
    TOOLBAR_SEPARATOR,
    "link",
    "blockquote",
    TOOLBAR_SEPARATOR,
    "undo",
    "redo"
  ];
  var TOOLBAR_COMMANDS = new Set(DEFAULT_TOOLBAR.filter((entry) => entry !== TOOLBAR_SEPARATOR));
  function normalizeToolbar(value) {
    if (value == null)
      return [...DEFAULT_TOOLBAR];
    const entries = Array.isArray(value) ? value : String(value).replaceAll("|", " | ").split(/[\s,]+/);
    if (entries.length === 1 && entries[0] === "none")
      return [];
    const result = [];
    for (const entry of entries) {
      if (entry === TOOLBAR_SEPARATOR) {
        if (result.length && result.at(-1) !== TOOLBAR_SEPARATOR)
          result.push(entry);
        continue;
      }
      if (!entry || !TOOLBAR_COMMANDS.has(entry) || result.includes(entry))
        continue;
      result.push(entry);
    }
    if (result.at(-1) === TOOLBAR_SEPARATOR)
      result.pop();
    return result;
  }
  function toolbarGroups(toolbar) {
    const groups = [[]];
    for (const entry of toolbar) {
      if (entry === TOOLBAR_SEPARATOR)
        groups.push([]);
      else
        groups.at(-1)?.push(entry);
    }
    return groups.filter((group) => group.length);
  }
  function matchSuggestionText(textBeforeCaret, triggers) {
    let best = null;
    for (const trigger of triggers) {
      if (!trigger)
        continue;
      const start = textBeforeCaret.lastIndexOf(trigger);
      if (start < 0)
        continue;
      const before = start === 0 ? "" : textBeforeCaret[start - 1];
      if (before && !/[\s([{]/.test(before))
        continue;
      const query = textBeforeCaret.slice(start + trigger.length);
      if (/\s/.test(query))
        continue;
      if (!best || start > best.start || start === best.start && trigger.length > best.trigger.length) {
        best = { trigger, query, start, end: textBeforeCaret.length };
      }
    }
    return best;
  }
  function isSafeHref(href) {
    const value = String(href ?? "").trim();
    if (!value)
      return false;
    if (value.startsWith("#") || value.startsWith("/") || value.startsWith("./") || value.startsWith("../")) {
      return true;
    }
    try {
      const url = new URL(value, "https://example.invalid/");
      return ["http:", "https:", "mailto:", "tel:"].includes(url.protocol);
    } catch {
      return false;
    }
  }
  function isEditorEmpty(root) {
    if (root.querySelector("[data-rt-mention], img"))
      return false;
    return !(root.textContent ?? "").replace(/[\s\u00a0\u200b]+/g, "").length;
  }
  function mentionFromElement(element) {
    if (!(element instanceof HTMLElement) || !element.hasAttribute("data-rt-mention"))
      return null;
    const type = element.getAttribute("data-rt-mention") || "mention";
    const id = element.getAttribute("data-id") || "";
    return { type, id, label: element.textContent ?? "" };
  }

  // node_modules/@lekoala/floating/src/floating.js
  function crossAxisFor(side) {
    return side === "top" || side === "bottom" ? "x" : "y";
  }
  function parsePlacement(placement) {
    const [side, align = null] = placement.split("-");
    return { side, align, crossAxis: crossAxisFor(side) };
  }
  function flipSide(side) {
    return { top: "bottom", bottom: "top", left: "right", right: "left" }[side] || side;
  }
  function computeCoords(reference, floating, side, align, rtl, distance) {
    const crossAxis = crossAxisFor(side);
    const commonX = reference.x + reference.width / 2 - floating.width / 2;
    const commonY = reference.y + reference.height / 2 - floating.height / 2;
    const commonAlign = reference[crossAxis === "x" ? "width" : "height"] / 2 - floating[crossAxis === "x" ? "width" : "height"] / 2;
    let coords;
    switch (side) {
      case "top":
        coords = { x: commonX, y: reference.y - floating.height - distance };
        break;
      case "bottom":
        coords = { x: commonX, y: reference.y + reference.height + distance };
        break;
      case "right":
        coords = { x: reference.x + reference.width + distance, y: commonY };
        break;
      case "left":
        coords = { x: reference.x - floating.width - distance, y: commonY };
        break;
      default:
        coords = { x: reference.x, y: reference.y };
    }
    if (align === "start" || align === "end") {
      const direction = (rtl && crossAxis === "x" ? -1 : 1) * (align === "end" ? 1 : -1);
      coords[crossAxis] += commonAlign * direction;
    }
    return coords;
  }
  function overflowOn(position, size, start, end) {
    return Math.max(start - position, 0) + Math.max(position + size - end, 0);
  }
  function isRTL(element) {
    const direction = "dir" in element ? element.dir : "";
    if (direction === "rtl")
      return true;
    if (direction === "ltr")
      return false;
    const win = element.ownerDocument?.defaultView;
    if (win?.CSS?.supports?.("selector(:dir(rtl))") && typeof element.matches === "function") {
      return element.matches(":dir(rtl)");
    }
    return Boolean(win?.Element && element instanceof win.Element && win.getComputedStyle(element).direction === "rtl");
  }
  var STABLE_SCROLLBAR_MAX_WIDTH = 25;
  function getViewportBoundary(doc) {
    const win = doc.defaultView;
    if (!win)
      return null;
    const docEl = doc.documentElement;
    const visualViewport = win.visualViewport;
    const x = visualViewport?.offsetLeft || 0;
    const y = visualViewport?.offsetTop || 0;
    let width = visualViewport?.width || docEl.clientWidth || win.innerWidth;
    const height = visualViewport?.height || docEl.clientHeight || win.innerHeight;
    const reserved = doc.compatMode === "BackCompat" ? width - docEl.clientWidth : docEl.clientWidth - docEl.getBoundingClientRect().width;
    if (reserved > 0 && reserved <= STABLE_SCROLLBAR_MAX_WIDTH) {
      const gutter = win.getComputedStyle?.(docEl).scrollbarGutter;
      if (gutter && gutter !== "auto")
        width -= reserved;
    }
    return { x, y, width, height, right: x + width, bottom: y + height };
  }
  function getBoundary(reference, options) {
    return options.scope ? options.scope.getBoundingClientRect() : getViewportBoundary(reference.ownerDocument);
  }
  function clampToBoundary(position, size, start, end, padding) {
    const paddedMin = start + padding;
    const paddedMax = end - size - padding;
    const fitsPadded = paddedMax >= paddedMin;
    const min = fitsPadded ? paddedMin : start;
    const max = fitsPadded ? paddedMax : end - size;
    return Math.max(min, Math.min(position, max));
  }
  function arrowPercent(referenceCenter, boxStart, size) {
    if (!size)
      return 50;
    const percent = (referenceCenter - boxStart) / size * 100;
    return Math.round(Math.min(100, Math.max(0, percent)) * 1000) / 1000;
  }
  function isOutsideBoundary(rect, boundary) {
    return rect.right < boundary.x || rect.left > boundary.right || rect.bottom < boundary.y || rect.top > boundary.bottom;
  }
  function getAvailableHeight(referenceRect, side, boundary, distance, padding) {
    if (side === "top") {
      return Math.max(0, referenceRect.top - boundary.y - distance - padding);
    }
    if (side === "bottom") {
      return Math.max(0, boundary.bottom - referenceRect.bottom - distance - padding);
    }
    return Math.max(0, boundary.height - padding * 2);
  }
  function isVisible(element) {
    if (element.hidden)
      return false;
    if (typeof element.checkVisibility === "function")
      return element.checkVisibility();
    return element.getClientRects().length > 0;
  }
  function getFloatingSize(floating) {
    const width = floating.offsetWidth;
    const height = floating.offsetHeight;
    if (width && height)
      return { width, height };
    const rect = floating.getBoundingClientRect();
    return { width: width || rect.width, height: height || rect.height };
  }
  var trackers = new WeakMap;
  var TYPE_PRIORITY = { scroll: 0, resize: 1, "element-resize": 2 };
  function createTracker(doc) {
    const win = doc.defaultView;
    if (!win)
      throw new TypeError("floating must belong to a document with a browsing context");
    const subscriptions = new Set;
    const pending = new Map;
    const ResizeObserverCtor = win.ResizeObserver;
    let tick = false;
    let listening = false;
    const visualViewport = win.visualViewport;
    function queue(subscription, type) {
      const current = pending.get(subscription);
      if (current === undefined || TYPE_PRIORITY[type] > TYPE_PRIORITY[current]) {
        pending.set(subscription, type);
      }
    }
    function scheduleFlush() {
      if (tick)
        return;
      tick = true;
      win.requestAnimationFrame(() => {
        const notifications = [...pending];
        pending.clear();
        tick = false;
        for (const [subscription, type] of notifications) {
          if (!subscriptions.has(subscription) || !subscription.floating.isConnected)
            continue;
          subscription.callback({ type });
        }
      });
    }
    function notifyAll(type) {
      for (const subscription of subscriptions)
        queue(subscription, type);
      scheduleFlush();
    }
    function observeSizes(subscription) {
      if (!ResizeObserverCtor)
        return null;
      const primed = new Set;
      const observer = new ResizeObserverCtor((entries) => {
        let changed = false;
        for (const entry of entries) {
          if (primed.has(entry.target))
            changed = true;
          else
            primed.add(entry.target);
        }
        if (!changed)
          return;
        queue(subscription, "element-resize");
        scheduleFlush();
      });
      const { reference, floating } = subscription;
      if (reference)
        observer.observe(reference);
      if (floating !== reference)
        observer.observe(floating);
      return observer;
    }
    const onScroll = () => notifyAll("scroll");
    const onResize = () => notifyAll("resize");
    function startListening() {
      if (listening)
        return;
      doc.addEventListener("scroll", onScroll, { passive: true, capture: true });
      win.addEventListener("resize", onResize, { passive: true });
      visualViewport?.addEventListener("scroll", onScroll, { passive: true });
      visualViewport?.addEventListener("resize", onResize, { passive: true });
      listening = true;
    }
    function stopListening() {
      if (!listening)
        return;
      doc.removeEventListener("scroll", onScroll, { capture: true });
      win.removeEventListener("resize", onResize);
      visualViewport?.removeEventListener("scroll", onScroll);
      visualViewport?.removeEventListener("resize", onResize);
      listening = false;
    }
    return {
      add(reference, floating, callback) {
        const subscription = { reference, floating, callback };
        subscriptions.add(subscription);
        startListening();
        const observer = observeSizes(subscription);
        let stopped = false;
        return () => {
          if (stopped)
            return;
          stopped = true;
          subscriptions.delete(subscription);
          pending.delete(subscription);
          observer?.disconnect();
          if (subscriptions.size === 0)
            stopListening();
        };
      }
    };
  }
  function trackerFor(element) {
    const doc = element.ownerDocument;
    let tracker = trackers.get(doc);
    if (!tracker) {
      tracker = createTracker(doc);
      trackers.set(doc, tracker);
    }
    return tracker;
  }
  function autoUpdate(reference, floating, callback) {
    if (!floating?.ownerDocument) {
      throw new TypeError("autoUpdate() expects a floating HTMLElement");
    }
    if (reference && reference.ownerDocument !== floating.ownerDocument) {
      throw new TypeError("reference and floating must belong to the same document");
    }
    if (typeof callback !== "function")
      throw new TypeError("callback must be a function");
    return trackerFor(floating).add(reference, floating, callback);
  }
  function positionOnce(reference, floating, options) {
    if (!isVisible(floating))
      return null;
    const placement = options.placement || "bottom-start";
    const distance = options.distance || 0;
    const flip = options.flip !== false;
    const shift = options.shift !== false;
    const shiftPadding = options.shiftPadding ?? 4;
    let { side, align, crossAxis } = parsePlacement(placement);
    const rtl = align ? isRTL(reference) : false;
    const rects = reference.getClientRects();
    const referenceRect = side === "bottom" ? rects[rects.length - 1] : rects[0];
    if (!referenceRect)
      return null;
    const boundary = getBoundary(reference, options);
    if (!boundary || isOutsideBoundary(referenceRect, boundary))
      return null;
    const floatingRect = getFloatingSize(floating);
    const limits = {
      x: { size: floatingRect.width, start: boundary.x, end: boundary.right },
      y: { size: floatingRect.height, start: boundary.y, end: boundary.bottom }
    };
    const place = (nextSide, nextAlign) => computeCoords(referenceRect, floatingRect, nextSide, nextAlign, rtl, distance);
    const overflowAt = (position, axis) => {
      const { size, start, end } = limits[axis];
      return overflowOn(position, size, start + shiftPadding, end - shiftPadding);
    };
    const shiftedOverflowAt = (position, axis) => {
      const { size, start, end } = limits[axis];
      return overflowAt(shift ? clampToBoundary(position, size, start, end, shiftPadding) : position, axis);
    };
    let coords = place(side, align);
    if (flip) {
      const mainAxis = crossAxis === "x" ? "y" : "x";
      let overflow = overflowAt(coords[mainAxis], mainAxis);
      if (overflow > 0) {
        const opposite = flipSide(side);
        const flipped = place(opposite, align);
        const flippedOverflow = overflowAt(flipped[mainAxis], mainAxis);
        if (flippedOverflow < overflow) {
          side = opposite;
          coords = flipped;
          overflow = flippedOverflow;
        }
      }
      if (mainAxis === "x" && overflow > 0) {
        const above = place("top", align);
        const below = place("bottom", align);
        const useBottom = overflowAt(below.y, "y") < overflowAt(above.y, "y");
        const candidate = useBottom ? below : above;
        const swapped = overflowAt(candidate.y, "y") + shiftedOverflowAt(candidate.x, "x");
        if (swapped < overflow + shiftedOverflowAt(coords.y, "y")) {
          side = useBottom ? "bottom" : "top";
          crossAxis = "x";
          coords = candidate;
        }
      }
    }
    if (crossAxis === "x" && shift && align) {
      const overflow = overflowAt(coords.x, "x");
      if (overflow > 0) {
        const nextAlign = align === "end" ? "start" : "end";
        const candidate = place(side, nextAlign);
        if (overflowAt(candidate.x, "x") < overflow) {
          align = nextAlign;
          coords = candidate;
        }
      }
    }
    if (shift) {
      const { size, start, end } = limits[crossAxis];
      coords[crossAxis] = clampToBoundary(coords[crossAxis], size, start, end, shiftPadding);
    }
    const arrowX = arrowPercent(referenceRect.x + referenceRect.width / 2, coords.x, floatingRect.width);
    const arrowY = arrowPercent(referenceRect.y + referenceRect.height / 2, coords.y, floatingRect.height);
    const availableHeight = `${getAvailableHeight(referenceRect, side, boundary, distance, shiftPadding)}px`;
    const { style } = floating;
    const roomChanged = style.getPropertyValue("--available-height") !== availableHeight;
    const win = options.coordinateSpace === "document" ? reference.ownerDocument.defaultView : null;
    const originX = win ? win.scrollX : 0;
    const originY = win ? win.scrollY : 0;
    style.left = `${coords.x + originX}px`;
    style.top = `${coords.y + originY}px`;
    style.setProperty("--arrow-x", `${arrowX}%`);
    style.setProperty("--arrow-y", `${arrowY}%`);
    style.setProperty("--available-height", availableHeight);
    const resolved = align ? `${side}-${align}` : side;
    floating.dataset.placement = resolved;
    return {
      width: floatingRect.width,
      height: floatingRect.height,
      roomChanged,
      placement: resolved
    };
  }
  function reposition(reference, floating, options = {}) {
    const measured = positionOnce(reference, floating, options);
    if (!measured)
      return false;
    if (measured.roomChanged) {
      const settled = getFloatingSize(floating);
      if (settled.width !== measured.width || settled.height !== measured.height) {
        positionOnce(reference, floating, {
          ...options,
          placement: measured.placement,
          flip: false
        });
      }
    }
    return true;
  }
  function repositionAt(x, y, floating, options = {}) {
    const doc = floating.ownerDocument;
    const docEl = doc.documentElement;
    const win = doc.defaultView;
    if (!win)
      return false;
    const direction = doc.dir || docEl?.dir || win.getComputedStyle?.(docEl).direction || "";
    const point = new win.DOMRect(x, y, 0, 0);
    const reference = {
      ownerDocument: doc,
      dir: direction,
      matches: (selector) => selector === ":dir(rtl)" && direction === "rtl",
      getClientRects: () => [point]
    };
    return reposition(reference, floating, options);
  }

  // node_modules/squire-rte/dist/squire.mjs
  var ft = () => true;
  var T = class {
    constructor(t, e, n) {
      this.root = t, this.currentNode = t, this.nodeType = e, this.filter = n || ft;
    }
    isAcceptableNode(t) {
      let e = t.nodeType;
      return !!((e === Node.ELEMENT_NODE ? 1 : e === Node.TEXT_NODE ? 4 : 0) & this.nodeType) && this.filter(t);
    }
    nextNode() {
      let t = this.root, e = this.currentNode, n;
      for (;; ) {
        for (n = e.firstChild;!n && e && e !== t; )
          n = e.nextSibling, n || (e = e.parentNode);
        if (!n)
          return null;
        if (this.isAcceptableNode(n))
          return this.currentNode = n, n;
        e = n;
      }
    }
    previousNode() {
      let t = this.root, e = this.currentNode, n;
      for (;; ) {
        if (e === t)
          return null;
        if (n = e.previousSibling, n)
          for (;e = n.lastChild; )
            n = e;
        else
          n = e.parentNode;
        if (!n)
          return null;
        if (this.isAcceptableNode(n))
          return this.currentNode = n, n;
        e = n;
      }
    }
    previousPONode() {
      let t = this.root, e = this.currentNode, n;
      for (;; ) {
        for (n = e.lastChild;!n && e && e !== t; )
          n = e.previousSibling, n || (e = e.parentNode);
        if (!n)
          return null;
        if (this.isAcceptableNode(n))
          return this.currentNode = n, n;
        e = n;
      }
    }
  };
  var ee = navigator.userAgent;
  var fe = /Mac OS X/.test(ee);
  var ue = /Windows NT/.test(ee);
  var be = /iP(?:ad|hone|od)/.test(ee) || fe && !!navigator.maxTouchPoints;
  var Mt = /Android/.test(ee);
  var qe = /Gecko\//.test(ee);
  var re = /Edge\//.test(ee);
  var ut = !re && /WebKit\//.test(ee);
  var y = fe || be ? "Meta-" : "Ctrl-";
  var oe = ut;
  var Ue = "onbeforeinput" in document && "inputType" in new InputEvent("input");
  var B = /[^ \t\r\n\u200B]/;
  var gt = /^(?:#text|A(?:BBR|CRONYM)?|B(?:R|D[IO])?|C(?:ITE|ODE)|D(?:ATA|EL|FN)|EM|FONT|HR|I(?:FRAME|MG|NPUT|NS)?|KBD|Q|R(?:P|T|UBY)|S(?:AMP|MALL|PAN|TR(?:IKE|ONG)|U[BP])?|TIME|U|VAR|WBR)$/;
  var Nt = new Set(["BR", "HR", "IFRAME", "IMG", "INPUT"]);
  var St = 0;
  var Re = 1;
  var We = 2;
  var ze = 3;
  var he = new WeakMap;
  var me = () => {
    he = new WeakMap;
  };
  var H = (i) => Nt.has(i.nodeName);
  var ke = (i) => {
    switch (i.nodeType) {
      case 8:
      case 3:
        return Re;
      case 1:
      case 11:
        if (he.has(i))
          return he.get(i);
        break;
      default:
        return St;
    }
    let t;
    return Array.from(i.childNodes).every(g) ? gt.test(i.nodeName) ? t = Re : t = We : t = ze, he.set(i, t), t;
  };
  var g = (i) => ke(i) === Re;
  var q = (i) => ke(i) === We;
  var X = (i) => ke(i) === ze;
  var m = (i, t, e) => {
    let n = document.createElement(i);
    if (t instanceof Array && (e = t, t = null), t)
      for (let o in t) {
        let s = t[o];
        s !== undefined && n.setAttribute(o, s);
      }
    return e && e.forEach((o) => n.appendChild(o)), n;
  };
  var ye = (i, t) => H(i) || i.nodeType !== t.nodeType || i.nodeName !== t.nodeName ? false : i instanceof HTMLElement && t instanceof HTMLElement ? i.nodeName !== "A" && i.className === t.className && i.style.cssText === t.style.cssText : true;
  var pe = (i, t, e) => {
    if (i.nodeName !== t)
      return false;
    for (let n in e)
      if (!("getAttribute" in i) || i.getAttribute(n) !== e[n])
        return false;
    return true;
  };
  var N = (i, t, e, n) => {
    for (;i && i !== t; ) {
      if (pe(i, e, n))
        return i;
      i = i.parentNode;
    }
    return null;
  };
  var ge = (i, t) => {
    let e = i.childNodes;
    for (;t && i instanceof Element; )
      i = e[t - 1], e = i.childNodes, t = e.length;
    return i;
  };
  var Oe = (i, t) => {
    let e = i;
    if (e instanceof Element) {
      let n = e.childNodes;
      if (t < n.length)
        e = n[t];
      else {
        for (;e && !e.nextSibling; )
          e = e.parentNode;
        e && (e = e.nextSibling);
      }
    }
    return e;
  };
  var L = (i) => i instanceof Element || i instanceof DocumentFragment ? i.childNodes.length : i instanceof CharacterData ? i.length : 0;
  var _ = (i) => {
    let t = document.createDocumentFragment(), e = i.firstChild;
    for (;e; )
      t.appendChild(e), e = i.firstChild;
    return t;
  };
  var S = (i) => {
    let t = i.parentNode;
    return t && t.removeChild(i), i;
  };
  var k = (i, t) => {
    let e = i.parentNode;
    e && e.replaceChild(t, i);
  };
  var Et = (i) => i instanceof Element ? i.nodeName === "BR" : B.test(i.data);
  var te = (i, t) => {
    let e = i.parentNode;
    for (;g(e); )
      e = e.parentNode;
    let n = new T(e, 5, Et);
    return n.currentNode = i, !!n.nextNode() || t && !n.previousNode();
  };
  var le = (i, t) => {
    let e = new T(i, 4), n, o;
    for (;n = e.nextNode(); )
      for (;(o = n.data.indexOf("​")) > -1 && (!t || n.parentNode !== t); )
        if (n.length === 1) {
          let s = n, r = s.parentNode;
          for (;r && (r.removeChild(s), e.currentNode = r, !(!g(r) || L(r))); )
            s = r, r = s.parentNode;
          break;
        } else
          n.deleteData(o, 1);
  };
  var _t = 0;
  var Tt = 1;
  var Ct = 2;
  var vt = 3;
  var z = (i, t, e) => {
    let n = document.createRange();
    if (n.selectNode(t), e) {
      let o = i.compareBoundaryPoints(vt, n) > -1, s = i.compareBoundaryPoints(Tt, n) < 1;
      return !o && !s;
    } else {
      let o = i.compareBoundaryPoints(_t, n) < 1, s = i.compareBoundaryPoints(Ct, n) > -1;
      return o && s;
    }
  };
  var C = (i) => {
    let { startContainer: t, startOffset: e, endContainer: n, endOffset: o } = i;
    for (;!(t instanceof Text); ) {
      let s = t.childNodes[e];
      if (!s || H(s)) {
        if (e && (s = t.childNodes[e - 1], s instanceof Text)) {
          let r = s, l;
          for (;!r.length && (l = r.previousSibling) && l instanceof Text; )
            r.remove(), r = l;
          t = r, e = r.data.length;
        }
        break;
      }
      t = s, e = 0;
    }
    if (o)
      for (;!(n instanceof Text); ) {
        let s = n.childNodes[o - 1];
        if (!s || H(s)) {
          if (s && s.nodeName === "BR" && !te(s, false)) {
            o -= 1;
            continue;
          }
          break;
        }
        n = s, o = L(n);
      }
    else
      for (;!(n instanceof Text); ) {
        let s = n.firstChild;
        if (!s || H(s))
          break;
        n = s;
      }
    i.setStart(t, e), i.setEnd(n, o);
  };
  var K = (i, t, e, n) => {
    let { startContainer: o, startOffset: s, endContainer: r, endOffset: l } = i, a;
    for (t || (t = i.commonAncestorContainer), e || (e = t);!s && o !== t && o !== n; )
      a = o.parentNode, s = Array.from(a.childNodes).indexOf(o), o = a;
    for (;!(r === e || r === n || (r.nodeType !== 3 && r.childNodes[l] && r.childNodes[l].nodeName === "BR" && !te(r.childNodes[l], false) && (l += 1), l !== L(r))); )
      a = r.parentNode, l = Array.from(a.childNodes).indexOf(r) + 1, r = a;
    i.setStart(o, s), i.setEnd(r, l);
  };
  var Be = (i, t, e) => {
    let n = N(i.endContainer, e, t);
    if (n && (n = n.parentNode)) {
      let o = i.cloneRange();
      K(o, n, n, e), o.endContainer === n && (i.setStart(o.endContainer, o.endOffset), i.setEnd(o.endContainer, o.endOffset));
    }
    return i;
  };
  var x = (i) => {
    let t = null;
    if (i instanceof Text)
      return i;
    if (g(i)) {
      let e = i.firstChild;
      if (oe)
        for (;e && e instanceof Text && !e.data; )
          i.removeChild(e), e = i.firstChild;
      e || (oe ? t = document.createTextNode("​") : t = document.createTextNode(""));
    } else if ((i instanceof Element || i instanceof DocumentFragment) && !i.querySelector("BR") && !B.test(i.textContent || "")) {
      t = m("BR");
      let e = i, n;
      for (;(n = e.lastElementChild) && !g(n); )
        e = n;
      i = e, i instanceof HTMLElement && i.contentEditable === "true" && (i = m("DIV"), e.appendChild(i));
    }
    if (t)
      try {
        i.appendChild(t);
      } catch {}
    return i;
  };
  var D = (i, t) => {
    let e = null;
    return /^(?:TABLE|TBODY|TR|TH|TD|P)/.test(i.nodeName) || (Array.from(i.childNodes).forEach((n) => {
      let o = n.nodeName === "BR";
      !o && g(n) ? (e || (e = m("DIV")), e.appendChild(n)) : (o || e) && (e || (e = m("DIV")), x(e), o ? i.replaceChild(e, n) : i.insertBefore(e, n), e = null), X(n) && D(n, t);
    }), e && i.appendChild(x(e))), i;
  };
  var I = (i, t, e, n) => {
    if (!e.contains(i))
      throw new Error("split: stopNode does not contain node");
    if (i instanceof Text && i !== e) {
      if (typeof t != "number")
        throw new Error("Offset must be a number to split text node!");
      if (!i.parentNode)
        throw new Error("Cannot split text node with no parent!");
      return I(i.parentNode, i.splitText(t), e, n);
    }
    let o = typeof t == "number" ? t < i.childNodes.length ? i.childNodes[t] : null : t, s = i.parentNode;
    if (!s || i === e || !(i instanceof Element))
      return o;
    let r = i.cloneNode(false);
    for (;o; ) {
      let l = o.nextSibling;
      r.appendChild(o), o = l;
    }
    return i instanceof HTMLOListElement && N(i, n, "BLOCKQUOTE") && (r.start = (+i.start || 1) + i.childNodes.length - 1), x(i), x(r), s.insertBefore(r, i.nextSibling), I(s, r, e, n);
  };
  var Ke = (i, t) => {
    let e = i.childNodes, n = e.length, o = [];
    for (;n--; ) {
      let s = e[n], r = n ? e[n - 1] : null;
      if (r && g(s) && ye(s, r))
        t.startContainer === s && (t.startContainer = r, t.startOffset += L(r)), t.endContainer === s && (t.endContainer = r, t.endOffset += L(r)), t.startContainer === i && (t.startOffset > n ? t.startOffset -= 1 : t.startOffset === n && (t.startContainer = r, t.startOffset = L(r))), t.endContainer === i && (t.endOffset > n ? t.endOffset -= 1 : t.endOffset === n && (t.endContainer = r, t.endOffset = L(r))), S(s), s instanceof Text ? r.appendData(s.data) : o.push(_(s));
      else if (s instanceof Element) {
        let l;
        for (;l = o.pop(); )
          s.appendChild(l);
        Ke(s, t);
      }
    }
  };
  var ne = (i, t) => {
    let e = i instanceof Text ? i.parentNode : i;
    if (e instanceof Element) {
      let n = { startContainer: t.startContainer, startOffset: t.startOffset, endContainer: t.endContainer, endOffset: t.endOffset };
      Ke(e, n), t.setStart(n.startContainer, n.startOffset), t.setEnd(n.endContainer, n.endOffset);
    }
  };
  var V = (i, t, e, n) => {
    let o = t, s, r;
    for (;(s = o.parentNode) && s !== n && s instanceof Element && s.childNodes.length === 1; )
      o = s;
    S(o), r = i.childNodes.length;
    let l = i.lastChild;
    l && l.nodeName === "BR" && (i.removeChild(l), r -= 1), i.appendChild(_(t)), e.setStart(i, r), e.collapse(true), ne(i, e);
  };
  var P = (i, t) => {
    let { previousSibling: e, firstChild: n } = i, o = i.nodeName === "LI";
    if (!(o && (!n || !/^[OU]L$/.test(n.nodeName)))) {
      if (e && ye(e, i)) {
        if (!X(e))
          if (o) {
            let r = m("DIV");
            r.appendChild(_(e)), e.appendChild(r);
          } else
            return;
        S(i);
        let s = !X(i);
        e.appendChild(_(i)), s && D(e, t), n && P(n, t);
      } else if (o) {
        let s = m("DIV");
        i.insertBefore(s, n), x(s);
      }
    }
  };
  var $e = { "font-weight": { regexp: /^bold|^700/i, replace() {
    return m("B");
  } }, "font-style": { regexp: /^italic/i, replace() {
    return m("I");
  } }, "font-family": { regexp: B, replace(i, t) {
    let e = m("SPAN", { class: i.fontFamily });
    return e.style.fontFamily = t, e;
  } }, "font-size": { regexp: B, replace(i, t) {
    let e = m("SPAN", { class: i.fontSize });
    return e.style.fontSize = t, e;
  } }, "text-decoration": { regexp: /^underline/i, replace() {
    return m("U");
  } } };
  var xt = (i, t, e) => {
    let n = i.style, o, s;
    for (let r in $e) {
      let l = $e[r], a = n.getPropertyValue(r);
      if (a && l.regexp.test(a)) {
        let d = l.replace(e.classNames, a);
        if (d.nodeName === i.nodeName && d.className === i.className)
          continue;
        s || (s = d), o && o.appendChild(d), o = d, i.style.removeProperty(r);
      }
    }
    return s && o && (o.appendChild(_(i)), i.style.cssText ? i.appendChild(s) : k(i, s)), o || i;
  };
  var Ne = (i) => (t, e) => {
    let n = m(i), o = t.attributes;
    for (let s = 0, r = o.length;s < r; s += 1) {
      let l = o[s];
      n.setAttribute(l.name, l.value);
    }
    return e.replaceChild(n, t), n.appendChild(_(t)), n;
  };
  var bt = { 1: "10", 2: "13", 3: "16", 4: "18", 5: "24", 6: "32", 7: "48" };
  var Rt = { STRONG: Ne("B"), EM: Ne("I"), INS: Ne("U"), STRIKE: Ne("S"), SPAN: xt, FONT: (i, t, e) => {
    let n = i, { face: o, size: s, color: r } = n, l = e.classNames, a, d, c, f, u;
    return o && (a = m("SPAN", { class: l.fontFamily }), a.style.fontFamily = o, u = a, f = a), s && (d = m("SPAN", { class: l.fontSize }), d.style.fontSize = bt[s] + "px", u || (u = d), f && f.appendChild(d), f = d), r && /^#?([\dA-F]{3}){1,2}$/i.test(r) && (r.charAt(0) !== "#" && (r = "#" + r), c = m("SPAN", { class: l.color }), c.style.color = r, u || (u = c), f && f.appendChild(c), f = c), (!u || !f) && (u = f = m("SPAN")), t.replaceChild(u, n), f.appendChild(_(n)), f;
  }, TT: (i, t, e) => {
    let n = m("SPAN", { class: e.classNames.fontFamily, style: 'font-family:menlo,consolas,"courier new",monospace' });
    return t.replaceChild(n, i), n.appendChild(_(i)), n;
  } };
  var Lt = /^(?:A(?:DDRESS|RTICLE|SIDE|UDIO)|BLOCKQUOTE|CAPTION|D(?:[DLT]|IV)|F(?:IGURE|IGCAPTION|OOTER)|H[1-6]|HEADER|L(?:ABEL|EGEND|I)|O(?:L|UTPUT)|P(?:RE)?|SECTION|T(?:ABLE|BODY|D|FOOT|H|HEAD|R)|COL(?:GROUP)?|UL)$/;
  var kt = /^(?:HEAD|META|STYLE)/;
  var Se = (i, t, e) => {
    let n = i.childNodes, o = i;
    for (;g(o); )
      o = o.parentNode;
    let s = new T(o, 5);
    for (let r = 0, l = n.length;r < l; r += 1) {
      let a = n[r], d = a.nodeName, c = Rt[d];
      if (a instanceof HTMLElement) {
        let f = a.childNodes.length;
        if (c)
          a = c(a, i, t);
        else if (kt.test(d)) {
          i.removeChild(a), r -= 1, l -= 1;
          continue;
        } else if (!Lt.test(d) && !g(a)) {
          r -= 1, l += f - 1, i.replaceChild(_(a), a);
          continue;
        }
        f && Se(a, t, e || d === "PRE");
      } else {
        if (a instanceof Text) {
          let f = a.data, u = !B.test(f.charAt(0)), p = !B.test(f.charAt(f.length - 1));
          if (e || !u && !p)
            continue;
          if (u) {
            s.currentNode = a;
            let h;
            for (;(h = s.previousPONode()) && !(h.nodeName === "IMG" || h instanceof Text && B.test(h.data)); )
              if (!g(h)) {
                h = null;
                break;
              }
            f = f.replace(/^[ \t\r\n]+/g, h ? " " : "");
          }
          if (p) {
            s.currentNode = a;
            let h;
            for (;(h = s.nextNode()) && !(h.nodeName === "IMG" || h instanceof Text && B.test(h.data)); )
              if (!g(h)) {
                h = null;
                break;
              }
            f = f.replace(/[ \t\r\n]+$/g, h ? " " : "");
          }
          if (f) {
            a.data = f;
            continue;
          }
        }
        i.removeChild(a), r -= 1, l -= 1;
      }
    }
    return i;
  };
  var Ee = (i) => {
    let t = i.childNodes, e = t.length;
    for (;e--; ) {
      let n = t[e];
      n instanceof Element && !H(n) ? (Ee(n), g(n) && !n.firstChild && i.removeChild(n)) : n instanceof Text && !n.data && i.removeChild(n);
    }
  };
  var ae = (i, t, e) => {
    let n = i.querySelectorAll("BR"), o = [], s = n.length;
    for (let r = 0;r < s; r += 1)
      o[r] = te(n[r], e);
    for (;s--; ) {
      let r = n[s], l = r.parentNode;
      l && (o[s] ? g(l) || D(l, t) : S(r));
    }
  };
  var De = (i) => i.split("&").join("&amp;").split("<").join("&lt;").split(">").join("&gt;").split('"').join("&quot;");
  var ce = (i, t) => {
    let e = new T(t, 1, q);
    return e.currentNode = i, e;
  };
  var W = (i, t) => {
    let e = ce(i, t).previousNode();
    return e !== t ? e : null;
  };
  var M = (i, t) => {
    let e = ce(i, t).nextNode();
    return e !== t ? e : null;
  };
  var de = (i) => !i.textContent && !i.querySelector("IMG");
  var v = (i, t) => {
    let e = i.startContainer, n;
    if (g(e))
      n = W(e, t);
    else if (e !== t && e instanceof HTMLElement && q(e))
      n = e;
    else {
      let o = ge(e, i.startOffset);
      n = M(o, t);
    }
    return n && z(i, n, true) ? n : null;
  };
  var $ = (i, t) => {
    let e = i.endContainer, n;
    if (g(e))
      n = W(e, t);
    else if (e !== t && e instanceof HTMLElement && q(e))
      n = e;
    else {
      let o = Oe(e, i.endOffset);
      if (!o || !t.contains(o)) {
        o = t;
        let s;
        for (;s = o.lastChild; )
          o = s;
      }
      n = W(o, t);
    }
    return n && z(i, n, true) ? n : null;
  };
  var Ge = (i) => i instanceof Text ? B.test(i.data) : i.nodeName === "IMG";
  var j = (i, t) => {
    let { startContainer: e, startOffset: n } = i, o;
    if (e instanceof Text) {
      let l = e.data;
      for (let a = n;a > 0; a -= 1)
        if (l.charAt(a - 1) !== "​")
          return false;
      o = e;
    } else if (o = Oe(e, n), o && !t.contains(o) && (o = null), !o && (o = ge(e, n), o instanceof Text && o.length))
      return false;
    let s = v(i, t);
    if (!s)
      return false;
    let r = new T(s, 5, Ge);
    return r.currentNode = o, !r.previousNode();
  };
  var G = (i, t) => {
    let { endContainer: e, endOffset: n } = i, o;
    if (e instanceof Text) {
      let l = e.data, a = l.length;
      for (let d = n;d < a; d += 1)
        if (l.charAt(d) !== "​")
          return false;
      o = e;
    } else
      o = ge(e, n);
    let s = $(i, t);
    if (!s)
      return false;
    let r = new T(s, 5, Ge);
    return r.currentNode = o, !r.nextNode();
  };
  var Ae = (i, t) => {
    let e = v(i, t), n = $(i, t), o;
    e && n && (o = e.parentNode, i.setStart(o, Array.from(o.childNodes).indexOf(e)), o = n.parentNode, i.setEnd(o, Array.from(o.childNodes).indexOf(n) + 1));
  };
  function Q(i, t, e, n) {
    let o = document.createRange();
    return o.setStart(i, t), e && typeof n == "number" ? o.setEnd(e, n) : o.setEnd(i, t), o;
  }
  var Z = (i, t) => {
    let { startContainer: e, startOffset: n, endContainer: o, endOffset: s } = i, r;
    if (e instanceof Text) {
      let a = e.parentNode;
      if (r = a.childNodes, n === e.length)
        n = Array.from(r).indexOf(e) + 1, i.collapsed && (o = a, s = n);
      else {
        if (n) {
          let d = e.splitText(n);
          o === e ? (s -= n, o = d) : o === a && (s += 1), e = d;
        }
        n = Array.from(r).indexOf(e);
      }
      e = a;
    } else
      r = e.childNodes;
    let l = r.length;
    n === l ? e.appendChild(t) : e.insertBefore(t, r[n]), e === o && (s += r.length - l), i.setStart(e, n), i.setEnd(o, s);
  };
  var we = (i, t, e) => {
    let n = document.createDocumentFragment();
    if (i.collapsed)
      return n;
    t || (t = i.commonAncestorContainer), t instanceof Text && (t = t.parentNode);
    let { startContainer: o, startOffset: s } = i, r = I(i.endContainer, i.endOffset, t, e), l = 0, a = I(o, s, t, e);
    for (;a && a !== r; ) {
      let d = a.nextSibling;
      n.appendChild(a), a = d;
    }
    return a = r && r.previousSibling, a && a instanceof Text && r instanceof Text && (l = a.length, a.appendData(r.data), S(r), r = a), i.setStart(o, s), r ? i.setEnd(r, l) : i.setEnd(t, t.childNodes.length), x(t), n;
  };
  var Ze = (i, t, e) => {
    i.currentNode = e;
    let n;
    for (;n = i[t](); ) {
      if (n instanceof Text || H(n))
        return n;
      if (!g(n))
        return null;
    }
    return null;
  };
  var F = (i, t) => {
    let e = v(i, t), n = $(i, t), o = e !== n;
    e && n && (C(i), K(i, e, n, t));
    let s = we(i, null, t);
    C(i), o && (n = $(i, t), e && n && e !== n && V(e, n, i, t)), e && x(e);
    let r = t.firstChild;
    (!r || r.nodeName === "BR") && (x(t), t.firstChild && i.selectNodeContents(t.firstChild)), i.collapse(true);
    let { startContainer: l, startOffset: a } = i, d = new T(t, 5), c = l, f = a;
    (!(c instanceof Text) || f === c.data.length) && (c = Ze(d, "nextNode", c), f = 0);
    let u = l, p = a - 1;
    (!(u instanceof Text) || p === -1) && (u = Ze(d, "previousPONode", c || (l instanceof Text ? l : l.childNodes[a] || l)), u instanceof Text && (p = u.data.length));
    let h = null, E = 0;
    return c instanceof Text && c.data.charAt(f) === " " && j(i, t) ? (h = c, E = f) : u instanceof Text && u.data.charAt(p) === " " && (c instanceof Text && c.data.charAt(f) === " " || G(i, t)) && (h = u, E = p), h && h.replaceData(E, 1, " "), i.setStart(l, a), i.collapse(true), s;
  };
  var Xe = (i, t, e) => {
    let n = t.firstChild && g(t.firstChild), o;
    for (D(t, e), o = t;o = M(o, e); )
      x(o);
    i.collapsed || F(i, e), C(i), i.collapse(false);
    let s = N(i.endContainer, e, "BLOCKQUOTE") || e, r = v(i, e), l = null, a = M(t, t), d = !n && !!r && de(r);
    if (r && a && !d && !N(a, t, "PRE") && !N(a, t, "TABLE")) {
      K(i, r, r, e), i.collapse(true);
      let { endContainer: c, endOffset: f } = i;
      if (ae(r, e, false), g(c)) {
        let u = I(c, f, W(c, e) || e, e);
        c = u.parentNode, f = Array.from(c.childNodes).indexOf(u);
      }
      if (f !== L(c))
        for (l = document.createDocumentFragment();o = c.childNodes[f]; )
          l.appendChild(o);
      V(c, a, i, e), c === e ? i.setEnd(e, L(e)) : (f = Array.from(c.parentNode.childNodes).indexOf(c) + 1, c = c.parentNode, i.setEnd(c, f));
    }
    if (L(t)) {
      d && r && (i.setEndBefore(r), i.collapse(false), S(r)), s.contains(i.endContainer) || (e.contains(i.endContainer) || (i.setEnd(e, L(e)), i.collapse(false)), s = N(i.endContainer, e, "BLOCKQUOTE") || e), K(i, s, s, e);
      let c = I(i.endContainer, i.endOffset, s, e), f = c ? c.previousSibling : s.lastChild;
      s.insertBefore(t, c), c ? i.setEndBefore(c) : i.setEnd(s, L(s)), r = $(i, e), C(i);
      let { endContainer: u, endOffset: p } = i;
      c && X(c) && P(c, e), c = f && f.nextSibling, c && X(c) && P(c, e), i.setEnd(u, p);
    }
    if (l && r) {
      let c = i.cloneRange();
      x(l), V(r, l, c, e), i.setEnd(c.endContainer, c.endOffset);
    }
    C(i);
  };
  var _e = (i) => {
    if (i.collapsed)
      return "";
    let { startContainer: t, endContainer: e } = i, n = new T(i.commonAncestorContainer, 5, (a) => z(i, a, true));
    n.currentNode = t;
    let o = t, s = "", r = false, l;
    for ((!(o instanceof Element) && !(o instanceof Text) || !n.filter(o)) && (o = n.nextNode());o; )
      o instanceof Text ? (l = o.data, l && /\S/.test(l) && (o === e && (l = l.slice(0, i.endOffset)), o === t && (l = l.slice(i.startOffset)), s += l, r = true)) : (o.nodeName === "BR" || r && !g(o)) && (s += `
`, r = false), o = n.nextNode();
    return s = s.replace(/ /g, " "), s;
  };
  var Ie = Array.prototype.indexOf;
  var je = (i, t, e, n, o) => {
    let s = o ? "" : _e(i), r = v(i, t), l = $(i, t), a = i.commonAncestorContainer, d = t;
    r === l && r?.contains(a) && (d = r);
    let c;
    for (e ? (c = F(i, t), a.isConnected || (a = i.commonAncestorContainer)) : c = i.cloneContents(), a instanceof Text && (a = a.parentNode);a && a !== d; ) {
      let u = a.cloneNode(false);
      u.appendChild(c), c = u, a = a.parentNode;
    }
    let f;
    if (c.childNodes.length === 1 && c.childNodes[0] instanceof Text)
      s = c.childNodes[0].data.replace(/ /g, " "), f = undefined;
    else {
      let u = m("DIV");
      u.appendChild(c), f = u.innerHTML, n && (f = n(f));
    }
    return o && f !== undefined && (s = o(f)), s === f && (f = undefined), ue && (s = s.replace(/\r?\n/g, `\r
`)), f && (f = "<!-- squire -->" + f), [s, f];
  };
  var Qe = (i, t, e, n, o, s, r) => {
    let l = i.clipboardData;
    if (re || !l)
      return false;
    let [a, d] = je(t, e, n, o, s);
    return i.preventDefault(), !r && d && l.setData("text/html", d), l.setData("text/plain", a), true;
  };
  var Ye = function(i) {
    let t = this.getSelection(), e = this._root;
    if (t.collapsed) {
      i.preventDefault();
      return;
    }
    this.saveUndoState(t), Qe(i, t, e, true, this._config.willCutCopy, this._config.toPlainText, false) || setTimeout(() => {
      try {
        this._ensureBottomLine();
      } catch (o) {
        this._config.didError(o);
      }
    }, 0), this.setSelection(t);
  };
  var Ve = function(i) {
    Qe(i, this.getSelection(), this._root, false, this._config.willCutCopy, this._config.toPlainText, false);
  };
  var Me = function(i) {
    this._isShiftDown = i.shiftKey;
  };
  var Je = function(i) {
    let t = i.clipboardData, e = t?.items, n = this._isShiftDown || !!N(this.getSelection().commonAncestorContainer, this._root, "PRE"), o = false, s = false, r = null, l = null;
    if (e) {
      let R = e.length;
      for (;R--; ) {
        let O = e[R], A = O.type;
        A === "text/html" ? l = O : A === "text/plain" || A === "text/uri-list" ? r = O : A === "text/rtf" ? o = true : /^image\/.*/.test(A) && (s = true);
      }
      if (s && !(o && l) && !r) {
        i.preventDefault(), this.fireEvent("pasteImage", { clipboardData: t });
        return;
      }
      if (!re) {
        i.preventDefault(), l && (!n || !r) ? l.getAsString((O) => {
          this.insertHTML(O, true);
        }) : r && r.getAsString((O) => {
          let A = this.getSelection();
          if (!A.collapsed && B.test(A.toString())) {
            let J = this.linkRegExp.exec(O);
            if (!!J && J[0].length === O.length) {
              let dt = J[1] ? /^(?:ht|f)tps?:/i.test(J[1]) ? J[1] : "http://" + J[1] : "mailto:" + J[0];
              this.makeLink(dt);
              return;
            }
          }
          this.insertPlainText(O, true);
        });
        return;
      }
    }
    let a = t?.types;
    if (!re && a && (Ie.call(a, "text/html") > -1 || !qe && Ie.call(a, "text/plain") > -1 && Ie.call(a, "text/rtf") < 0)) {
      i.preventDefault();
      let R;
      !n && (R = t.getData("text/html")) ? this.insertHTML(R, true) : ((R = t.getData("text/plain")) || (R = t.getData("text/uri-list"))) && this.insertPlainText(R, true);
      return;
    }
    let d = document.body, c = this.getSelection(), { startContainer: f, startOffset: u, endContainer: p, endOffset: h } = c, E = m("DIV", { contenteditable: "true", style: "position:fixed; overflow:hidden; top:0; right:100%; width:1px; height:1px;" });
    d.appendChild(E), c.selectNodeContents(E), this.setSelection(c), setTimeout(() => {
      try {
        let R = "", O = E, A;
        for (;E = O; )
          O = E.nextSibling, S(E), A = E.firstChild, A && A === E.lastChild && A instanceof HTMLDivElement && (E = A), R += E.innerHTML;
        this.setSelection(Q(f, u, p, h)), R && this.insertHTML(R, true);
      } catch (R) {
        this._config.didError(R);
      }
    }, 0);
  };
  var et = function() {
    let i = this.getSelection();
    i && !i.collapsed && this._root.contains(i.commonAncestorContainer) ? this._dragRange = i.cloneRange() : this._dragRange = null;
  };
  var tt = function() {
    this._dragRange = null;
  };
  var Ot = (i, t, e) => {
    let n = null, o = document;
    if (o.caretPositionFromPoint) {
      let s = o.caretPositionFromPoint(i, t);
      s && (n = document.createRange(), n.setStart(s.offsetNode, s.offset), n.collapse(true));
    } else
      o.caretRangeFromPoint && (n = o.caretRangeFromPoint(i, t));
    return n && !e.contains(n.commonAncestorContainer) ? null : n;
  };
  var Bt = (i, t) => i.compareBoundaryPoints(Range.START_TO_START, t) >= 0 && i.compareBoundaryPoints(Range.END_TO_END, t) <= 0;
  var nt = function(i) {
    let t = i.dataTransfer;
    if (!t)
      return;
    let e = t.types, n = false, o = false;
    for (let c = 0, f = e.length;c < f; c += 1)
      switch (e[c]) {
        case "text/plain":
          n = true;
          break;
        case "text/html":
          o = true;
          break;
      }
    if (!n && !o)
      return;
    i.preventDefault();
    let s = this._root, r = Ot(i.clientX, i.clientY, s), l = this._dragRange;
    if (this._dragRange = null, !r)
      return;
    let a, d;
    if (l) {
      if (Bt(r, l))
        return;
      this._recordUndoState(l, this._isInUndoState);
      let c = document.createComment("");
      r.insertNode(c), this._getRangeAndRemoveBookmark(l), [a, d] = je(l, s, t.dropEffect !== "copy", this._config.willCutCopy, this._config.toPlainText), c.replaceWith(m("INPUT", { id: this.startSelectionId, type: "hidden" }), m("INPUT", { id: this.endSelectionId, type: "hidden" })), this._getRangeAndRemoveBookmark(r), me();
    } else
      this.saveUndoState(r), o ? d = t.getData("text/html") : a = t.getData("text/plain");
    this.setSelection(r), d !== undefined ? this.insertHTML(d, true) : a !== undefined && this.insertPlainText(a, true);
  };
  var He = (i, t, e) => {
    t.preventDefault(), i.splitBlock(t.shiftKey, e);
  };
  var ie = (i, t) => {
    try {
      t || (t = i.getSelection());
      let e = t.startContainer;
      e instanceof Text && (e = e.parentNode);
      let n = e;
      for (;g(n) && (!n.textContent || n.textContent === "​"); )
        e = n, n = e.parentNode;
      e !== n && (t.setStart(n, Array.from(n.childNodes).indexOf(e)), t.collapse(true), n.removeChild(e), q(n) || (n = W(n, i._root) || i._root), x(n), C(t)), e === i._root && (e = e.firstChild) && e.nodeName === "BR" && S(e), i._ensureBottomLine(), i.setSelection(t), i._updatePath(t, true);
    } catch (e) {
      i._config.didError(e);
    }
  };
  var Te = (i, t) => {
    let e;
    for (;(e = i.parentNode) && !(e === t || e.isContentEditable); )
      i = e;
    S(i);
  };
  var Ce = (i, t, e) => {
    if (N(t, i._root, "A"))
      return;
    let n = t.data || "", o = Math.max(n.lastIndexOf(" ", e - 1), n.lastIndexOf(" ", e - 1)) + 1, s = n.slice(o, e), r = i.linkRegExp.exec(s);
    if (r) {
      let l = i.getSelection();
      i._docWasChanged(), i._recordUndoState(l), i._getRangeAndRemoveBookmark(l);
      let a = o + r.index, d = a + r[0].length, c = l.startContainer === t, f = l.startOffset - d;
      a && (t = t.splitText(a));
      let u = i._config.tagAttributes.a, p = m("A", Object.assign({ href: r[1] ? /^(?:ht|f)tps?:/i.test(r[1]) ? r[1] : "http://" + r[1] : "mailto:" + r[0] }, u));
      p.textContent = n.slice(a, d), t.parentNode.insertBefore(p, t), t.data = n.slice(d), c && (l.setStart(t, f), l.setEnd(t, f)), i.setSelection(l);
    }
  };
  var it = (i, t, e) => {
    let n = i._root;
    if (i._removeZWS(), i.saveUndoState(e), !e.collapsed)
      t.preventDefault(), F(e, n), ie(i, e);
    else if (j(e, n)) {
      t.preventDefault();
      let o = v(e, n);
      if (!o)
        return;
      let s = o;
      D(s.parentNode, n);
      let r = W(s, n);
      if (r) {
        if (!r.isContentEditable) {
          Te(r, n);
          return;
        }
        for (V(r, s, e, n), s = r.parentNode;s !== n && !s.nextSibling; )
          s = s.parentNode;
        s !== n && (s = s.nextSibling) && P(s, n), i.setSelection(e);
      } else if (s) {
        if (N(s, n, "UL") || N(s, n, "OL")) {
          i.decreaseListLevel(e);
          return;
        } else if (N(s, n, "BLOCKQUOTE")) {
          i.removeQuote(e);
          return;
        }
        i.setSelection(e), i._updatePath(e, true);
      }
    } else {
      C(e);
      let { startContainer: o, startOffset: s } = e, r = o.parentNode;
      o instanceof Text && r instanceof HTMLAnchorElement && s && r.href.includes(o.data) ? (o.deleteData(s - 1, 1), i.setSelection(e), i.removeLink(), t.preventDefault()) : (i.setSelection(e), setTimeout(() => {
        ie(i);
      }, 0));
    }
  };
  var ot = (i, t, e) => {
    let n = i._root, o, s, r, l, a, d;
    if (i._removeZWS(), i.saveUndoState(e), !e.collapsed)
      t.preventDefault(), F(e, n), ie(i, e);
    else if (G(e, n)) {
      if (t.preventDefault(), o = v(e, n), !o)
        return;
      if (D(o.parentNode, n), s = M(o, n), s) {
        if (!s.isContentEditable) {
          Te(s, n);
          return;
        }
        for (V(o, s, e, n), s = o.parentNode;s !== n && !s.nextSibling; )
          s = s.parentNode;
        s !== n && (s = s.nextSibling) && P(s, n), i.setSelection(e), i._updatePath(e, true);
      }
    } else {
      if (r = e.cloneRange(), K(e, n, n, n), l = e.endContainer, a = e.endOffset, l instanceof Element && (d = l.childNodes[a], d && d.nodeName === "IMG")) {
        t.preventDefault(), S(d), C(e), ie(i, e);
        return;
      }
      i.setSelection(r), setTimeout(() => {
        ie(i);
      }, 0);
    }
  };
  var st = (i, t, e) => {
    let n = i._root;
    if (i._removeZWS(), e.collapsed && j(e, n)) {
      let o = v(e, n), s;
      for (;s = o.parentNode; ) {
        if (s.nodeName === "UL" || s.nodeName === "OL") {
          t.preventDefault(), i.increaseListLevel(e);
          break;
        }
        o = s;
      }
    }
  };
  var rt = (i, t, e) => {
    let n = i._root;
    if (i._removeZWS(), e.collapsed && j(e, n)) {
      let o = e.startContainer;
      (N(o, n, "UL") || N(o, n, "OL")) && (t.preventDefault(), i.decreaseListLevel(e));
    }
  };
  var lt = (i, t, e) => {
    let n, o = i._root;
    if (i._recordUndoState(e), i._getRangeAndRemoveBookmark(e), !e.collapsed)
      F(e, o), i._ensureBottomLine(), i.setSelection(e), i._updatePath(e, true);
    else if (G(e, o)) {
      let s = v(e, o);
      if (s && s.nodeName !== "PRE") {
        let r = s.textContent?.trimEnd().replace("​", "");
        if (r === "*" || r === "1.") {
          t.preventDefault(), i.insertPlainText(" ", false), i._docWasChanged(), i.saveUndoState(e);
          let l = new T(s, 4), a;
          for (;a = l.nextNode(); )
            S(a);
          r === "*" ? i.makeUnorderedList() : i.makeOrderedList();
          return;
        }
      }
    }
    if (n = e.endContainer, e.endOffset === L(n))
      do
        if (n.nodeName === "A") {
          e.setStartAfter(n);
          break;
        }
      while (!n.nextSibling && (n = n.parentNode) && n !== o);
    if (i._config.addLinks) {
      let s = e.cloneRange();
      C(s);
      let { startContainer: r, startOffset: l } = s;
      setTimeout(() => {
        Ce(i, r, l);
      }, 0);
    }
    i.setSelection(e);
  };
  var at = function(i) {
    if (i.defaultPrevented || i.isComposing)
      return;
    let t = i.key, e = "", n = i.code;
    /^Digit\d$/.test(n) && (t = n.slice(-1)), t !== "Backspace" && t !== "Delete" && (i.altKey && (e += "Alt-"), i.ctrlKey && (e += "Ctrl-"), i.metaKey && (e += "Meta-"), i.shiftKey && (e += "Shift-")), ue && i.shiftKey && t === "Delete" && (e += "Shift-"), t = e + t;
    let o = this.getSelection(), s = this._keyHandlers[t];
    s ? s(this, i, o) : !o.collapsed && !i.ctrlKey && !i.metaKey && t.length === 1 && (this.saveUndoState(o), F(o, this._root), this._ensureBottomLine(), this.setSelection(o), this._updatePath(o, true));
  };
  var b = { Backspace: it, Delete: ot, Tab: st, "Shift-Tab": rt, " ": lt, ArrowLeft(i) {
    i._removeZWS();
  }, ArrowRight(i, t, e) {
    i._removeZWS();
    let n = i.getRoot();
    if (G(e, n)) {
      C(e);
      let o = e.endContainer;
      do
        if (o.nodeName === "CODE") {
          let s = o.nextSibling;
          if (!(s instanceof Text) || s.length === 0) {
            let r = document.createTextNode(" ");
            o.parentNode.insertBefore(r, s), s = r;
          }
          e.setStart(s, 1), i.setSelection(e), t.preventDefault();
          break;
        }
      while (!o.nextSibling && (o = o.parentNode) && o !== n);
    }
  } };
  Ue || (b.Enter = He, b["Shift-Enter"] = He);
  !fe && !be && (b.PageUp = (i) => {
    i.moveCursorToStart();
  }, b.PageDown = (i) => {
    i.moveCursorToEnd();
  });
  var se = (i, t) => (t = t || null, (e, n) => {
    n.preventDefault();
    let o = e.getSelection();
    e.hasFormat(i, null, o) ? e.changeFormat(null, { tag: i }, o) : e.changeFormat({ tag: i }, t, o);
  });
  b[y + "b"] = se("B");
  b[y + "i"] = se("I");
  b[y + "u"] = se("U");
  b[y + "Shift-7"] = se("S");
  b[y + "Shift-5"] = se("SUB", { tag: "SUP" });
  b[y + "Shift-6"] = se("SUP", { tag: "SUB" });
  b[y + "Shift-8"] = (i, t) => {
    t.preventDefault();
    let e = i.getPath();
    /(?:^|>)UL/.test(e) ? i.removeList() : i.makeUnorderedList();
  };
  b[y + "Shift-9"] = (i, t) => {
    t.preventDefault();
    let e = i.getPath();
    /(?:^|>)OL/.test(e) ? i.removeList() : i.makeOrderedList();
  };
  b[y + "["] = (i, t) => {
    t.preventDefault();
    let e = i.getPath();
    /(?:^|>)BLOCKQUOTE/.test(e) || !/(?:^|>)[OU]L/.test(e) ? i.decreaseQuoteLevel() : i.decreaseListLevel();
  };
  b[y + "]"] = (i, t) => {
    t.preventDefault();
    let e = i.getPath();
    /(?:^|>)BLOCKQUOTE/.test(e) || !/(?:^|>)[OU]L/.test(e) ? i.increaseQuoteLevel() : i.increaseListLevel();
  };
  b[y + "d"] = (i, t) => {
    t.preventDefault(), i.toggleCode();
  };
  b[y + "z"] = (i, t) => {
    t.preventDefault(), i.undo();
  };
  b[y + "y"] = b[y + "Shift-z"] = b[y + "Shift-Z"] = (i, t) => {
    t.preventDefault(), i.redo();
  };
  var Pe = 8;
  var ct = 40;
  var Fe = 1200;
  var Dt = [{ pos: "nw", cursor: "nwse-resize" }, { pos: "n", cursor: "ns-resize" }, { pos: "ne", cursor: "nesw-resize" }, { pos: "e", cursor: "ew-resize" }, { pos: "se", cursor: "nwse-resize" }, { pos: "s", cursor: "ns-resize" }, { pos: "sw", cursor: "nesw-resize" }, { pos: "w", cursor: "ew-resize" }];
  var At = { ArrowUp: (i, t, e) => {
    let n = v(t, e);
    if (n) {
      let o = W(n, e);
      o && (t.selectNodeContents(o), t.collapse(false), i.setSelection(t).focus());
    }
  }, ArrowDown: (i, t, e) => {
    let n = v(t, e);
    if (n) {
      let o = M(n, e);
      o && (t.selectNodeContents(o), t.collapse(true), i.setSelection(t).focus());
    }
  }, Delete: (i, t) => {
    i.replaceWithBlankLine(t);
  }, Backspace: (i, t) => {
    i.replaceWithBlankLine(t);
  } };
  var ve = class {
    constructor(t, e) {
      this._currentImage = null;
      this._resizeContainer = null;
      this._handles = null;
      this._currentHandle = null;
      this._startX = 0;
      this._startY = 0;
      this._startWidth = 0;
      this._startHeight = 0;
      this._maxWidth = Fe;
      this._originalRatio = 1;
      this._editor = e, this._root = t, document.addEventListener("click", this), e.addEventListener("drop", this);
    }
    destroy() {
      this._deselectImage(), this._editor.removeEventListener("drop", this), document.removeEventListener("click", this);
    }
    handleEvent(t) {
      switch (t.type) {
        case "click":
          this._onClick(t);
          break;
        case "pointerdown":
          this._onPointerDown(t);
          break;
        case "pointermove":
          this._onPointerMove(t);
          break;
        case "pointercancel":
        case "pointerup":
          this._onPointerUp(t);
          break;
        case "keydown":
          this._onKeyDown(t);
          break;
        case "drop":
          this._deselectImage();
          break;
      }
    }
    _onClick(t) {
      let e = t.target;
      e.nodeName === "IMG" && this._root.contains(e) ? (t.stopPropagation(), this._selectImage(e)) : this._currentImage && this._handles && !this._handles.some((n) => n.element === e) && this._deselectImage();
    }
    _deselectImage() {
      this._currentImage && (document.removeEventListener("keydown", this, true), this._currentHandle && this._onPointerUp({ preventDefault() {}, target: this._currentHandle.element }), this._handles && this._handles.forEach(({ element: t }) => t.removeEventListener("pointerdown", this)), this._resizeContainer && this._resizeContainer.remove(), this._currentImage.removeAttribute("tabindex"), this._handles = null, this._resizeContainer = null, this._currentImage = null);
    }
    _selectImage(t) {
      if (this._currentImage === t)
        return;
      this._deselectImage(), this._root.blur();
      let e = Dt.map(({ pos: s, cursor: r }) => {
        let l = Pe / 2, a = "";
        switch (s) {
          case "nw":
            a = `left: -${l}px; top: -${l}px;`;
            break;
          case "n":
            a = `left: calc(50% - ${l}px); top: -${l}px;`;
            break;
          case "ne":
            a = `right: -${l}px; top: -${l}px;`;
            break;
          case "e":
            a = `right: -${l}px; top: calc(50% - ${l}px);`;
            break;
          case "se":
            a = `right: -${l}px; bottom: -${l}px;`;
            break;
          case "s":
            a = `left: calc(50% - ${l}px); bottom: -${l}px;`;
            break;
          case "sw":
            a = `left: -${l}px; bottom: -${l}px;`;
            break;
          case "w":
            a = `left: -${l}px; top: calc(50% - ${l}px);`;
            break;
        }
        let d = m("div", { class: `squire-resize-handle squire-resize-handle-${s}`, style: `
                    position: absolute;
                    width: ${Pe}px;
                    height: ${Pe}px;
                    background: #0067b9;
                    border: 1px solid #fff;
                    cursor: ${r};
                    pointer-events: auto;
                    touch-action: none;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.3);
                    ${a}
                ` });
        return d.addEventListener("pointerdown", this), { element: d, cursor: r, position: s };
      }), n = m("div", { class: "squire-image-resize-container", style: "position: absolute; pointer-events: none; z-index: 1000;" }, e.map((s) => s.element));
      this._currentImage = t, this._resizeContainer = n, this._handles = e, this._root.appendChild(this._resizeContainer);
      let o = t.naturalWidth;
      this._originalRatio = o / t.naturalHeight, this._maxWidth = Math.min(o * 2, t.parentElement ? t.parentElement.offsetWidth : Fe, Fe), this._positionResizeContainer(), t.tabIndex = -1, t.focus(), document.addEventListener("keydown", this, true);
    }
    _positionResizeContainer() {
      let t = this._resizeContainer, e = this._root, n = this._currentImage;
      if (!t || !n)
        return;
      let o = e.getBoundingClientRect(), s = n.getBoundingClientRect(), r = s.top - o.top + e.scrollTop, l = s.left - o.left + e.scrollLeft, { width: a, height: d } = s;
      t.style.top = r + "px", t.style.left = l + "px", t.style.width = a + "px", t.style.height = d + "px";
    }
    _onPointerDown(t) {
      if (this._currentHandle || !this._handles)
        return;
      let e = t.target, n = this._handles.find((r) => r.element === e) || null;
      if (!n)
        return;
      let o = this._currentImage;
      if (!o)
        return;
      t.preventDefault(), t.stopPropagation(), e.addEventListener("pointermove", this), e.addEventListener("pointerup", this), e.addEventListener("pointercancel", this), e.setPointerCapture(t.pointerId), this._currentHandle = n, this._startX = t.clientX, this._startY = t.clientY;
      let s = getComputedStyle(o);
      this._startWidth = parseFloat(s.width), this._startHeight = parseFloat(s.height), document.body.style.cursor = n.cursor;
    }
    _onPointerMove(t) {
      t.preventDefault();
      let e = this._currentHandle, n = this._currentImage;
      if (!e || !n)
        return;
      let o = t.clientX - this._startX, s = t.clientY - this._startY, r = this._maxWidth, l = this._originalRatio, a = this._startWidth, d = this._startHeight;
      switch (e.position) {
        case "sw":
        case "nw":
        case "w":
          a -= 2 * o;
          break;
        case "se":
        case "ne":
        case "e":
          a += 2 * o;
          break;
        case "n":
          d -= s, a = d * l;
          break;
        case "s":
          d += s, a = d * l;
          break;
      }
      a < ct ? a = ct : a > r && (a = r);
      let c = n.style;
      c.width = a + "px", c.height = "auto", this._positionResizeContainer();
    }
    _onPointerUp(t) {
      t.preventDefault();
      let e = t.target;
      e && (e.removeEventListener("pointermove", this), e.removeEventListener("pointerup", this), e.removeEventListener("pointercancel", this)), this._currentHandle = null, document.body.style.cursor = "";
    }
    _onKeyDown(t) {
      t.preventDefault(), t.stopPropagation();
      let e = At[t.key];
      if (!e)
        return;
      let n = this._currentImage;
      if (!n)
        return;
      let o = this._editor, s = this._root;
      this._deselectImage();
      let r = o.getSelection();
      r.selectNode(n), e(o, r, s);
    }
  };
  var xe = class {
    constructor(t, e) {
      this.customEvents = new Set(["pathChange", "select", "input", "pasteImage", "undoStateChange"]);
      this.startSelectionId = "squire-selection-start";
      this.endSelectionId = "squire-selection-end";
      this.linkRegExp = /\b(?:((?:(?:ht|f)tps?:\/\/|www\d{0,3}[.]|[a-z0-9][a-z0-9.\-]*[.][a-z]{2,}\/)(?:[^\s()<>]+|\([^\s()<>]+\))+(?:[^\s?&`!()\[\]{};:'".,<>«»“”‘’]|\([^\s()<>]+\)))|([\w\-.%+]+@(?:[\w\-]+\.)+[a-z]{2,}\b(?:[?][^&?\s]+=[^\s?&`!()\[\]{};:'".,<>«»“”‘’]+(?:&[^&?\s]+=[^\s?&`!()\[\]{};:'".,<>«»“”‘’]+)*)?))/i;
      this.tagAfterSplit = { DT: "DD", DD: "DT", LI: "LI", PRE: "PRE" };
      this._root = t, this._config = this._makeConfig(e), this._isFocused = false, this._lastSelection = Q(t, 0), this._willRestoreSelection = false, this._mayHaveZWS = false, this._lastAnchorNode = null, this._lastFocusNode = null, this._lastPathRange = null, this._path = "", this._events = new Map, this._undoIndex = -1, this._undoStack = [], this._undoStackLength = 0, this._isInUndoState = false, this._ignoreChange = false, this._ignoreAllChanges = false, this.addEventListener("selectionchange", this._updatePathOnEvent), this.addEventListener("blur", this._enableRestoreSelection), this.addEventListener("mousedown", this._disableRestoreSelection), this.addEventListener("touchstart", this._disableRestoreSelection), this.addEventListener("focus", this._restoreSelection), this.addEventListener("blur", this._removeZWS), this._isShiftDown = false, this.addEventListener("cut", Ye), this.addEventListener("copy", Ve), this.addEventListener("paste", Je), this._dragRange = null, this.addEventListener("dragstart", et), this.addEventListener("dragend", tt), this.addEventListener("drop", nt), this.addEventListener("keydown", Me), this.addEventListener("keyup", Me), this.addEventListener("keydown", at), this._keyHandlers = Object.create(b);
      let n = new MutationObserver(() => this._docWasChanged());
      n.observe(t, { childList: true, attributes: true, characterData: true, subtree: true }), this._mutation = n, t.setAttribute("contenteditable", "true"), this.addEventListener("beforeinput", this._beforeInput), this._imageResizer = new ve(t, this), this.setHTML("");
    }
    destroy() {
      this._events.forEach((t, e) => {
        this.removeEventListener(e);
      }), this._mutation.disconnect(), this._imageResizer.destroy(), this._undoIndex = -1, this._undoStack = [], this._undoStackLength = 0;
    }
    _makeConfig(t) {
      let e = { blockTag: "DIV", blockAttributes: null, tagAttributes: {}, classNames: { color: "color", fontFamily: "font", fontSize: "size", highlight: "highlight" }, undo: { documentSizeThreshold: -1, undoLimit: -1 }, addLinks: true, willCutCopy: null, toPlainText: null, sanitizeToDOMFragment: (n) => {
        let o = DOMPurify.sanitize(n, { ALLOW_UNKNOWN_PROTOCOLS: true, WHOLE_DOCUMENT: false, RETURN_DOM: true, RETURN_DOM_FRAGMENT: true, FORCE_BODY: false });
        return o ? document.importNode(o, true) : document.createDocumentFragment();
      }, didError: (n) => console.log(n) };
      return t && (Object.assign(e, t), e.blockTag = e.blockTag.toUpperCase()), e;
    }
    setKeyHandler(t, e) {
      return this._keyHandlers[t] = e, this;
    }
    _beforeInput(t) {
      switch (t.inputType) {
        case "insertLineBreak":
          t.preventDefault(), this.splitBlock(true);
          break;
        case "insertParagraph":
          t.preventDefault(), this.splitBlock(false);
          break;
        case "insertOrderedList":
          t.preventDefault(), this.makeOrderedList();
          break;
        case "insertUnoderedList":
          t.preventDefault(), this.makeUnorderedList();
          break;
        case "historyUndo":
          t.preventDefault(), this.undo();
          break;
        case "historyRedo":
          t.preventDefault(), this.redo();
          break;
        case "formatBold":
          t.preventDefault(), this.bold();
          break;
        case "formatItalic":
          t.preventDefault(), this.italic();
          break;
        case "formatUnderline":
          t.preventDefault(), this.underline();
          break;
        case "formatStrikeThrough":
          t.preventDefault(), this.strikethrough();
          break;
        case "formatSuperscript":
          t.preventDefault(), this.superscript();
          break;
        case "formatSubscript":
          t.preventDefault(), this.subscript();
          break;
        case "formatJustifyFull":
        case "formatJustifyCenter":
        case "formatJustifyRight":
        case "formatJustifyLeft": {
          t.preventDefault();
          let e = t.inputType.slice(13).toLowerCase();
          e === "full" && (e = "justify"), this.setTextAlignment(e);
          break;
        }
        case "formatRemove":
          t.preventDefault(), this.removeAllFormatting();
          break;
        case "formatSetBlockTextDirection": {
          t.preventDefault();
          let e = t.data;
          e === "null" && (e = null), this.setTextDirection(e);
          break;
        }
        case "formatBackColor":
          t.preventDefault(), this.setHighlightColor(t.data);
          break;
        case "formatFontColor":
          t.preventDefault(), this.setTextColor(t.data);
          break;
        case "formatFontName":
          t.preventDefault(), this.setFontFace(t.data);
          break;
      }
    }
    handleEvent(t) {
      this.fireEvent(t.type, t);
    }
    fireEvent(t, e) {
      let n = this._events.get(t);
      if (/^(?:focus|blur)/.test(t)) {
        let o = this._root === document.activeElement;
        if (t === "focus") {
          if (!o || this._isFocused)
            return this;
          this._isFocused = true;
        } else {
          if (o || !this._isFocused)
            return this;
          this._isFocused = false;
        }
      }
      if (n) {
        let o = e instanceof Event ? e : new CustomEvent(t, { detail: e });
        n = n.slice();
        for (let s of n)
          try {
            "handleEvent" in s ? s.handleEvent(o) : s.call(this, o);
          } catch (r) {
            this._config.didError(r);
          }
      }
      return this;
    }
    addEventListener(t, e) {
      let n = this._events.get(t), o = this._root;
      return n || (n = [], this._events.set(t, n), this.customEvents.has(t) || (t === "selectionchange" && (o = document), o.addEventListener(t, this, true))), n.push(e), this;
    }
    removeEventListener(t, e) {
      let n = this._events.get(t), o = this._root;
      if (n) {
        if (e) {
          let s = n.length;
          for (;s--; )
            n[s] === e && n.splice(s, 1);
        } else
          n.length = 0;
        n.length || (this._events.delete(t), this.customEvents.has(t) || (t === "selectionchange" && (o = document), o.removeEventListener(t, this, true)));
      }
      return this;
    }
    focus() {
      return this._root.focus({ preventScroll: true }), this;
    }
    blur() {
      return this._root.blur(), this;
    }
    _enableRestoreSelection() {
      this._willRestoreSelection = true;
    }
    _disableRestoreSelection() {
      this._willRestoreSelection = false;
    }
    _restoreSelection() {
      this._willRestoreSelection && this.setSelection(this._lastSelection);
    }
    _removeZWS() {
      this._mayHaveZWS && (le(this._root), this._mayHaveZWS = false);
    }
    _saveRangeToBookmark(t) {
      let e = m("INPUT", { id: this.startSelectionId, type: "hidden" }), n = m("INPUT", { id: this.endSelectionId, type: "hidden" }), o;
      Z(t, e), t.collapse(false), Z(t, n), e.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_PRECEDING && (e.id = this.endSelectionId, n.id = this.startSelectionId, o = e, e = n, n = o), t.setStartAfter(e), t.setEndBefore(n);
    }
    _getRangeAndRemoveBookmark(t) {
      let e = this._root, n = e.querySelectorAll("#" + this.startSelectionId), o = e.querySelectorAll("#" + this.endSelectionId), s = n[0], r = o[0];
      if (s && r && s.compareDocumentPosition(r) & Node.DOCUMENT_POSITION_FOLLOWING) {
        let l = s.parentNode, a = r.parentNode, d = Array.from(l.childNodes).indexOf(s), c = Array.from(a.childNodes).indexOf(r);
        l === a && (c -= 1), s.remove(), r.remove(), t || (t = document.createRange()), t.setStart(l, d), t.setEnd(a, c), ne(l, t), l !== a && ne(a, t), t.collapsed && (l = t.startContainer, l instanceof Text && (a = l.childNodes[t.startOffset], (!a || !(a instanceof Text)) && (a = l.childNodes[t.startOffset - 1]), a && a instanceof Text && (t.setStart(a, 0), t.collapse(true))));
      }
      for (let l = 0;l < n.length; l += 1)
        n[l].remove();
      for (let l = 0;l < o.length; l += 1)
        o[l].remove();
      return t || null;
    }
    getSelection() {
      let t = window.getSelection(), e = this._root, n = null;
      if (this._isFocused && t && t.rangeCount) {
        n = t.getRangeAt(0).cloneRange();
        let o = n.startContainer, s = n.endContainer;
        o && H(o) && n.setStartBefore(o), s && H(s) && n.setEndBefore(s);
      }
      return n && e.contains(n.commonAncestorContainer) ? this._lastSelection = n : (n = this._lastSelection, document.contains(n.commonAncestorContainer) || (n = null)), n || (n = Q(e.firstElementChild || e, 0)), n;
    }
    setSelection(t) {
      if (this._lastSelection = t, !this._isFocused)
        this._enableRestoreSelection();
      else {
        let e = window.getSelection();
        e && ("setBaseAndExtent" in Selection.prototype ? e.setBaseAndExtent(t.startContainer, t.startOffset, t.endContainer, t.endOffset) : (e.removeAllRanges(), e.addRange(t)));
      }
      return this;
    }
    _moveCursorTo(t) {
      let e = this._root, n = Q(e, t ? 0 : e.childNodes.length);
      return C(n), this.setSelection(n), this;
    }
    moveCursorToStart() {
      return this._moveCursorTo(true);
    }
    moveCursorToEnd() {
      return this._moveCursorTo(false);
    }
    getCursorPosition() {
      let t = this.getSelection(), e = t.getBoundingClientRect();
      if (e && !e.top) {
        this._ignoreChange = true;
        let n = m("SPAN");
        n.textContent = "​", Z(t, n), e = n.getBoundingClientRect();
        let o = n.parentNode;
        o.removeChild(n), ne(o, t);
      }
      return e;
    }
    getPath() {
      return this._path;
    }
    _updatePathOnEvent() {
      if (this._isFocused) {
        let t = this._lastPathRange, e = this.getSelection();
        (!t || !t.commonAncestorContainer.isConnected || e.compareBoundaryPoints(0, t) !== 0 || e.compareBoundaryPoints(2, t) !== 0) && this._updatePath(e);
      }
    }
    _updatePath(t, e) {
      this._lastPathRange = t.cloneRange();
      let { startContainer: n, endContainer: o } = t, s;
      (e || n !== this._lastAnchorNode || o !== this._lastFocusNode) && (this._lastAnchorNode = n, this._lastFocusNode = o, s = n && o ? n === o ? this._getPath(o) : "(selection)" : "", (this._path !== s || n !== o) && (this._path = s, this.fireEvent("pathChange", { path: s }))), this.fireEvent(t.collapsed ? "cursor" : "select", { range: t });
    }
    _getPath(t) {
      let e = this._root, n = this._config, o = "";
      if (t && t !== e) {
        let s = t.parentNode;
        if (o = s ? this._getPath(s) : "", t instanceof HTMLElement) {
          let { id: r, classList: l } = t, a = Array.from(l).sort(), d = t.dir, c = n.classNames;
          o += (o ? ">" : "") + t.nodeName, r && (o += "#" + r), a.length && (o += ".", o += a.join(".")), d && (o += "[dir=" + d + "]"), l.contains(c.highlight) && (o += "[backgroundColor=" + t.style.backgroundColor.replace(/ /g, "") + "]"), l.contains(c.color) && (o += "[color=" + t.style.color.replace(/ /g, "") + "]"), l.contains(c.fontFamily) && (o += "[fontFamily=" + t.style.fontFamily.replace(/ /g, "") + "]"), l.contains(c.fontSize) && (o += "[fontSize=" + t.style.fontSize + "]");
        }
      }
      return o;
    }
    modifyDocument(t) {
      let e = this._mutation;
      return e && (e.takeRecords().length && this._docWasChanged(), e.disconnect()), this._ignoreAllChanges = true, t(), this._ignoreAllChanges = false, e && (e.observe(this._root, { childList: true, attributes: true, characterData: true, subtree: true }), this._ignoreChange = false), this;
    }
    _docWasChanged() {
      if (me(), this._mayHaveZWS = true, !this._ignoreAllChanges) {
        if (this._ignoreChange) {
          this._ignoreChange = false;
          return;
        }
        this._isInUndoState && (this._isInUndoState = false, this.fireEvent("undoStateChange", { canUndo: true, canRedo: false })), this.fireEvent("input");
      }
    }
    _recordUndoState(t, e) {
      let n = this._isInUndoState;
      if (!n || e) {
        let o = this._undoIndex + 1, s = this._undoStack, r = this._config.undo, { documentSizeThreshold: l, undoLimit: a } = r;
        if (o < this._undoStackLength && (s.length = this._undoStackLength = o), t && this._saveRangeToBookmark(t), n)
          return this;
        let d = this._getRawHTML();
        e && (o -= 1), l > -1 && d.length * 2 > l && a > -1 && o > a && (s.splice(0, o - a), o = a, this._undoStackLength = a), s[o] = d, this._undoIndex = o, this._undoStackLength += 1, this._isInUndoState = true;
      }
      return this;
    }
    saveUndoState(t) {
      let e = false;
      return t || (t = this.getSelection(), e = true), this._recordUndoState(t, this._isInUndoState), this._getRangeAndRemoveBookmark(t), e && this.setSelection(t), this;
    }
    undo() {
      if (this._undoIndex !== 0 || !this._isInUndoState) {
        this._recordUndoState(this.getSelection(), false), this._undoIndex -= 1, this._setRawHTML(this._undoStack[this._undoIndex]);
        let t = this._getRangeAndRemoveBookmark();
        t && this.setSelection(t), this._isInUndoState = true, this.fireEvent("undoStateChange", { canUndo: this._undoIndex !== 0, canRedo: true }), this.fireEvent("input");
      }
      return this.focus();
    }
    redo() {
      let t = this._undoIndex, e = this._undoStackLength;
      if (t + 1 < e && this._isInUndoState) {
        this._undoIndex += 1, this._setRawHTML(this._undoStack[this._undoIndex]);
        let n = this._getRangeAndRemoveBookmark();
        n && this.setSelection(n), this.fireEvent("undoStateChange", { canUndo: true, canRedo: t + 2 < e }), this.fireEvent("input");
      }
      return this.focus();
    }
    getRoot() {
      return this._root;
    }
    _getRawHTML() {
      return this._root.innerHTML;
    }
    _setRawHTML(t) {
      let e = this._root;
      e.innerHTML = t;
      let n = e, o = n.firstChild;
      if (!o || o.nodeName === "BR") {
        let s = this.createDefaultBlock();
        o ? n.replaceChild(s, o) : n.appendChild(s);
      } else
        for (;n = M(n, e); )
          x(n);
      return this._ignoreChange = true, this;
    }
    getHTML(t) {
      let e, n = "";
      return this.modifyDocument(() => {
        t && (e = this.getSelection(), this._saveRangeToBookmark(e));
        let o = this._root.querySelector(".squire-image-resize-container");
        o && o.remove(), n = this._getRawHTML().replace(/\u200B/g, ""), o && this._root.appendChild(o), t && this._getRangeAndRemoveBookmark(e);
      }), n;
    }
    setHTML(t) {
      let e = this._config.sanitizeToDOMFragment(t, this), n = this._root;
      Se(e, this._config), ae(e, n, false), D(e, n);
      let o = e, s = o.firstChild;
      if (!s || s.nodeName === "BR") {
        let l = this.createDefaultBlock();
        s ? o.replaceChild(l, s) : o.appendChild(l);
      } else
        for (;o = M(o, n); )
          x(o);
      for (this._ignoreChange = true;s = n.lastChild; )
        n.removeChild(s);
      n.appendChild(e), this._undoIndex = -1, this._undoStack.length = 0, this._undoStackLength = 0, this._isInUndoState = false;
      let r = this._getRangeAndRemoveBookmark() || Q(n.firstElementChild || n, 0);
      return this.saveUndoState(r), this.setSelection(r), this._updatePath(r, true), this;
    }
    insertHTML(t, e) {
      let n = this._config, o = n.sanitizeToDOMFragment(t, this), s = this.getSelection();
      this.saveUndoState(s);
      try {
        let r = this._root;
        n.addLinks && this.addDetectedLinks(o, o), Se(o, this._config), ae(o, r, false), Ee(o), o.normalize();
        let l = o;
        for (;l = M(l, o); )
          x(l);
        let a = true;
        if (e) {
          let d = new CustomEvent("willPaste", { cancelable: true, detail: { html: t, fragment: o } });
          this.fireEvent("willPaste", d), o = d.detail.fragment, a = !d.defaultPrevented;
        }
        a && (Xe(s, o, r), s.collapse(false), Be(s, "A", r), this._ensureBottomLine()), this.setSelection(s), this._updatePath(s, true), e && this.focus();
      } catch (r) {
        this._config.didError(r);
      }
      return this;
    }
    insertElement(t, e) {
      if (e || (e = this.getSelection()), e.collapse(true), g(t))
        Z(e, t), e.setStartAfter(t);
      else {
        let n = this._root, o = v(e, n), s = o || n, r = null;
        for (;s !== n && !s.nextSibling; )
          s = s.parentNode;
        if (s !== n) {
          let a = s.parentNode;
          r = I(a, s.nextSibling, n, n);
        }
        o && de(o) && S(o), n.insertBefore(t, r);
        let l = this.createDefaultBlock();
        n.insertBefore(l, r), e.setStart(l, 0), e.setEnd(l, 0), C(e);
      }
      return this.focus(), this.setSelection(e), this._updatePath(e), this;
    }
    insertImage(t, e) {
      let n = m("IMG", Object.assign({ src: t }, e));
      return this.insertElement(n), n;
    }
    insertPlainText(t, e) {
      let n = this.getSelection();
      if (n.collapsed && N(n.startContainer, this._root, "PRE")) {
        let c = true;
        if (e) {
          let f = new CustomEvent("willPaste", { cancelable: true, detail: { text: t } });
          this.fireEvent("willPaste", f), t = f.detail.text, c = !f.defaultPrevented;
        }
        if (c) {
          this.saveUndoState(n);
          let { startContainer: f, startOffset: u } = n, p;
          if (f instanceof Text)
            p = f;
          else {
            let h = u ? f.childNodes[u - 1] : null;
            if (h instanceof Text)
              p = h, u = p.length;
            else {
              let E = document.createTextNode("");
              f.insertBefore(E, f.childNodes[u]), p = E, u = 0;
            }
          }
          p.insertData(u, t), n.setStart(p, u + t.length), n.collapse(true);
        }
        return this.setSelection(n), this;
      }
      let o = t.split(`
`), s = this._config, { blockTag: r, blockAttributes: l } = s, a = "</" + r + ">", d = "<" + r;
      for (let c in l)
        d += " " + c + '="' + De(l[c]) + '"';
      d += ">";
      for (let c = 0, f = o.length;c < f; c += 1) {
        let u = o[c];
        u = De(u).replace(/ (?=(?: |$))/g, "&nbsp;"), c && (u = d + (u || "<BR>") + a), o[c] = u;
      }
      return this.insertHTML(o.join(""), e);
    }
    getSelectedText(t) {
      return _e(t || this.getSelection());
    }
    getFontInfo(t) {
      let e = { color: undefined, backgroundColor: undefined, fontFamily: undefined, fontSize: undefined };
      t || (t = this.getSelection()), C(t);
      let n = 0, o = t.commonAncestorContainer;
      if (t.collapsed || o instanceof Text)
        for (o instanceof Text && (o = o.parentNode);n < 4 && o; ) {
          let s = o.style;
          if (s) {
            let r = s.color;
            !e.color && r && (e.color = r, n += 1);
            let l = s.backgroundColor;
            !e.backgroundColor && l && (e.backgroundColor = l, n += 1);
            let a = s.fontFamily;
            !e.fontFamily && a && (e.fontFamily = a, n += 1);
            let d = s.fontSize;
            !e.fontSize && d && (e.fontSize = d, n += 1);
          }
          o = o.parentNode;
        }
      return e;
    }
    hasFormat(t, e, n) {
      t = t.toUpperCase(), e || (e = {}), n || (n = this.getSelection()), !n.collapsed && n.startContainer instanceof Text && n.startOffset === n.startContainer.length && n.startContainer.nextSibling && n.setStartBefore(n.startContainer.nextSibling), !n.collapsed && n.endContainer instanceof Text && n.endOffset === 0 && n.endContainer.previousSibling && n.setEndAfter(n.endContainer.previousSibling);
      let o = this._root, s = n.commonAncestorContainer;
      if (N(s, o, t, e))
        return true;
      if (s instanceof Text)
        return false;
      let r = new T(s, 4, (d) => z(n, d, true)), l = false, a;
      for (;a = r.nextNode(); ) {
        if (!N(a, o, t, e))
          return false;
        l = true;
      }
      return l;
    }
    changeFormat(t, e, n, o) {
      return n || (n = this.getSelection()), this.saveUndoState(n), e && (n = this._removeFormat(e.tag.toUpperCase(), e.attributes || {}, n, o)), t && (n = this._addFormat(t.tag.toUpperCase(), t.attributes || {}, n)), this.setSelection(n), this._updatePath(n, true), this.focus();
    }
    _addFormat(t, e, n) {
      let o = this._root;
      if (n.collapsed) {
        let s = x(m(t, e));
        Z(n, s);
        let r = s.firstChild || s, l = r instanceof Text ? r.length : 0;
        n.setStart(r, l), n.collapse(true);
        let a = s;
        for (;g(a); )
          a = a.parentNode;
        le(a, s);
      } else {
        let s = new T(n.commonAncestorContainer, 5, (c) => (c instanceof Text || c.nodeName === "BR" || c.nodeName === "IMG") && z(n, c, true)), { startContainer: r, startOffset: l, endContainer: a, endOffset: d } = n;
        if (s.currentNode = r, !(r instanceof Element) && !(r instanceof Text) || !s.filter(r)) {
          let c = s.nextNode();
          if (!c)
            return n;
          r = c, l = 0;
        }
        do {
          let c = s.currentNode;
          if (!N(c, o, t, e)) {
            c === a && c.length > d && c.splitText(d), c === r && l && (c = c.splitText(l), a === r ? (a = c, d -= l) : a === r.parentNode && (d += 1), r = c, l = 0);
            let u = m(t, e);
            k(c, u), u.appendChild(c);
          }
        } while (s.nextNode());
        n = Q(r, l, a, d);
      }
      return n;
    }
    _removeFormat(t, e, n, o) {
      this._saveRangeToBookmark(n);
      let s;
      n.collapsed && (oe ? s = document.createTextNode("​") : s = document.createTextNode(""), Z(n, s));
      let r = n.commonAncestorContainer;
      for (;g(r); )
        r = r.parentNode;
      let { startContainer: l, startOffset: a, endContainer: d, endOffset: c } = n, f = [], u = (h, E) => {
        if (z(n, h, false))
          return;
        let R, O;
        if (!z(n, h, true)) {
          !(h instanceof HTMLInputElement) && (!(h instanceof Text) || h.data) && f.push([E, h]);
          return;
        }
        if (h instanceof Text)
          h === d && c !== h.length && f.push([E, h.splitText(c)]), h === l && a && (h.splitText(a), f.push([E, h]));
        else
          for (R = h.firstChild;R; R = O)
            O = R.nextSibling, u(R, E);
      }, p = Array.from(r.getElementsByTagName(t)).filter((h) => z(n, h, true) && pe(h, t, e));
      if (o || p.forEach((h) => {
        u(h, h);
      }), f.forEach(([h, E]) => {
        h = h.cloneNode(false), k(E, h), h.appendChild(E);
      }), p.forEach((h) => {
        k(h, _(h));
      }), oe && s) {
        s = s.parentNode;
        let h = s;
        for (;h && g(h); )
          h = h.parentNode;
        h && le(h, s);
      }
      return this._getRangeAndRemoveBookmark(n), s && n.collapse(false), ne(r, n), n;
    }
    bold() {
      return this.changeFormat({ tag: "B" });
    }
    removeBold() {
      return this.changeFormat(null, { tag: "B" });
    }
    italic() {
      return this.changeFormat({ tag: "I" });
    }
    removeItalic() {
      return this.changeFormat(null, { tag: "I" });
    }
    underline() {
      return this.changeFormat({ tag: "U" });
    }
    removeUnderline() {
      return this.changeFormat(null, { tag: "U" });
    }
    strikethrough() {
      return this.changeFormat({ tag: "S" });
    }
    removeStrikethrough() {
      return this.changeFormat(null, { tag: "S" });
    }
    subscript() {
      return this.changeFormat({ tag: "SUB" }, { tag: "SUP" });
    }
    removeSubscript() {
      return this.changeFormat(null, { tag: "SUB" });
    }
    superscript() {
      return this.changeFormat({ tag: "SUP" }, { tag: "SUB" });
    }
    removeSuperscript() {
      return this.changeFormat(null, { tag: "SUP" });
    }
    makeLink(t, e) {
      let n = this.getSelection();
      if (n.collapsed) {
        let o = t.indexOf(":") + 1;
        if (o)
          for (;t[o] === "/"; )
            o += 1;
        Z(n, document.createTextNode(t.slice(o)));
      }
      return e = Object.assign({ href: t }, this._config.tagAttributes.a, e), this.changeFormat({ tag: "A", attributes: e }, { tag: "A" }, n);
    }
    removeLink() {
      return this.changeFormat(null, { tag: "A" }, this.getSelection(), true);
    }
    addDetectedLinks(t, e) {
      let n = new T(t, 4, (l) => !N(l, e || this._root, "A")), o = this.linkRegExp, s = this._config.tagAttributes.a, r;
      for (;r = n.nextNode(); ) {
        let l = r.parentNode, a = r.data, d;
        for (;d = o.exec(a); ) {
          let c = d.index, f = c + d[0].length;
          c && l.insertBefore(document.createTextNode(a.slice(0, c)), r);
          let u = m("A", Object.assign({ href: d[1] ? /^(?:ht|f)tps?:/i.test(d[1]) ? d[1] : "http://" + d[1] : "mailto:" + d[0] }, s));
          u.textContent = a.slice(c, f), l.insertBefore(u, r), r.data = a = a.slice(f);
        }
      }
      return this;
    }
    setFontFace(t) {
      let e = this._config.classNames.fontFamily;
      return this.changeFormat(t ? { tag: "SPAN", attributes: { class: e, style: "font-family: " + t + ", sans-serif;" } } : null, { tag: "SPAN", attributes: { class: e } });
    }
    setFontSize(t) {
      let e = this._config.classNames.fontSize;
      return this.changeFormat(t ? { tag: "SPAN", attributes: { class: e, style: "font-size: " + (typeof t == "number" ? t + "px" : t) } } : null, { tag: "SPAN", attributes: { class: e } });
    }
    setTextColor(t) {
      let e = this._config.classNames.color;
      return this.changeFormat(t ? { tag: "SPAN", attributes: { class: e, style: "color:" + t } } : null, { tag: "SPAN", attributes: { class: e } });
    }
    setHighlightColor(t) {
      let e = this._config.classNames.highlight;
      return this.changeFormat(t ? { tag: "SPAN", attributes: { class: e, style: "background-color:" + t } } : null, { tag: "SPAN", attributes: { class: e } });
    }
    _ensureBottomLine() {
      let t = this._root, e = t.lastElementChild;
      (!e || e.nodeName !== this._config.blockTag || !q(e)) && t.appendChild(this.createDefaultBlock());
    }
    createDefaultBlock(t) {
      let e = this._config;
      return x(m(e.blockTag, e.blockAttributes, t));
    }
    splitBlock(t, e) {
      e || (e = this.getSelection());
      let n = this._root, o, s, r, l;
      if (this._recordUndoState(e), this._removeZWS(), this._getRangeAndRemoveBookmark(e), e.collapsed || F(e, n), this._config.addLinks) {
        C(e);
        let u = e.startContainer, p = e.startOffset;
        setTimeout(() => {
          Ce(this, u, p);
        }, 0);
      }
      if (o = v(e, n), o && (s = N(o, n, "PRE"))) {
        C(e), r = e.startContainer;
        let u = e.startOffset;
        return r instanceof Text || (r = document.createTextNode(""), s.insertBefore(r, s.firstChild), u = 0), !t && r instanceof Text && (r.data.charAt(u - 1) === `
` || j(e, n)) && (r.data.charAt(u) === `
` || G(e, n)) ? (r.deleteData(u && u - 1, u ? 2 : 1), l = I(r, u && u - 1, n, n), r = l.previousSibling, r.textContent || S(r), r = this.createDefaultBlock(), l.parentNode.insertBefore(r, l), l.textContent || S(l), e.setStart(r, 0)) : (r.insertData(u, `
`), r.nextSibling || s.appendChild(m("BR")), r.length === u + 1 ? e.setStartAfter(r) : e.setStart(r, u + 1)), e.collapse(true), this.setSelection(e), this._updatePath(e, true), this._docWasChanged(), this;
      }
      if (!o || t || /^T[HD]$/.test(o.nodeName))
        return Be(e, "A", n), Z(e, m("BR")), e.collapse(false), this.setSelection(e), this._updatePath(e, true), this;
      if ((s = N(o, n, "LI")) && (o = s), de(o)) {
        if (N(o, n, "UL") || N(o, n, "OL"))
          return this.decreaseListLevel(e), this;
        if (N(o, n, "BLOCKQUOTE"))
          return this.replaceWithBlankLine(e), this;
      }
      r = e.startContainer;
      let a = e.startOffset, d = this.tagAfterSplit[o.nodeName];
      l = I(r, a, o.parentNode, this._root);
      let c = this._config, f = null;
      for (d || (d = c.blockTag, f = c.blockAttributes), pe(l, d, f) || (o = m(d, f), l.dir && (o.dir = l.dir), k(l, o), o.appendChild(_(l)), l = o), le(o), Ee(o), x(o);l instanceof Element; ) {
        let u = l.firstChild, p;
        if (l.nodeName === "A" && (!l.textContent || l.textContent === "​")) {
          u = document.createTextNode(""), k(l, u), l = u;
          break;
        }
        for (;u && u instanceof Text && !u.data && (p = u.nextSibling, !(!p || p.nodeName === "BR")); )
          S(u), u = p;
        if (!u || u.nodeName === "BR" || u instanceof Text)
          break;
        l = u;
      }
      return e = Q(l, 0), this.setSelection(e), this._updatePath(e, true), this;
    }
    forEachBlock(t, e, n) {
      n || (n = this.getSelection()), e && this.saveUndoState(n);
      let o = this._root, s = v(n, o), r = $(n, o);
      if (s && r)
        do
          if (t(s) || s === r)
            break;
        while (s = M(s, o));
      return e && (this.setSelection(n), this._updatePath(n, true)), this;
    }
    modifyBlocks(t, e) {
      e || (e = this.getSelection()), this._recordUndoState(e, this._isInUndoState);
      let n = this._root;
      Ae(e, n), K(e, n, n, n);
      let o = we(e, n, n);
      if (!e.collapsed) {
        let s = e.endContainer;
        if (s === n)
          e.collapse(false);
        else {
          for (;s.parentNode !== n; )
            s = s.parentNode;
          e.setStartBefore(s), e.collapse(true);
        }
      }
      return Z(e, t.call(this, o)), e.endOffset < e.endContainer.childNodes.length && P(e.endContainer.childNodes[e.endOffset], n), P(e.startContainer.childNodes[e.startOffset], n), this._getRangeAndRemoveBookmark(e), this.setSelection(e), this._updatePath(e, true), this;
    }
    setTextAlignment(t) {
      return this.forEachBlock((e) => {
        let n = e.className.split(/\s+/).filter((o) => !!o && !/^align/.test(o)).join(" ");
        t ? (e.className = n + " align-" + t, e.style.textAlign = t) : (e.className = n, e.style.textAlign = "");
      }, true), this.focus();
    }
    setTextDirection(t) {
      return this.forEachBlock((e) => {
        t ? e.dir = t : e.removeAttribute("dir");
      }, true), this.focus();
    }
    _getListSelection(t, e) {
      let { commonAncestorContainer: n, startContainer: o, endContainer: s } = t;
      for (;n && n !== e && !/^[OU]L$/.test(n.nodeName); )
        n = n.parentNode;
      if (!n || n === e)
        return null;
      for (o === n && (o = o.childNodes[t.startOffset]), s === n && (s = s.childNodes[t.endOffset]);o && o.parentNode !== n; )
        o = o.parentNode;
      for (;s && s.parentNode !== n; )
        s = s.parentNode;
      return [n, o, s];
    }
    increaseListLevel(t) {
      t || (t = this.getSelection());
      let e = this._root, n = this._getListSelection(t, e);
      if (!n)
        return this.focus();
      let [o, s, r] = n;
      if (!s || s === o.firstChild)
        return this.focus();
      this._recordUndoState(t, this._isInUndoState);
      let l = o.nodeName, a = s.previousSibling, d, c;
      a.nodeName !== l && (d = this._config.tagAttributes[l.toLowerCase()], a = m(l, d), o.insertBefore(a, s));
      do
        c = s === r ? null : s.nextSibling, a.appendChild(s);
      while (s = c);
      return c = a.nextSibling, c && P(c, e), this._getRangeAndRemoveBookmark(t), this.setSelection(t), this._updatePath(t, true), this.focus();
    }
    decreaseListLevel(t) {
      t || (t = this.getSelection());
      let e = this._root, n = this._getListSelection(t, e);
      if (!n)
        return this.focus();
      let [o, s, r] = n;
      s || (s = o.firstChild), r || (r = o.lastChild), this._recordUndoState(t, this._isInUndoState);
      let l, a = null;
      if (s) {
        let d = o.parentNode;
        if (a = r.nextSibling ? I(o, r.nextSibling, d, e) : o.nextSibling, d !== e && d.nodeName === "LI") {
          for (d = d.parentNode;a; )
            l = a.nextSibling, r.appendChild(a), a = l;
          a = o.parentNode.nextSibling;
        }
        let c = !/^[OU]L$/.test(d.nodeName);
        do
          l = s === r ? null : s.nextSibling, o.removeChild(s), c && s.nodeName === "LI" && (s = this.createDefaultBlock([_(s)])), d.insertBefore(s, a);
        while (s = l);
      }
      return o.firstChild || S(o), a && P(a, e), this._getRangeAndRemoveBookmark(t), this.setSelection(t), this._updatePath(t, true), this.focus();
    }
    _makeList(t, e) {
      let n = ce(t, this._root), o = this._config.tagAttributes, s = o[e.toLowerCase()], r = o.li, l;
      for (;l = n.nextNode(); )
        if (l.parentNode instanceof HTMLLIElement && (l = l.parentNode, n.currentNode = l.lastChild), l instanceof HTMLLIElement) {
          l = l.parentNode;
          let a = l.nodeName;
          a !== e && /^[OU]L$/.test(a) && k(l, m(e, s, [_(l)]));
        } else {
          let a = m("LI", r);
          l.dir && (a.dir = l.dir);
          let d = l.previousSibling;
          d && d.nodeName === e ? (d.appendChild(a), S(l)) : k(l, m(e, s, [a])), a.appendChild(_(l)), n.currentNode = a;
        }
      return t;
    }
    makeUnorderedList() {
      return this.modifyBlocks((t) => this._makeList(t, "UL")), this.focus();
    }
    makeOrderedList() {
      return this.modifyBlocks((t) => this._makeList(t, "OL")), this.focus();
    }
    removeList() {
      return this.modifyBlocks((t) => {
        let e = t.querySelectorAll("UL, OL"), n = t.querySelectorAll("LI"), o = this._root;
        for (let s = 0, r = e.length;s < r; s += 1) {
          let l = e[s], a = _(l);
          D(a, o), k(l, a);
        }
        for (let s = 0, r = n.length;s < r; s += 1) {
          let l = n[s];
          q(l) ? k(l, this.createDefaultBlock([_(l)])) : (D(l, o), k(l, _(l)));
        }
        return t;
      }), this.focus();
    }
    increaseQuoteLevel(t) {
      return this.modifyBlocks((e) => m("BLOCKQUOTE", this._config.tagAttributes.blockquote, [e]), t), this.focus();
    }
    decreaseQuoteLevel(t) {
      return this.modifyBlocks((e) => (Array.from(e.querySelectorAll("blockquote")).filter((n) => !N(n.parentNode, e, "BLOCKQUOTE")).forEach((n) => {
        k(n, _(n));
      }), e), t), this.focus();
    }
    removeQuote(t) {
      return this.modifyBlocks((e) => (Array.from(e.querySelectorAll("blockquote")).forEach((n) => {
        k(n, _(n));
      }), e), t), this.focus();
    }
    replaceWithBlankLine(t) {
      return this.modifyBlocks(() => this.createDefaultBlock([m("INPUT", { id: this.startSelectionId, type: "hidden" }), m("INPUT", { id: this.endSelectionId, type: "hidden" })]), t), this.focus();
    }
    code() {
      let t = this.getSelection();
      return t.collapsed || X(t.commonAncestorContainer) ? (this.modifyBlocks((e) => {
        let n = this._root, o = document.createDocumentFragment(), s = ce(e, n), r;
        for (;r = s.nextNode(); ) {
          let a = r.querySelectorAll("BR"), d = [], c = a.length;
          for (let f = 0;f < c; f += 1)
            d[f] = te(a[f], false);
          for (;c--; ) {
            let f = a[c];
            d[c] ? k(f, document.createTextNode(`
`)) : S(f);
          }
          for (a = r.querySelectorAll("CODE"), c = a.length;c--; )
            k(a[c], _(a[c]));
          o.childNodes.length && o.appendChild(document.createTextNode(`
`)), o.appendChild(_(r));
        }
        let l = new T(o, 4);
        for (;r = l.nextNode(); )
          r.data = r.data.replace(/ /g, " ");
        return o.normalize(), x(m("PRE", this._config.tagAttributes.pre, [o]));
      }, t), this.focus()) : this.changeFormat({ tag: "CODE", attributes: this._config.tagAttributes.code }, null, t), this;
    }
    removeCode() {
      let t = this.getSelection(), e = t.commonAncestorContainer;
      return N(e, this._root, "PRE") ? (this.modifyBlocks((o) => {
        let s = this._root, r = o.querySelectorAll("PRE"), l = r.length;
        for (;l--; ) {
          let a = r[l], d = new T(a, 4), c;
          for (;c = d.nextNode(); ) {
            let f = c.data;
            f = f.replace(/ (?= )/g, " ");
            let u = document.createDocumentFragment(), p;
            for (;(p = f.indexOf(`
`)) > -1; )
              u.appendChild(document.createTextNode(f.slice(0, p))), u.appendChild(m("BR")), f = f.slice(p + 1);
            c.parentNode.insertBefore(u, c), c.data = f;
          }
          D(a, s), k(a, _(a));
        }
        return o;
      }, t), this.focus()) : this.changeFormat(null, { tag: "CODE" }, t), this;
    }
    toggleCode() {
      return this.hasFormat("PRE") || this.hasFormat("CODE") ? this.removeCode() : this.code(), this;
    }
    _removeFormatting(t, e) {
      for (let n = t.firstChild, o;n; n = o) {
        if (o = n.nextSibling, g(n)) {
          if (n instanceof Text || n.nodeName === "BR" || n.nodeName === "IMG") {
            e.appendChild(n);
            continue;
          }
        } else if (q(n)) {
          e.appendChild(this.createDefaultBlock([this._removeFormatting(n, document.createDocumentFragment())]));
          continue;
        }
        this._removeFormatting(n, e);
      }
      return e;
    }
    removeAllFormatting(t) {
      if (t || (t = this.getSelection()), t.collapsed)
        return this.focus();
      let e = this._root, n = t.commonAncestorContainer;
      for (;n && !q(n); )
        n = n.parentNode;
      if (n || (Ae(t, e), n = e), n instanceof Text)
        return this.focus();
      this.saveUndoState(t), K(t, n, n, e);
      let o = t.startContainer, s = t.startOffset, r = t.endContainer, l = t.endOffset, a = document.createDocumentFragment(), d = document.createDocumentFragment(), c = I(r, l, n, e), f = I(o, s, n, e), u;
      for (;f !== c; )
        u = f.nextSibling, a.appendChild(f), f = u;
      if (this._removeFormatting(a, d), d.normalize(), f = d.firstChild, u = d.lastChild, f) {
        n.insertBefore(d, c);
        let p = Array.from(n.childNodes);
        s = p.indexOf(f), l = u ? p.indexOf(u) + 1 : 0;
      } else
        c && (s = Array.from(n.childNodes).indexOf(c), l = s);
      return t.setStart(n, s), t.setEnd(n, l), ne(n, t), C(t), this.setSelection(t), this._updatePath(t, true), this.focus();
    }
  };
  var Ji = xe;

  // node_modules/dompurify/dist/purify.es.mjs
  /*! @license DOMPurify 3.4.16 | (c) Cure53 and other contributors | Released under the Apache license 2.0 and Mozilla Public License 2.0 | github.com/cure53/DOMPurify/blob/3.4.16/LICENSE */
  function _OverloadYield(e, d) {
    this.v = e, this.k = d;
  }
  function _arrayLikeToArray(r, a) {
    (a == null || a > r.length) && (a = r.length);
    for (var e = 0, n = Array(a);e < a; e++)
      n[e] = r[e];
    return n;
  }
  function _arrayWithHoles(r) {
    if (Array.isArray(r))
      return r;
  }
  function _iterableToArrayLimit(r, l) {
    var t = r == null ? null : typeof Symbol != "undefined" && r[Symbol.iterator] || r["@@iterator"];
    if (t != null) {
      var e, n, i, u, a = [], f = true, o = false;
      try {
        if (i = (t = t.call(r)).next, l === 0) {
          if (Object(t) !== t)
            return;
          f = false;
        } else
          for (;!(f = (e = i.call(t)).done) && (a.push(e.value), a.length !== l); f = true)
            ;
      } catch (r) {
        o = true, n = r;
      } finally {
        try {
          if (!f && t.return != null && (u = t.return(), Object(u) !== u))
            return;
        } finally {
          if (o)
            throw n;
        }
      }
      return a;
    }
  }
  function _nonIterableRest() {
    throw new TypeError(`Invalid attempt to destructure non-iterable instance.
In order to be iterable, non-array objects must have a [Symbol.iterator]() method.`);
  }
  /*! regenerator-runtime -- Copyright (c) 2014-present, Facebook, Inc. -- license (MIT): https://github.com/babel/babel/blob/main/packages/babel-helpers/LICENSE */
  function _slicedToArray(r, e) {
    return _arrayWithHoles(r) || _iterableToArrayLimit(r, e) || _unsupportedIterableToArray(r, e) || _nonIterableRest();
  }
  function _unsupportedIterableToArray(r, a) {
    if (r) {
      if (typeof r == "string")
        return _arrayLikeToArray(r, a);
      var t = {}.toString.call(r).slice(8, -1);
      return t === "Object" && r.constructor && (t = r.constructor.name), t === "Map" || t === "Set" ? Array.from(r) : t === "Arguments" || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(t) ? _arrayLikeToArray(r, a) : undefined;
    }
  }
  function AsyncGenerator(e) {
    var t, n;
    function resume(t, n) {
      try {
        var r = e[t](n), o = r.value, u = o instanceof _OverloadYield;
        Promise.resolve(u ? o.v : o).then(function(n) {
          if (u) {
            var i = t === "return" && o.k ? t : "next";
            if (!o.k || n.done)
              return resume(i, n);
            n = e[i](n).value;
          }
          settle(!!r.done, n);
        }, function(e) {
          resume("throw", e);
        });
      } catch (e) {
        settle(2, e);
      }
    }
    function settle(e, r) {
      e === 2 ? t.reject(r) : t.resolve({
        value: r,
        done: e
      }), (t = t.next) ? resume(t.key, t.arg) : n = null;
    }
    this._invoke = function(e, r) {
      return new Promise(function(o, u) {
        var i = {
          key: e,
          arg: r,
          resolve: o,
          reject: u,
          next: null
        };
        n ? n = n.next = i : (t = n = i, resume(e, r));
      });
    }, typeof e.return != "function" && (this.return = undefined);
  }
  AsyncGenerator.prototype[typeof Symbol == "function" && Symbol.asyncIterator || "@@asyncIterator"] = function() {
    return this;
  }, AsyncGenerator.prototype.next = function(e) {
    return this._invoke("next", e);
  }, AsyncGenerator.prototype.throw = function(e) {
    return this._invoke("throw", e);
  }, AsyncGenerator.prototype.return = function(e) {
    return this._invoke("return", e);
  };
  var entries = Object.entries;
  var setPrototypeOf = Object.setPrototypeOf;
  var isFrozen = Object.isFrozen;
  var getPrototypeOf = Object.getPrototypeOf;
  var getOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
  var freeze = Object.freeze;
  var seal = Object.seal;
  var create = Object.create;
  var _ref = typeof Reflect !== "undefined" && Reflect;
  var apply = _ref.apply;
  var construct = _ref.construct;
  if (!freeze)
    freeze = function freeze(x) {
      return x;
    };
  if (!seal)
    seal = function seal(x) {
      return x;
    };
  if (!apply)
    apply = function apply(func, thisArg) {
      for (var _len = arguments.length, args = new Array(_len > 2 ? _len - 2 : 0), _key = 2;_key < _len; _key++)
        args[_key - 2] = arguments[_key];
      return func.apply(thisArg, args);
    };
  if (!construct)
    construct = function construct(Func) {
      for (var _len2 = arguments.length, args = new Array(_len2 > 1 ? _len2 - 1 : 0), _key2 = 1;_key2 < _len2; _key2++)
        args[_key2 - 1] = arguments[_key2];
      return new Func(...args);
    };
  var arrayForEach = unapply(Array.prototype.forEach);
  Array.prototype.indexOf;
  var arrayLastIndexOf = unapply(Array.prototype.lastIndexOf);
  var arrayPop = unapply(Array.prototype.pop);
  var arrayPush = unapply(Array.prototype.push);
  Array.prototype.slice;
  var arraySplice = unapply(Array.prototype.splice);
  var arrayIsArray = Array.isArray;
  var stringToLowerCase = unapply(String.prototype.toLowerCase);
  var stringToString = unapply(String.prototype.toString);
  var stringMatch = unapply(String.prototype.match);
  var stringReplace = unapply(String.prototype.replace);
  var stringIndexOf = unapply(String.prototype.indexOf);
  var stringTrim = unapply(String.prototype.trim);
  var numberToString = unapply(Number.prototype.toString);
  var booleanToString = unapply(Boolean.prototype.toString);
  var bigintToString = typeof BigInt === "undefined" ? null : unapply(BigInt.prototype.toString);
  var symbolToString = typeof Symbol === "undefined" ? null : unapply(Symbol.prototype.toString);
  var objectHasOwnProperty = unapply(Object.prototype.hasOwnProperty);
  var objectToString = unapply(Object.prototype.toString);
  var regExpTest = unapply(RegExp.prototype.test);
  var typeErrorCreate = unconstruct(TypeError);
  function unapply(func) {
    return function(thisArg) {
      if (thisArg instanceof RegExp)
        thisArg.lastIndex = 0;
      for (var _len3 = arguments.length, args = new Array(_len3 > 1 ? _len3 - 1 : 0), _key3 = 1;_key3 < _len3; _key3++)
        args[_key3 - 1] = arguments[_key3];
      return apply(func, thisArg, args);
    };
  }
  function unconstruct(Func) {
    return function() {
      for (var _len4 = arguments.length, args = new Array(_len4), _key4 = 0;_key4 < _len4; _key4++)
        args[_key4] = arguments[_key4];
      return construct(Func, args);
    };
  }
  function addToSet(set, array) {
    let transformCaseFunc = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : stringToLowerCase;
    if (setPrototypeOf)
      setPrototypeOf(set, null);
    if (!arrayIsArray(array))
      return set;
    let l = array.length;
    while (l--) {
      let element = array[l];
      if (typeof element === "string") {
        const lcElement = transformCaseFunc(element);
        if (lcElement !== element) {
          if (!isFrozen(array))
            array[l] = lcElement;
          element = lcElement;
        }
      }
      set[element] = true;
    }
    return set;
  }
  function cleanArray(array) {
    for (let index = 0;index < array.length; index++)
      if (!objectHasOwnProperty(array, index))
        array[index] = null;
    return array;
  }
  function clone(object) {
    const newObject = create(null);
    for (const _ref2 of entries(object)) {
      var _ref3 = _slicedToArray(_ref2, 2);
      const property = _ref3[0];
      const value = _ref3[1];
      if (objectHasOwnProperty(object, property)) {
        if (arrayIsArray(value))
          newObject[property] = cleanArray(value);
        else if (value && typeof value === "object" && value.constructor === Object)
          newObject[property] = clone(value);
        else
          newObject[property] = value;
      }
    }
    return newObject;
  }
  function stringifyValue(value) {
    switch (typeof value) {
      case "string":
        return value;
      case "number":
        return numberToString(value);
      case "boolean":
        return booleanToString(value);
      case "bigint":
        return bigintToString ? bigintToString(value) : "0";
      case "symbol":
        return symbolToString ? symbolToString(value) : "Symbol()";
      case "undefined":
        return objectToString(value);
      case "function":
      case "object": {
        if (value === null)
          return objectToString(value);
        const valueAsRecord = value;
        const valueToString = lookupGetter(valueAsRecord, "toString");
        if (typeof valueToString === "function") {
          const stringified = valueToString(valueAsRecord);
          return typeof stringified === "string" ? stringified : objectToString(stringified);
        }
        return objectToString(value);
      }
      default:
        return objectToString(value);
    }
  }
  function lookupGetter(object, prop) {
    while (object !== null) {
      const desc = getOwnPropertyDescriptor(object, prop);
      if (desc) {
        if (desc.get)
          return unapply(desc.get);
        if (typeof desc.value === "function")
          return unapply(desc.value);
      }
      object = getPrototypeOf(object);
    }
    function fallbackValue() {
      return null;
    }
    return fallbackValue;
  }
  function isRegex(value) {
    try {
      regExpTest(value, "");
      return true;
    } catch (_unused) {
      return false;
    }
  }
  var html$1 = freeze([
    "a",
    "abbr",
    "acronym",
    "address",
    "area",
    "article",
    "aside",
    "audio",
    "b",
    "bdi",
    "bdo",
    "big",
    "blink",
    "blockquote",
    "body",
    "br",
    "button",
    "canvas",
    "caption",
    "center",
    "cite",
    "code",
    "col",
    "colgroup",
    "content",
    "data",
    "datalist",
    "dd",
    "decorator",
    "del",
    "details",
    "dfn",
    "dialog",
    "dir",
    "div",
    "dl",
    "dt",
    "element",
    "em",
    "fieldset",
    "figcaption",
    "figure",
    "font",
    "footer",
    "form",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "head",
    "header",
    "hgroup",
    "hr",
    "html",
    "i",
    "img",
    "input",
    "ins",
    "kbd",
    "label",
    "legend",
    "li",
    "main",
    "map",
    "mark",
    "marquee",
    "menu",
    "menuitem",
    "meter",
    "nav",
    "nobr",
    "ol",
    "optgroup",
    "option",
    "output",
    "p",
    "picture",
    "pre",
    "progress",
    "q",
    "rp",
    "rt",
    "ruby",
    "s",
    "samp",
    "search",
    "section",
    "select",
    "shadow",
    "slot",
    "small",
    "source",
    "spacer",
    "span",
    "strike",
    "strong",
    "style",
    "sub",
    "summary",
    "sup",
    "table",
    "tbody",
    "td",
    "template",
    "textarea",
    "tfoot",
    "th",
    "thead",
    "time",
    "tr",
    "track",
    "tt",
    "u",
    "ul",
    "var",
    "video",
    "wbr"
  ]);
  var svg$1 = freeze([
    "svg",
    "a",
    "altglyph",
    "altglyphdef",
    "altglyphitem",
    "animatecolor",
    "animatemotion",
    "animatetransform",
    "circle",
    "clippath",
    "defs",
    "desc",
    "ellipse",
    "enterkeyhint",
    "exportparts",
    "filter",
    "font",
    "g",
    "glyph",
    "glyphref",
    "hkern",
    "image",
    "inputmode",
    "line",
    "lineargradient",
    "marker",
    "mask",
    "metadata",
    "mpath",
    "part",
    "path",
    "pattern",
    "polygon",
    "polyline",
    "radialgradient",
    "rect",
    "stop",
    "style",
    "switch",
    "symbol",
    "text",
    "textpath",
    "title",
    "tref",
    "tspan",
    "view",
    "vkern"
  ]);
  var svgFilters = freeze([
    "feBlend",
    "feColorMatrix",
    "feComponentTransfer",
    "feComposite",
    "feConvolveMatrix",
    "feDiffuseLighting",
    "feDisplacementMap",
    "feDistantLight",
    "feDropShadow",
    "feFlood",
    "feFuncA",
    "feFuncB",
    "feFuncG",
    "feFuncR",
    "feGaussianBlur",
    "feImage",
    "feMerge",
    "feMergeNode",
    "feMorphology",
    "feOffset",
    "fePointLight",
    "feSpecularLighting",
    "feSpotLight",
    "feTile",
    "feTurbulence"
  ]);
  var svgDisallowed = freeze([
    "animate",
    "color-profile",
    "cursor",
    "discard",
    "font-face",
    "font-face-format",
    "font-face-name",
    "font-face-src",
    "font-face-uri",
    "foreignobject",
    "hatch",
    "hatchpath",
    "mesh",
    "meshgradient",
    "meshpatch",
    "meshrow",
    "missing-glyph",
    "script",
    "set",
    "solidcolor",
    "unknown",
    "use"
  ]);
  var mathMl$1 = freeze([
    "math",
    "menclose",
    "merror",
    "mfenced",
    "mfrac",
    "mglyph",
    "mi",
    "mlabeledtr",
    "mmultiscripts",
    "mn",
    "mo",
    "mover",
    "mpadded",
    "mphantom",
    "mroot",
    "mrow",
    "ms",
    "mspace",
    "msqrt",
    "mstyle",
    "msub",
    "msup",
    "msubsup",
    "mtable",
    "mtd",
    "mtext",
    "mtr",
    "munder",
    "munderover",
    "mprescripts"
  ]);
  var mathMlDisallowed = freeze([
    "maction",
    "maligngroup",
    "malignmark",
    "mlongdiv",
    "mscarries",
    "mscarry",
    "msgroup",
    "mstack",
    "msline",
    "msrow",
    "semantics",
    "annotation",
    "annotation-xml",
    "mprescripts",
    "none"
  ]);
  var text = freeze(["#text"]);
  var html = freeze([
    "accept",
    "action",
    "align",
    "alt",
    "autocapitalize",
    "autocomplete",
    "autopictureinpicture",
    "autoplay",
    "background",
    "bgcolor",
    "border",
    "capture",
    "cellpadding",
    "cellspacing",
    "checked",
    "cite",
    "class",
    "clear",
    "color",
    "cols",
    "colspan",
    "command",
    "commandfor",
    "controls",
    "controlslist",
    "coords",
    "crossorigin",
    "datetime",
    "decoding",
    "default",
    "dir",
    "disabled",
    "disablepictureinpicture",
    "disableremoteplayback",
    "download",
    "draggable",
    "enctype",
    "enterkeyhint",
    "exportparts",
    "face",
    "for",
    "headers",
    "height",
    "hidden",
    "high",
    "href",
    "hreflang",
    "id",
    "inert",
    "inputmode",
    "integrity",
    "ismap",
    "kind",
    "label",
    "lang",
    "list",
    "loading",
    "loop",
    "low",
    "max",
    "maxlength",
    "media",
    "method",
    "min",
    "minlength",
    "multiple",
    "muted",
    "name",
    "nonce",
    "noshade",
    "novalidate",
    "nowrap",
    "open",
    "optimum",
    "part",
    "pattern",
    "placeholder",
    "playsinline",
    "popover",
    "popovertarget",
    "popovertargetaction",
    "poster",
    "preload",
    "pubdate",
    "radiogroup",
    "readonly",
    "rel",
    "required",
    "rev",
    "reversed",
    "role",
    "rows",
    "rowspan",
    "spellcheck",
    "scope",
    "selected",
    "shape",
    "size",
    "sizes",
    "slot",
    "span",
    "srclang",
    "start",
    "src",
    "srcset",
    "step",
    "style",
    "summary",
    "tabindex",
    "title",
    "translate",
    "type",
    "usemap",
    "valign",
    "value",
    "width",
    "wrap",
    "xmlns"
  ]);
  var svg = freeze([
    "accent-height",
    "accumulate",
    "additive",
    "alignment-baseline",
    "amplitude",
    "ascent",
    "attributename",
    "attributetype",
    "azimuth",
    "basefrequency",
    "baseline-shift",
    "begin",
    "bias",
    "by",
    "class",
    "clip",
    "clippathunits",
    "clip-path",
    "clip-rule",
    "color",
    "color-interpolation",
    "color-interpolation-filters",
    "color-profile",
    "color-rendering",
    "cx",
    "cy",
    "d",
    "dx",
    "dy",
    "diffuseconstant",
    "direction",
    "display",
    "divisor",
    "dominant-baseline",
    "dur",
    "edgemode",
    "elevation",
    "end",
    "exponent",
    "fill",
    "fill-opacity",
    "fill-rule",
    "filter",
    "filterunits",
    "flood-color",
    "flood-opacity",
    "font-family",
    "font-size",
    "font-size-adjust",
    "font-stretch",
    "font-style",
    "font-variant",
    "font-weight",
    "fx",
    "fy",
    "g1",
    "g2",
    "glyph-name",
    "glyphref",
    "gradientunits",
    "gradienttransform",
    "height",
    "href",
    "id",
    "image-rendering",
    "in",
    "in2",
    "intercept",
    "k",
    "k1",
    "k2",
    "k3",
    "k4",
    "kerning",
    "keypoints",
    "keysplines",
    "keytimes",
    "lang",
    "lengthadjust",
    "letter-spacing",
    "kernelmatrix",
    "kernelunitlength",
    "lighting-color",
    "local",
    "marker-end",
    "marker-mid",
    "marker-start",
    "markerheight",
    "markerunits",
    "markerwidth",
    "maskcontentunits",
    "maskunits",
    "max",
    "mask",
    "mask-type",
    "media",
    "method",
    "mode",
    "min",
    "name",
    "numoctaves",
    "offset",
    "operator",
    "opacity",
    "order",
    "orient",
    "orientation",
    "origin",
    "overflow",
    "paint-order",
    "path",
    "pathlength",
    "patterncontentunits",
    "patterntransform",
    "patternunits",
    "pointer-events",
    "points",
    "preservealpha",
    "preserveaspectratio",
    "primitiveunits",
    "r",
    "rx",
    "ry",
    "radius",
    "refx",
    "refy",
    "repeatcount",
    "repeatdur",
    "restart",
    "result",
    "rotate",
    "scale",
    "seed",
    "shape-rendering",
    "slope",
    "specularconstant",
    "specularexponent",
    "spreadmethod",
    "startoffset",
    "stddeviation",
    "stitchtiles",
    "stop-color",
    "stop-opacity",
    "stroke-dasharray",
    "stroke-dashoffset",
    "stroke-linecap",
    "stroke-linejoin",
    "stroke-miterlimit",
    "stroke-opacity",
    "stroke",
    "stroke-width",
    "style",
    "surfacescale",
    "systemlanguage",
    "tabindex",
    "tablevalues",
    "targetx",
    "targety",
    "transform",
    "transform-origin",
    "text-anchor",
    "text-decoration",
    "text-orientation",
    "text-rendering",
    "textlength",
    "type",
    "u1",
    "u2",
    "unicode",
    "values",
    "vector-effect",
    "viewbox",
    "visibility",
    "version",
    "vert-adv-y",
    "vert-origin-x",
    "vert-origin-y",
    "width",
    "word-spacing",
    "wrap",
    "writing-mode",
    "xchannelselector",
    "ychannelselector",
    "x",
    "x1",
    "x2",
    "xmlns",
    "y",
    "y1",
    "y2",
    "z",
    "zoomandpan"
  ]);
  var mathMl = freeze([
    "accent",
    "accentunder",
    "align",
    "bevelled",
    "close",
    "columnalign",
    "columnlines",
    "columnspacing",
    "columnspan",
    "denomalign",
    "depth",
    "dir",
    "display",
    "displaystyle",
    "encoding",
    "fence",
    "frame",
    "height",
    "href",
    "id",
    "largeop",
    "length",
    "linethickness",
    "lquote",
    "lspace",
    "mathbackground",
    "mathcolor",
    "mathsize",
    "mathvariant",
    "maxsize",
    "minsize",
    "movablelimits",
    "notation",
    "numalign",
    "open",
    "rowalign",
    "rowlines",
    "rowspacing",
    "rowspan",
    "rspace",
    "rquote",
    "scriptlevel",
    "scriptminsize",
    "scriptsizemultiplier",
    "selection",
    "separator",
    "separators",
    "stretchy",
    "subscriptshift",
    "supscriptshift",
    "symmetric",
    "voffset",
    "width",
    "xmlns"
  ]);
  var xml = freeze([
    "xlink:href",
    "xml:id",
    "xlink:title",
    "xml:space",
    "xmlns:xlink"
  ]);
  var MUSTACHE_EXPR = seal(/{{[\w\W]*|^[\w\W]*}}/g);
  var ERB_EXPR = seal(/<%[\w\W]*|^[\w\W]*%>/g);
  var TMPLIT_EXPR = seal(/\${[\w\W]*/g);
  var DATA_ATTR = seal(/^data-[\-\w.\u00B7-\uFFFF]+$/);
  var ARIA_ATTR = seal(/^aria-[\-\w]+$/);
  var IS_ALLOWED_URI = seal(/^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|matrix):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i);
  var IS_SCRIPT_OR_DATA = seal(/^(?:\w+script|data):/i);
  var ATTR_WHITESPACE = seal(/[\u0000-\u0020\u00A0\u1680\u180E\u2000-\u2029\u205F\u3000]/g);
  var DOCTYPE_NAME = seal(/^html$/i);
  var CUSTOM_ELEMENT = seal(/^[a-z][.\w]*(-[.\w]+)+$/i);
  var ELEMENT_MARKUP_PROBE = seal(/<[/\w!]/g);
  var COMMENT_MARKUP_PROBE = seal(/<[/\w]/g);
  var FALLBACK_TAG_CLOSE = seal(/<\/no(script|embed|frames)/i);
  var SELF_CLOSING_TAG = seal(/\/>/i);
  var NODE_TYPE = {
    element: 1,
    attribute: 2,
    text: 3,
    cdataSection: 4,
    entityReference: 5,
    entityNode: 6,
    processingInstruction: 7,
    comment: 8,
    document: 9,
    documentType: 10,
    documentFragment: 11,
    notation: 12
  };
  var LITERAL_TEXT_ELEMENT_NAMES = [
    "style",
    "script",
    "xmp",
    "iframe",
    "noembed",
    "noframes",
    "plaintext",
    "noscript"
  ];
  var LITERAL_TEXT_ELEMENTS = freeze(addToSet({}, LITERAL_TEXT_ELEMENT_NAMES));
  var LITERAL_TEXT_CLOSE = function() {
    const map = {};
    arrayForEach(LITERAL_TEXT_ELEMENT_NAMES, (name) => {
      map[name] = seal(new RegExp("</" + name + "(?=[\\t\\n\\f\\r />])", "i"));
    });
    return freeze(map);
  }();
  var getGlobal = function getGlobal() {
    return typeof window === "undefined" ? null : window;
  };
  var _createTrustedTypesPolicy = function _createTrustedTypesPolicy(trustedTypes, purifyHostElement) {
    if (typeof trustedTypes !== "object" || typeof trustedTypes.createPolicy !== "function")
      return null;
    let suffix = null;
    const ATTR_NAME = "data-tt-policy-suffix";
    if (purifyHostElement && purifyHostElement.hasAttribute(ATTR_NAME))
      suffix = purifyHostElement.getAttribute(ATTR_NAME);
    const policyName = "dompurify" + (suffix ? "#" + suffix : "");
    try {
      return trustedTypes.createPolicy(policyName, {
        createHTML(html) {
          return html;
        },
        createScriptURL(scriptUrl) {
          return scriptUrl;
        }
      });
    } catch (_) {
      console.warn("TrustedTypes policy " + policyName + " could not be created.");
      return null;
    }
  };
  var _createHooksMap = function _createHooksMap() {
    return {
      afterSanitizeAttributes: [],
      afterSanitizeElements: [],
      afterSanitizeShadowDOM: [],
      beforeSanitizeAttributes: [],
      beforeSanitizeElements: [],
      beforeSanitizeShadowDOM: [],
      uponSanitizeAttribute: [],
      uponSanitizeElement: [],
      uponSanitizeShadowNode: []
    };
  };
  var _resolveSetOption = function _resolveSetOption(cfg, key, fallback, options) {
    return objectHasOwnProperty(cfg, key) && arrayIsArray(cfg[key]) ? addToSet(options.base ? clone(options.base) : {}, cfg[key], options.transform) : fallback;
  };
  var _resolveObjectOption = function _resolveObjectOption(cfg, key, makeFallback) {
    const value = objectHasOwnProperty(cfg, key) ? cfg[key] : undefined;
    return value && typeof value === "object" ? clone(value) : makeFallback();
  };
  function createDOMPurify() {
    let window2 = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : getGlobal();
    const DOMPurify2 = (root) => createDOMPurify(root);
    DOMPurify2.version = "3.4.16";
    DOMPurify2.removed = [];
    if (!window2 || !window2.document || window2.document.nodeType !== NODE_TYPE.document || !window2.Element) {
      DOMPurify2.isSupported = false;
      return DOMPurify2;
    }
    let document2 = window2.document;
    const originalDocument = document2;
    const currentScript = originalDocument.currentScript;
    window2.DocumentFragment;
    const { HTMLTemplateElement, Node: Node2, Element: Element2, NodeFilter } = window2;
    window2.NamedNodeMap === undefined && (window2.NamedNodeMap || window2.MozNamedAttrMap);
    window2.HTMLFormElement;
    const { DOMParser, trustedTypes } = window2;
    const ElementPrototype = Element2.prototype;
    const cloneNode = lookupGetter(ElementPrototype, "cloneNode");
    const remove = lookupGetter(ElementPrototype, "remove");
    const removeAttributeNode = lookupGetter(ElementPrototype, "removeAttributeNode");
    const getNextSibling = lookupGetter(ElementPrototype, "nextSibling");
    const getChildNodes = lookupGetter(ElementPrototype, "childNodes");
    const getParentNode = lookupGetter(ElementPrototype, "parentNode");
    const getShadowRoot = lookupGetter(ElementPrototype, "shadowRoot");
    const getAttributes = lookupGetter(ElementPrototype, "attributes");
    const getNodeType = Node2 && Node2.prototype ? lookupGetter(Node2.prototype, "nodeType") : null;
    const getNodeName = Node2 && Node2.prototype ? lookupGetter(Node2.prototype, "nodeName") : null;
    const getOwnerDocument = Node2 && Node2.prototype ? lookupGetter(Node2.prototype, "ownerDocument") : null;
    const _readNodeType = function _readNodeType(node) {
      return getNodeType ? getNodeType(node) : node.nodeType;
    };
    const _readNodeName = function _readNodeName(node) {
      return getNodeName ? getNodeName(node) : node.nodeName;
    };
    if (typeof HTMLTemplateElement === "function") {
      const template = document2.createElement("template");
      if (template.content && template.content.ownerDocument)
        document2 = template.content.ownerDocument;
    }
    let trustedTypesPolicy;
    let emptyHTML = "";
    let defaultTrustedTypesPolicy;
    let defaultTrustedTypesPolicyResolved = false;
    let IN_TRUSTED_TYPES_POLICY = 0;
    const _assertNotInTrustedTypesPolicy = function _assertNotInTrustedTypesPolicy() {
      if (IN_TRUSTED_TYPES_POLICY > 0)
        throw typeErrorCreate('A configured TRUSTED_TYPES_POLICY callback (createHTML or createScriptURL) must not call DOMPurify.sanitize, as that causes infinite recursion. Do not pass a policy whose callbacks wrap DOMPurify as TRUSTED_TYPES_POLICY; see the "DOMPurify and Trusted Types" section of the README.');
    };
    const _createTrustedHTML = function _createTrustedHTML(html) {
      _assertNotInTrustedTypesPolicy();
      IN_TRUSTED_TYPES_POLICY++;
      try {
        return trustedTypesPolicy.createHTML(html);
      } finally {
        IN_TRUSTED_TYPES_POLICY--;
      }
    };
    const _createTrustedScriptURL = function _createTrustedScriptURL(scriptUrl) {
      _assertNotInTrustedTypesPolicy();
      IN_TRUSTED_TYPES_POLICY++;
      try {
        return trustedTypesPolicy.createScriptURL(scriptUrl);
      } finally {
        IN_TRUSTED_TYPES_POLICY--;
      }
    };
    const _getDefaultTrustedTypesPolicy = function _getDefaultTrustedTypesPolicy() {
      if (!defaultTrustedTypesPolicyResolved) {
        defaultTrustedTypesPolicy = _createTrustedTypesPolicy(trustedTypes, currentScript);
        defaultTrustedTypesPolicyResolved = true;
      }
      return defaultTrustedTypesPolicy;
    };
    const _document = document2, { implementation, createNodeIterator, createDocumentFragment, getElementsByTagName } = _document;
    const importNode = originalDocument.importNode;
    let hooks = _createHooksMap();
    DOMPurify2.isSupported = typeof entries === "function" && typeof getParentNode === "function" && implementation && implementation.createHTMLDocument !== undefined;
    const MUSTACHE_EXPR$1 = MUSTACHE_EXPR, ERB_EXPR$1 = ERB_EXPR, TMPLIT_EXPR$1 = TMPLIT_EXPR, DATA_ATTR$1 = DATA_ATTR, ARIA_ATTR$1 = ARIA_ATTR, IS_SCRIPT_OR_DATA$1 = IS_SCRIPT_OR_DATA, ATTR_WHITESPACE$1 = ATTR_WHITESPACE, CUSTOM_ELEMENT$1 = CUSTOM_ELEMENT;
    let IS_ALLOWED_URI$1 = IS_ALLOWED_URI;
    let ALLOWED_TAGS = null;
    const DEFAULT_ALLOWED_TAGS = addToSet({}, [
      ...html$1,
      ...svg$1,
      ...svgFilters,
      ...mathMl$1,
      ...text
    ]);
    let ALLOWED_ATTR = null;
    const DEFAULT_ALLOWED_ATTR = addToSet({}, [
      ...html,
      ...svg,
      ...mathMl,
      ...xml
    ]);
    let CUSTOM_ELEMENT_HANDLING = Object.seal(create(null, {
      tagNameCheck: {
        writable: true,
        configurable: false,
        enumerable: true,
        value: null
      },
      attributeNameCheck: {
        writable: true,
        configurable: false,
        enumerable: true,
        value: null
      },
      allowCustomizedBuiltInElements: {
        writable: true,
        configurable: false,
        enumerable: true,
        value: false
      }
    }));
    let FORBID_TAGS = null;
    let FORBID_ATTR = null;
    const EXTRA_ELEMENT_HANDLING = Object.seal(create(null, {
      tagCheck: {
        writable: true,
        configurable: false,
        enumerable: true,
        value: null
      },
      attributeCheck: {
        writable: true,
        configurable: false,
        enumerable: true,
        value: null
      }
    }));
    let ALLOW_ARIA_ATTR = true;
    let ALLOW_DATA_ATTR = true;
    let ALLOW_UNKNOWN_PROTOCOLS = false;
    let ALLOW_SELF_CLOSE_IN_ATTR = true;
    let SAFE_FOR_TEMPLATES = false;
    let SAFE_FOR_XML = true;
    let WHOLE_DOCUMENT = false;
    let SET_CONFIG = false;
    let SET_CONFIG_ALLOWED_TAGS = null;
    let SET_CONFIG_ALLOWED_ATTR = null;
    let FORCE_BODY = false;
    let RETURN_DOM = false;
    let RETURN_DOM_FRAGMENT = false;
    let RETURN_TRUSTED_TYPE = false;
    let SANITIZE_DOM = true;
    let SANITIZE_NAMED_PROPS = false;
    const SANITIZE_NAMED_PROPS_PREFIX = "user-content-";
    let KEEP_CONTENT = true;
    let IN_PLACE = false;
    let USE_PROFILES = {};
    let FORBID_CONTENTS = null;
    const DEFAULT_FORBID_CONTENTS = addToSet({}, [
      "annotation-xml",
      "audio",
      "colgroup",
      "desc",
      "foreignobject",
      "head",
      "iframe",
      "math",
      "mi",
      "mn",
      "mo",
      "ms",
      "mtext",
      "noembed",
      "noframes",
      "noscript",
      "plaintext",
      "script",
      "selectedcontent",
      "style",
      "svg",
      "template",
      "thead",
      "title",
      "video",
      "xmp"
    ]);
    let DATA_URI_TAGS = null;
    const DEFAULT_DATA_URI_TAGS = addToSet({}, [
      "audio",
      "video",
      "img",
      "source",
      "image",
      "track"
    ]);
    let URI_SAFE_ATTRIBUTES = null;
    const DEFAULT_URI_SAFE_ATTRIBUTES = addToSet({}, [
      "alt",
      "class",
      "for",
      "id",
      "label",
      "name",
      "pattern",
      "placeholder",
      "role",
      "summary",
      "title",
      "value",
      "style",
      "xmlns"
    ]);
    const MATHML_NAMESPACE = "http://www.w3.org/1998/Math/MathML";
    const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
    const HTML_NAMESPACE = "http://www.w3.org/1999/xhtml";
    let NAMESPACE = HTML_NAMESPACE;
    let IS_EMPTY_INPUT = false;
    let ALLOWED_NAMESPACES = null;
    const DEFAULT_ALLOWED_NAMESPACES = addToSet({}, [
      MATHML_NAMESPACE,
      SVG_NAMESPACE,
      HTML_NAMESPACE
    ], stringToString);
    const DEFAULT_MATHML_TEXT_INTEGRATION_POINTS = freeze([
      "mi",
      "mo",
      "mn",
      "ms",
      "mtext"
    ]);
    let MATHML_TEXT_INTEGRATION_POINTS = addToSet({}, DEFAULT_MATHML_TEXT_INTEGRATION_POINTS);
    const DEFAULT_HTML_INTEGRATION_POINTS = freeze(["annotation-xml"]);
    let HTML_INTEGRATION_POINTS = addToSet({}, DEFAULT_HTML_INTEGRATION_POINTS);
    const COMMON_SVG_AND_HTML_ELEMENTS = addToSet({}, [
      "title",
      "style",
      "font",
      "a",
      "script"
    ]);
    let PARSER_MEDIA_TYPE = null;
    const SUPPORTED_PARSER_MEDIA_TYPES = ["application/xhtml+xml", "text/html"];
    const DEFAULT_PARSER_MEDIA_TYPE = "text/html";
    let transformCaseFunc = null;
    let CONFIG = null;
    const formElement = document2.createElement("form");
    const isRegexOrFunction = function isRegexOrFunction(testValue) {
      return testValue instanceof RegExp || testValue instanceof Function;
    };
    const _parseConfig = function _parseConfig() {
      let cfg = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
      if (CONFIG && CONFIG === cfg)
        return;
      if (!cfg || typeof cfg !== "object")
        cfg = {};
      cfg = clone(cfg);
      PARSER_MEDIA_TYPE = SUPPORTED_PARSER_MEDIA_TYPES.indexOf(cfg.PARSER_MEDIA_TYPE) === -1 ? DEFAULT_PARSER_MEDIA_TYPE : cfg.PARSER_MEDIA_TYPE;
      transformCaseFunc = PARSER_MEDIA_TYPE === "application/xhtml+xml" ? stringToString : stringToLowerCase;
      ALLOWED_TAGS = _resolveSetOption(cfg, "ALLOWED_TAGS", DEFAULT_ALLOWED_TAGS, { transform: transformCaseFunc });
      ALLOWED_ATTR = _resolveSetOption(cfg, "ALLOWED_ATTR", DEFAULT_ALLOWED_ATTR, { transform: transformCaseFunc });
      ALLOWED_NAMESPACES = _resolveSetOption(cfg, "ALLOWED_NAMESPACES", DEFAULT_ALLOWED_NAMESPACES, { transform: stringToString });
      URI_SAFE_ATTRIBUTES = _resolveSetOption(cfg, "ADD_URI_SAFE_ATTR", DEFAULT_URI_SAFE_ATTRIBUTES, {
        transform: transformCaseFunc,
        base: DEFAULT_URI_SAFE_ATTRIBUTES
      });
      DATA_URI_TAGS = _resolveSetOption(cfg, "ADD_DATA_URI_TAGS", DEFAULT_DATA_URI_TAGS, {
        transform: transformCaseFunc,
        base: DEFAULT_DATA_URI_TAGS
      });
      FORBID_CONTENTS = _resolveSetOption(cfg, "FORBID_CONTENTS", DEFAULT_FORBID_CONTENTS, { transform: transformCaseFunc });
      FORBID_TAGS = _resolveSetOption(cfg, "FORBID_TAGS", clone({}), { transform: transformCaseFunc });
      FORBID_ATTR = _resolveSetOption(cfg, "FORBID_ATTR", clone({}), { transform: transformCaseFunc });
      USE_PROFILES = objectHasOwnProperty(cfg, "USE_PROFILES") ? cfg.USE_PROFILES && typeof cfg.USE_PROFILES === "object" ? clone(cfg.USE_PROFILES) : cfg.USE_PROFILES : false;
      ALLOW_ARIA_ATTR = cfg.ALLOW_ARIA_ATTR !== false;
      ALLOW_DATA_ATTR = cfg.ALLOW_DATA_ATTR !== false;
      ALLOW_UNKNOWN_PROTOCOLS = cfg.ALLOW_UNKNOWN_PROTOCOLS || false;
      ALLOW_SELF_CLOSE_IN_ATTR = cfg.ALLOW_SELF_CLOSE_IN_ATTR !== false;
      SAFE_FOR_TEMPLATES = cfg.SAFE_FOR_TEMPLATES || false;
      SAFE_FOR_XML = cfg.SAFE_FOR_XML !== false;
      WHOLE_DOCUMENT = cfg.WHOLE_DOCUMENT || false;
      RETURN_DOM = cfg.RETURN_DOM || false;
      RETURN_DOM_FRAGMENT = cfg.RETURN_DOM_FRAGMENT || false;
      RETURN_TRUSTED_TYPE = cfg.RETURN_TRUSTED_TYPE || false;
      FORCE_BODY = cfg.FORCE_BODY || false;
      SANITIZE_DOM = cfg.SANITIZE_DOM !== false;
      SANITIZE_NAMED_PROPS = cfg.SANITIZE_NAMED_PROPS || false;
      KEEP_CONTENT = cfg.KEEP_CONTENT !== false;
      IN_PLACE = cfg.IN_PLACE || false;
      IS_ALLOWED_URI$1 = isRegex(cfg.ALLOWED_URI_REGEXP) ? cfg.ALLOWED_URI_REGEXP : IS_ALLOWED_URI;
      NAMESPACE = typeof cfg.NAMESPACE === "string" ? cfg.NAMESPACE : HTML_NAMESPACE;
      MATHML_TEXT_INTEGRATION_POINTS = _resolveObjectOption(cfg, "MATHML_TEXT_INTEGRATION_POINTS", () => addToSet({}, DEFAULT_MATHML_TEXT_INTEGRATION_POINTS));
      HTML_INTEGRATION_POINTS = _resolveObjectOption(cfg, "HTML_INTEGRATION_POINTS", () => addToSet({}, DEFAULT_HTML_INTEGRATION_POINTS));
      const customElementHandling = _resolveObjectOption(cfg, "CUSTOM_ELEMENT_HANDLING", () => create(null));
      CUSTOM_ELEMENT_HANDLING = create(null);
      if (objectHasOwnProperty(customElementHandling, "tagNameCheck") && isRegexOrFunction(customElementHandling.tagNameCheck))
        CUSTOM_ELEMENT_HANDLING.tagNameCheck = customElementHandling.tagNameCheck;
      if (objectHasOwnProperty(customElementHandling, "attributeNameCheck") && isRegexOrFunction(customElementHandling.attributeNameCheck))
        CUSTOM_ELEMENT_HANDLING.attributeNameCheck = customElementHandling.attributeNameCheck;
      if (objectHasOwnProperty(customElementHandling, "allowCustomizedBuiltInElements") && typeof customElementHandling.allowCustomizedBuiltInElements === "boolean")
        CUSTOM_ELEMENT_HANDLING.allowCustomizedBuiltInElements = customElementHandling.allowCustomizedBuiltInElements;
      seal(CUSTOM_ELEMENT_HANDLING);
      if (SAFE_FOR_TEMPLATES)
        ALLOW_DATA_ATTR = false;
      if (RETURN_DOM_FRAGMENT)
        RETURN_DOM = true;
      if (USE_PROFILES) {
        ALLOWED_TAGS = addToSet({}, text);
        ALLOWED_ATTR = create(null);
        if (USE_PROFILES.html === true) {
          addToSet(ALLOWED_TAGS, html$1);
          addToSet(ALLOWED_ATTR, html);
        }
        if (USE_PROFILES.svg === true) {
          addToSet(ALLOWED_TAGS, svg$1);
          addToSet(ALLOWED_ATTR, svg);
          addToSet(ALLOWED_ATTR, xml);
        }
        if (USE_PROFILES.svgFilters === true) {
          addToSet(ALLOWED_TAGS, svgFilters);
          addToSet(ALLOWED_ATTR, svg);
          addToSet(ALLOWED_ATTR, xml);
        }
        if (USE_PROFILES.mathMl === true) {
          addToSet(ALLOWED_TAGS, mathMl$1);
          addToSet(ALLOWED_ATTR, mathMl);
          addToSet(ALLOWED_ATTR, xml);
        }
      }
      EXTRA_ELEMENT_HANDLING.tagCheck = null;
      EXTRA_ELEMENT_HANDLING.attributeCheck = null;
      if (objectHasOwnProperty(cfg, "ADD_TAGS")) {
        if (typeof cfg.ADD_TAGS === "function")
          EXTRA_ELEMENT_HANDLING.tagCheck = cfg.ADD_TAGS;
        else if (arrayIsArray(cfg.ADD_TAGS)) {
          if (ALLOWED_TAGS === DEFAULT_ALLOWED_TAGS)
            ALLOWED_TAGS = clone(ALLOWED_TAGS);
          addToSet(ALLOWED_TAGS, cfg.ADD_TAGS, transformCaseFunc);
        }
      }
      if (objectHasOwnProperty(cfg, "ADD_ATTR")) {
        if (typeof cfg.ADD_ATTR === "function")
          EXTRA_ELEMENT_HANDLING.attributeCheck = cfg.ADD_ATTR;
        else if (arrayIsArray(cfg.ADD_ATTR)) {
          if (ALLOWED_ATTR === DEFAULT_ALLOWED_ATTR)
            ALLOWED_ATTR = clone(ALLOWED_ATTR);
          addToSet(ALLOWED_ATTR, cfg.ADD_ATTR, transformCaseFunc);
        }
      }
      if (objectHasOwnProperty(cfg, "ADD_FORBID_CONTENTS") && arrayIsArray(cfg.ADD_FORBID_CONTENTS)) {
        if (FORBID_CONTENTS === DEFAULT_FORBID_CONTENTS)
          FORBID_CONTENTS = clone(FORBID_CONTENTS);
        addToSet(FORBID_CONTENTS, cfg.ADD_FORBID_CONTENTS, transformCaseFunc);
      }
      if (KEEP_CONTENT)
        ALLOWED_TAGS["#text"] = true;
      if (WHOLE_DOCUMENT)
        addToSet(ALLOWED_TAGS, [
          "html",
          "head",
          "body"
        ]);
      if (ALLOWED_TAGS.table) {
        addToSet(ALLOWED_TAGS, ["tbody"]);
        delete FORBID_TAGS.tbody;
      }
      if (cfg.TRUSTED_TYPES_POLICY) {
        if (typeof cfg.TRUSTED_TYPES_POLICY.createHTML !== "function")
          throw typeErrorCreate('TRUSTED_TYPES_POLICY configuration option must provide a "createHTML" hook.');
        if (typeof cfg.TRUSTED_TYPES_POLICY.createScriptURL !== "function")
          throw typeErrorCreate('TRUSTED_TYPES_POLICY configuration option must provide a "createScriptURL" hook.');
        const previousTrustedTypesPolicy = trustedTypesPolicy;
        trustedTypesPolicy = cfg.TRUSTED_TYPES_POLICY;
        try {
          emptyHTML = _createTrustedHTML("");
        } catch (error) {
          trustedTypesPolicy = previousTrustedTypesPolicy;
          throw error;
        }
      } else if (cfg.TRUSTED_TYPES_POLICY === null) {
        trustedTypesPolicy = undefined;
        emptyHTML = "";
      } else {
        if (trustedTypesPolicy === undefined)
          trustedTypesPolicy = _getDefaultTrustedTypesPolicy();
        if (trustedTypesPolicy && typeof emptyHTML === "string")
          emptyHTML = _createTrustedHTML("");
      }
      if (freeze)
        freeze(cfg);
      CONFIG = cfg;
    };
    const ALL_SVG_TAGS = addToSet({}, [
      ...svg$1,
      ...svgFilters,
      ...svgDisallowed
    ]);
    const ALL_MATHML_TAGS = addToSet({}, [...mathMl$1, ...mathMlDisallowed]);
    const _checkSvgNamespace = function _checkSvgNamespace(tagName, parent, parentTagName) {
      if (parent.namespaceURI === HTML_NAMESPACE)
        return tagName === "svg";
      if (parent.namespaceURI === MATHML_NAMESPACE)
        return tagName === "svg" && (parentTagName === "annotation-xml" || MATHML_TEXT_INTEGRATION_POINTS[parentTagName]);
      return Boolean(ALL_SVG_TAGS[tagName]);
    };
    const _checkMathMlNamespace = function _checkMathMlNamespace(tagName, parent, parentTagName) {
      if (parent.namespaceURI === HTML_NAMESPACE)
        return tagName === "math";
      if (parent.namespaceURI === SVG_NAMESPACE)
        return tagName === "math" && HTML_INTEGRATION_POINTS[parentTagName];
      return Boolean(ALL_MATHML_TAGS[tagName]);
    };
    const _checkHtmlNamespace = function _checkHtmlNamespace(tagName, parent, parentTagName) {
      if (parent.namespaceURI === SVG_NAMESPACE && !HTML_INTEGRATION_POINTS[parentTagName])
        return false;
      if (parent.namespaceURI === MATHML_NAMESPACE && !MATHML_TEXT_INTEGRATION_POINTS[parentTagName])
        return false;
      return !ALL_MATHML_TAGS[tagName] && (COMMON_SVG_AND_HTML_ELEMENTS[tagName] || !ALL_SVG_TAGS[tagName]);
    };
    const _checkValidNamespace = function _checkValidNamespace(element) {
      let parent = getParentNode(element);
      if (!parent || !parent.tagName)
        parent = {
          namespaceURI: NAMESPACE,
          tagName: "template"
        };
      const tagName = stringToLowerCase(element.tagName);
      const parentTagName = stringToLowerCase(parent.tagName);
      if (!ALLOWED_NAMESPACES[element.namespaceURI])
        return false;
      if (element.namespaceURI === SVG_NAMESPACE)
        return _checkSvgNamespace(tagName, parent, parentTagName);
      if (element.namespaceURI === MATHML_NAMESPACE)
        return _checkMathMlNamespace(tagName, parent, parentTagName);
      if (element.namespaceURI === HTML_NAMESPACE)
        return _checkHtmlNamespace(tagName, parent, parentTagName);
      if (PARSER_MEDIA_TYPE === "application/xhtml+xml" && ALLOWED_NAMESPACES[element.namespaceURI])
        return true;
      return false;
    };
    const _forceRemove = function _forceRemove(node) {
      arrayPush(DOMPurify2.removed, { element: node });
      try {
        getParentNode(node).removeChild(node);
      } catch (_) {
        remove(node);
        if (!getParentNode(node))
          throw typeErrorCreate("a node selected for removal could not be detached from its tree and cannot be safely returned; refusing to sanitize in place");
      }
    };
    const _stripAttributeNode = function _stripAttributeNode(element, attribute, name) {
      try {
        removeAttributeNode(element, attribute);
      } catch (_) {
        try {
          element.removeAttribute(name);
        } catch (_) {}
      }
    };
    const _neutralizeRoot = function _neutralizeRoot(root) {
      _neutralizeSubtree(root);
      const childNodes = getChildNodes(root);
      if (childNodes) {
        const snapshot = [];
        arrayForEach(childNodes, (child) => {
          arrayPush(snapshot, child);
        });
        arrayForEach(snapshot, (child) => {
          try {
            remove(child);
          } catch (_) {}
        });
      }
      const attributes = getAttributes(root);
      if (attributes)
        for (let i = attributes.length - 1;i >= 0; --i) {
          const attribute = attributes[i];
          const name = attribute && attribute.name;
          if (typeof name === "string")
            _stripAttributeNode(root, attribute, name);
        }
    };
    const _removeAttribute = function _removeAttribute(name, element, attr) {
      if (!attr)
        try {
          attr = element.getAttributeNode(name);
        } catch (_) {
          attr = null;
        }
      arrayPush(DOMPurify2.removed, {
        attribute: attr || null,
        from: element
      });
      try {
        if (attr)
          removeAttributeNode(element, attr);
        else
          element.removeAttribute(name);
      } catch (_) {
        try {
          element.removeAttribute(name);
        } catch (_) {}
      }
      if (name === "is") {
        if (RETURN_DOM || RETURN_DOM_FRAGMENT)
          try {
            _forceRemove(element);
          } catch (_) {}
        else
          try {
            element.setAttribute(name, "");
          } catch (_) {}
      }
    };
    const _stripDisallowedAttributes = function _stripDisallowedAttributes(element) {
      const attributes = getAttributes(element);
      if (!attributes)
        return;
      for (let i = attributes.length - 1;i >= 0; --i) {
        const attribute = attributes[i];
        const name = attribute && attribute.name;
        if (typeof name !== "string" || ALLOWED_ATTR[transformCaseFunc(name)])
          continue;
        _stripAttributeNode(element, attribute, name);
      }
    };
    const _neutralizeSubtree = function _neutralizeSubtree(root) {
      const stack = [root];
      while (stack.length > 0) {
        const node = stack.pop();
        if (_readNodeType(node) === NODE_TYPE.element)
          _stripDisallowedAttributes(node);
        const childNodes = getChildNodes(node);
        if (childNodes)
          for (let i = childNodes.length - 1;i >= 0; --i)
            stack.push(childNodes[i]);
      }
    };
    const _isPatchLinkageAttribute = function _isPatchLinkageAttribute(lcName, lcTag) {
      if (!SAFE_FOR_XML)
        return false;
      if (lcName === "patchsrc")
        return true;
      return lcName === "for" && lcTag !== "label" && lcTag !== "output";
    };
    const _neutralizePatchLinkage = function _neutralizePatchLinkage(root) {
      if (!SAFE_FOR_XML)
        return;
      const stack = [root];
      while (stack.length > 0) {
        const node = stack.pop();
        const nodeType = _readNodeType(node);
        if (nodeType === NODE_TYPE.processingInstruction || nodeType === NODE_TYPE.comment && regExpTest(COMMENT_MARKUP_PROBE, node.data)) {
          try {
            remove(node);
          } catch (_) {}
          continue;
        }
        if (nodeType === NODE_TYPE.element) {
          const element = node;
          const lcTag = transformCaseFunc(_readNodeName(node));
          try {
            if (element.hasAttribute && element.hasAttribute("patchsrc"))
              element.removeAttribute("patchsrc");
            if (element.hasAttribute && element.hasAttribute("for") && _isPatchLinkageAttribute("for", lcTag))
              element.removeAttribute("for");
          } catch (_) {}
        }
        const childNodes = getChildNodes(node);
        if (childNodes)
          for (let i = childNodes.length - 1;i >= 0; --i)
            stack.push(childNodes[i]);
      }
    };
    const _initDocument = function _initDocument(dirty) {
      let doc = null;
      let leadingWhitespace = null;
      if (FORCE_BODY)
        dirty = "<remove></remove>" + dirty;
      else {
        const matches = stringMatch(dirty, /^[\r\n\t ]+/);
        leadingWhitespace = matches && matches[0];
      }
      if (PARSER_MEDIA_TYPE === "application/xhtml+xml" && NAMESPACE === HTML_NAMESPACE)
        dirty = '<html xmlns="http://www.w3.org/1999/xhtml"><head></head><body>' + dirty + "</body></html>";
      const dirtyPayload = trustedTypesPolicy ? _createTrustedHTML(dirty) : dirty;
      if (NAMESPACE === HTML_NAMESPACE)
        try {
          doc = new DOMParser().parseFromString(dirtyPayload, PARSER_MEDIA_TYPE);
        } catch (_) {}
      if (!doc || !doc.documentElement) {
        doc = implementation.createDocument(NAMESPACE, "template", null);
        try {
          doc.documentElement.innerHTML = IS_EMPTY_INPUT ? emptyHTML : dirtyPayload;
        } catch (_) {}
      }
      const body = doc.body || doc.documentElement;
      if (dirty && leadingWhitespace)
        body.insertBefore(document2.createTextNode(leadingWhitespace), body.childNodes[0] || null);
      if (NAMESPACE === HTML_NAMESPACE)
        return getElementsByTagName.call(doc, WHOLE_DOCUMENT ? "html" : "body")[0];
      return WHOLE_DOCUMENT ? doc.documentElement : body;
    };
    const _createNodeIterator = function _createNodeIterator(root) {
      const doc = getOwnerDocument ? getOwnerDocument(root) : root.ownerDocument;
      return createNodeIterator.call(doc || root, root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_COMMENT | NodeFilter.SHOW_TEXT | NodeFilter.SHOW_PROCESSING_INSTRUCTION | NodeFilter.SHOW_CDATA_SECTION, null);
    };
    const _stripTemplateExpressions = function _stripTemplateExpressions(value) {
      value = stringReplace(value, MUSTACHE_EXPR$1, " ");
      value = stringReplace(value, ERB_EXPR$1, " ");
      value = stringReplace(value, TMPLIT_EXPR$1, " ");
      return value;
    };
    const _scrubTemplateExpressions2 = function _scrubTemplateExpressions(node) {
      var _node$querySelectorAl;
      node.normalize();
      const doc = getOwnerDocument ? getOwnerDocument(node) : node.ownerDocument;
      const walker = createNodeIterator.call(doc || node, node, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_COMMENT | NodeFilter.SHOW_CDATA_SECTION | NodeFilter.SHOW_PROCESSING_INSTRUCTION, null);
      let currentNode = walker.nextNode();
      while (currentNode) {
        currentNode.data = _stripTemplateExpressions(currentNode.data);
        currentNode = walker.nextNode();
      }
      const templates = (_node$querySelectorAl = node.querySelectorAll) === null || _node$querySelectorAl === undefined ? undefined : _node$querySelectorAl.call(node, "template");
      if (templates)
        arrayForEach(templates, (tmpl) => {
          if (_isDocumentFragment(tmpl.content))
            _scrubTemplateExpressions2(tmpl.content);
        });
    };
    const _isClobbered = function _isClobbered(element) {
      const realTagName = getNodeName ? getNodeName(element) : null;
      if (typeof realTagName !== "string")
        return false;
      if (transformCaseFunc(realTagName) !== "form")
        return false;
      return typeof element.nodeName !== "string" || typeof element.textContent !== "string" || typeof element.removeChild !== "function" || element.attributes !== getAttributes(element) || typeof element.removeAttribute !== "function" || typeof element.removeAttributeNode !== "function" || typeof element.getAttributeNode !== "function" || typeof element.setAttribute !== "function" || typeof element.namespaceURI !== "string" || typeof element.insertBefore !== "function" || typeof element.hasChildNodes !== "function" || element.nodeType !== getNodeType(element) || element.childNodes !== getChildNodes(element);
    };
    const _isDocumentFragment = function _isDocumentFragment(value) {
      if (!getNodeType || typeof value !== "object" || value === null)
        return false;
      try {
        return getNodeType(value) === NODE_TYPE.documentFragment;
      } catch (_) {
        return false;
      }
    };
    const _isNode = function _isNode(value) {
      if (!getNodeType || typeof value !== "object" || value === null)
        return false;
      try {
        return typeof getNodeType(value) === "number";
      } catch (_) {
        return false;
      }
    };
    function _executeHooks(hooks, currentNode, data) {
      if (hooks.length === 0)
        return;
      arrayForEach(hooks, (hook) => {
        hook.call(DOMPurify2, currentNode, data, CONFIG);
      });
    }
    const _isUnsafeNode = function _isUnsafeNode(currentNode, tagName) {
      if (SAFE_FOR_XML && currentNode.hasChildNodes() && !_isNode(currentNode.firstElementChild) && regExpTest(ELEMENT_MARKUP_PROBE, currentNode.textContent) && regExpTest(ELEMENT_MARKUP_PROBE, currentNode.innerHTML))
        return true;
      if (SAFE_FOR_XML && currentNode.namespaceURI === HTML_NAMESPACE && LITERAL_TEXT_ELEMENTS[tagName] && (_isNode(currentNode.firstElementChild) || typeof currentNode.textContent === "string" && regExpTest(LITERAL_TEXT_CLOSE[tagName], currentNode.textContent)))
        return true;
      if (currentNode.nodeType === NODE_TYPE.processingInstruction)
        return true;
      if (SAFE_FOR_XML && currentNode.nodeType === NODE_TYPE.comment && regExpTest(COMMENT_MARKUP_PROBE, currentNode.data))
        return true;
      return false;
    };
    const _matchesNameCheck = function _matchesNameCheck(check, name) {
      if (check instanceof RegExp)
        return regExpTest(check, name);
      if (check instanceof Function) {
        for (var _len = arguments.length, args = new Array(_len > 2 ? _len - 2 : 0), _key = 2;_key < _len; _key++)
          args[_key - 2] = arguments[_key];
        return Boolean(check(name, ...args));
      }
      return false;
    };
    const _sanitizeDisallowedNode = function _sanitizeDisallowedNode(currentNode, tagName, root) {
      if (!FORBID_TAGS[tagName] && _isBasicCustomElement(tagName) && _matchesNameCheck(CUSTOM_ELEMENT_HANDLING.tagNameCheck, tagName))
        return false;
      if (KEEP_CONTENT && !FORBID_CONTENTS[tagName]) {
        const parentNode = getParentNode(currentNode);
        const childNodes = getChildNodes(currentNode);
        if (childNodes && parentNode) {
          const childCount = childNodes.length;
          for (let i = childCount - 1;i >= 0; --i) {
            const hoisted = currentNode === root ? cloneNode(childNodes[i], true) : childNodes[i];
            parentNode.insertBefore(hoisted, getNextSibling(currentNode));
          }
        }
      }
      _forceRemove(currentNode);
      return true;
    };
    const _forkSharedAllowlist = function _forkSharedAllowlist(hookList, set, defaultSet, setConfigSet) {
      if (hookList.length === 0)
        return set;
      return set === defaultSet || set === setConfigSet ? clone(set) : set;
    };
    const _handleHookDetachedNode = function _handleHookDetachedNode(currentNode, root) {
      if (currentNode === root || getParentNode(currentNode) !== null)
        return false;
      if (IN_PLACE)
        _neutralizeSubtree(currentNode);
      return true;
    };
    const _sanitizeElements = function _sanitizeElements(currentNode, root) {
      _executeHooks(hooks.beforeSanitizeElements, currentNode, null);
      if (_handleHookDetachedNode(currentNode, root))
        return true;
      if (_isClobbered(currentNode)) {
        _forceRemove(currentNode);
        return true;
      }
      const tagName = transformCaseFunc(_readNodeName(currentNode));
      ALLOWED_TAGS = _forkSharedAllowlist(hooks.uponSanitizeElement, ALLOWED_TAGS, DEFAULT_ALLOWED_TAGS, SET_CONFIG_ALLOWED_TAGS);
      _executeHooks(hooks.uponSanitizeElement, currentNode, {
        tagName,
        allowedTags: ALLOWED_TAGS
      });
      if (_handleHookDetachedNode(currentNode, root))
        return true;
      if (_isUnsafeNode(currentNode, tagName)) {
        _forceRemove(currentNode);
        return true;
      }
      if (FORBID_TAGS[tagName] || !(EXTRA_ELEMENT_HANDLING.tagCheck instanceof Function && EXTRA_ELEMENT_HANDLING.tagCheck(tagName)) && !ALLOWED_TAGS[tagName]) {
        const removed = _sanitizeDisallowedNode(currentNode, tagName, root);
        if (removed === false) {
          _executeHooks(hooks.afterSanitizeElements, currentNode, null);
          if (_handleHookDetachedNode(currentNode, root))
            return true;
        }
        return removed;
      }
      if (_readNodeType(currentNode) === NODE_TYPE.element && !_checkValidNamespace(currentNode)) {
        _forceRemove(currentNode);
        return true;
      }
      if ((tagName === "noscript" || tagName === "noembed" || tagName === "noframes") && regExpTest(FALLBACK_TAG_CLOSE, currentNode.innerHTML)) {
        _forceRemove(currentNode);
        return true;
      }
      if (SAFE_FOR_TEMPLATES && currentNode.nodeType === NODE_TYPE.text) {
        const content = _stripTemplateExpressions(currentNode.textContent);
        if (currentNode.textContent !== content) {
          arrayPush(DOMPurify2.removed, { element: currentNode.cloneNode() });
          currentNode.textContent = content;
        }
      }
      _executeHooks(hooks.afterSanitizeElements, currentNode, null);
      return _handleHookDetachedNode(currentNode, root);
    };
    const _isValidAttribute = function _isValidAttribute(lcTag, lcName, value) {
      if (FORBID_ATTR[lcName])
        return false;
      if (_isPatchLinkageAttribute(lcName, lcTag))
        return false;
      if (SANITIZE_DOM && (lcName === "id" || lcName === "name") && ((value in document2) || (value in formElement)))
        return false;
      const nameIsPermitted = ALLOWED_ATTR[lcName] || EXTRA_ELEMENT_HANDLING.attributeCheck instanceof Function && EXTRA_ELEMENT_HANDLING.attributeCheck(lcName, lcTag);
      if (ALLOW_DATA_ATTR && regExpTest(DATA_ATTR$1, lcName))
        return true;
      if (ALLOW_ARIA_ATTR && regExpTest(ARIA_ATTR$1, lcName))
        return true;
      if (!nameIsPermitted)
        return _isBasicCustomElement(lcTag) && _matchesNameCheck(CUSTOM_ELEMENT_HANDLING.tagNameCheck, lcTag) && _matchesNameCheck(CUSTOM_ELEMENT_HANDLING.attributeNameCheck, lcName, lcTag) || lcName === "is" && CUSTOM_ELEMENT_HANDLING.allowCustomizedBuiltInElements && _matchesNameCheck(CUSTOM_ELEMENT_HANDLING.tagNameCheck, value);
      if (URI_SAFE_ATTRIBUTES[lcName])
        return true;
      if (regExpTest(IS_ALLOWED_URI$1, stringReplace(value, ATTR_WHITESPACE$1, "")))
        return true;
      if ((lcName === "src" || lcName === "xlink:href" || lcName === "href") && lcTag !== "script" && stringIndexOf(value, "data:") === 0 && DATA_URI_TAGS[lcTag])
        return true;
      if (ALLOW_UNKNOWN_PROTOCOLS && !regExpTest(IS_SCRIPT_OR_DATA$1, stringReplace(value, ATTR_WHITESPACE$1, "")))
        return true;
      return !value;
    };
    const RESERVED_CUSTOM_ELEMENT_NAMES = addToSet({}, [
      "annotation-xml",
      "color-profile",
      "font-face",
      "font-face-format",
      "font-face-name",
      "font-face-src",
      "font-face-uri",
      "missing-glyph"
    ]);
    const _isBasicCustomElement = function _isBasicCustomElement(tagName) {
      return !RESERVED_CUSTOM_ELEMENT_NAMES[stringToLowerCase(tagName)] && regExpTest(CUSTOM_ELEMENT$1, tagName);
    };
    const _applyTrustedTypesToAttribute = function _applyTrustedTypesToAttribute(lcTag, lcName, namespaceURI, value) {
      if (trustedTypesPolicy && typeof trustedTypes === "object" && typeof trustedTypes.getAttributeType === "function" && !namespaceURI)
        switch (trustedTypes.getAttributeType(lcTag, lcName)) {
          case "TrustedHTML":
            return _createTrustedHTML(value);
          case "TrustedScriptURL":
            return _createTrustedScriptURL(value);
        }
      return value;
    };
    const _setAttributeValue = function _setAttributeValue(currentNode, name, namespaceURI, value) {
      try {
        if (namespaceURI)
          currentNode.setAttributeNS(namespaceURI, name, value);
        else
          currentNode.setAttribute(name, value);
        if (_isClobbered(currentNode)) {
          _forceRemove(currentNode);
          return false;
        }
        return true;
      } catch (_) {
        _removeAttribute(name, currentNode);
        return false;
      }
    };
    const _sanitizeAttributes = function _sanitizeAttributes(currentNode, root) {
      _executeHooks(hooks.beforeSanitizeAttributes, currentNode, null);
      if (_handleHookDetachedNode(currentNode, root))
        return;
      const attributes = currentNode.attributes;
      if (!attributes || _isClobbered(currentNode))
        return;
      ALLOWED_ATTR = _forkSharedAllowlist(hooks.uponSanitizeAttribute, ALLOWED_ATTR, DEFAULT_ALLOWED_ATTR, SET_CONFIG_ALLOWED_ATTR);
      const hookEvent = {
        attrName: "",
        attrValue: "",
        keepAttr: true,
        allowedAttributes: ALLOWED_ATTR,
        forceKeepAttr: undefined
      };
      let l = attributes.length;
      const lcTag = transformCaseFunc(currentNode.nodeName);
      while (l--) {
        const attr = attributes[l];
        const { name, namespaceURI, value: attrValue } = attr;
        const lcName = transformCaseFunc(name);
        const initValue = attrValue;
        let value = name === "value" ? initValue : stringTrim(initValue);
        let recreatedNamedProp = false;
        hookEvent.attrName = lcName;
        hookEvent.attrValue = value;
        hookEvent.keepAttr = true;
        hookEvent.forceKeepAttr = undefined;
        _executeHooks(hooks.uponSanitizeAttribute, currentNode, hookEvent);
        value = hookEvent.attrValue;
        if (SANITIZE_NAMED_PROPS && (lcName === "id" || lcName === "name") && stringIndexOf(value, SANITIZE_NAMED_PROPS_PREFIX) !== 0) {
          _removeAttribute(name, currentNode, attr);
          value = SANITIZE_NAMED_PROPS_PREFIX + value;
          recreatedNamedProp = true;
        }
        if (SAFE_FOR_XML && regExpTest(/((--!?|])>)|<\/(style|script|title|xmp|textarea|noscript|iframe|noembed|noframes)/i, value)) {
          _removeAttribute(name, currentNode, attr);
          continue;
        }
        if (lcName === "attributename" && stringMatch(value, "href")) {
          _removeAttribute(name, currentNode, attr);
          continue;
        }
        if (hookEvent.forceKeepAttr)
          continue;
        if (!hookEvent.keepAttr) {
          _removeAttribute(name, currentNode, attr);
          continue;
        }
        if (!ALLOW_SELF_CLOSE_IN_ATTR && regExpTest(SELF_CLOSING_TAG, value)) {
          _removeAttribute(name, currentNode, attr);
          continue;
        }
        if (SAFE_FOR_TEMPLATES)
          value = _stripTemplateExpressions(value);
        if (!_isValidAttribute(lcTag, lcName, value)) {
          _removeAttribute(name, currentNode, attr);
          continue;
        }
        value = _applyTrustedTypesToAttribute(lcTag, lcName, namespaceURI, value);
        if (value !== initValue) {
          if (_setAttributeValue(currentNode, name, namespaceURI, value) && recreatedNamedProp)
            arrayPop(DOMPurify2.removed);
        }
      }
      _executeHooks(hooks.afterSanitizeAttributes, currentNode, null);
      _handleHookDetachedNode(currentNode, root);
    };
    const _sanitizeShadowDOM2 = function _sanitizeShadowDOM(fragment) {
      let shadowNode = null;
      const shadowIterator = _createNodeIterator(fragment);
      _executeHooks(hooks.beforeSanitizeShadowDOM, fragment, null);
      while (shadowNode = shadowIterator.nextNode()) {
        _executeHooks(hooks.uponSanitizeShadowNode, shadowNode, null);
        _sanitizeElements(shadowNode, fragment);
        _sanitizeAttributes(shadowNode, fragment);
        if (_isDocumentFragment(shadowNode.content))
          _sanitizeShadowDOM2(shadowNode.content);
        if (_readNodeType(shadowNode) === NODE_TYPE.element) {
          const innerSr = getShadowRoot(shadowNode);
          if (_isDocumentFragment(innerSr)) {
            _sanitizeAttachedShadowRoots(innerSr);
            _sanitizeShadowDOM2(innerSr);
          }
        }
      }
      _executeHooks(hooks.afterSanitizeShadowDOM, fragment, null);
    };
    const _sanitizeAttachedShadowRoots = function _sanitizeAttachedShadowRoots(root) {
      const stack = [{
        node: root,
        shadow: null
      }];
      while (stack.length > 0) {
        const item = stack.pop();
        if (item.shadow) {
          _sanitizeShadowDOM2(item.shadow);
          continue;
        }
        const node = item.node;
        const isElement = _readNodeType(node) === NODE_TYPE.element;
        const childNodes = getChildNodes(node);
        if (childNodes)
          for (let i = childNodes.length - 1;i >= 0; --i)
            stack.push({
              node: childNodes[i],
              shadow: null
            });
        if (isElement) {
          const rootName = getNodeName ? getNodeName(node) : null;
          if (typeof rootName === "string" && transformCaseFunc(rootName) === "template") {
            const content = node.content;
            if (_isDocumentFragment(content))
              stack.push({
                node: content,
                shadow: null
              });
          }
        }
        if (isElement) {
          const sr = getShadowRoot(node);
          if (_isDocumentFragment(sr))
            stack.push({
              node: null,
              shadow: sr
            }, {
              node: sr,
              shadow: null
            });
        }
      }
    };
    DOMPurify2.sanitize = function(dirty) {
      let cfg = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
      let body = null;
      let importedNode = null;
      let currentNode = null;
      let returnNode = null;
      IS_EMPTY_INPUT = !dirty;
      if (IS_EMPTY_INPUT)
        dirty = "<!-->";
      if (typeof dirty !== "string" && !_isNode(dirty)) {
        dirty = stringifyValue(dirty);
        if (typeof dirty !== "string")
          throw typeErrorCreate("dirty is not a string, aborting");
      }
      if (!DOMPurify2.isSupported)
        return dirty;
      if (SET_CONFIG) {
        ALLOWED_TAGS = SET_CONFIG_ALLOWED_TAGS;
        ALLOWED_ATTR = SET_CONFIG_ALLOWED_ATTR;
      } else
        _parseConfig(cfg);
      if (hooks.uponSanitizeElement.length > 0 || hooks.uponSanitizeAttribute.length > 0)
        ALLOWED_TAGS = clone(ALLOWED_TAGS);
      if (hooks.uponSanitizeAttribute.length > 0)
        ALLOWED_ATTR = clone(ALLOWED_ATTR);
      DOMPurify2.removed = [];
      const inPlace = IN_PLACE && typeof dirty !== "string" && _isNode(dirty);
      if (inPlace) {
        _neutralizePatchLinkage(dirty);
        const nn = _readNodeName(dirty);
        if (typeof nn === "string") {
          const tagName = transformCaseFunc(nn);
          if (!ALLOWED_TAGS[tagName] || FORBID_TAGS[tagName]) {
            _neutralizeRoot(dirty);
            throw typeErrorCreate("root node is forbidden and cannot be sanitized in-place");
          }
        }
        if (_isClobbered(dirty)) {
          _neutralizeRoot(dirty);
          throw typeErrorCreate("root node is clobbered and cannot be sanitized in-place");
        }
        try {
          _sanitizeAttachedShadowRoots(dirty);
        } catch (error) {
          _neutralizeRoot(dirty);
          throw error;
        }
      } else if (_isNode(dirty)) {
        body = _initDocument("<!---->");
        importedNode = body.ownerDocument.importNode(dirty, true);
        if (importedNode.nodeType === NODE_TYPE.element && importedNode.nodeName === "BODY")
          body = importedNode;
        else if (importedNode.nodeName === "HTML")
          body = importedNode;
        else
          body.appendChild(importedNode);
        _sanitizeAttachedShadowRoots(body);
      } else {
        if (!RETURN_DOM && !SAFE_FOR_TEMPLATES && !WHOLE_DOCUMENT && dirty.indexOf("<") === -1)
          return trustedTypesPolicy && RETURN_TRUSTED_TYPE ? _createTrustedHTML(dirty) : dirty;
        body = _initDocument(dirty);
        if (!body)
          return RETURN_DOM ? null : RETURN_TRUSTED_TYPE ? emptyHTML : "";
      }
      if (body && FORCE_BODY)
        _forceRemove(body.firstChild);
      const walkRoot = inPlace ? dirty : body;
      try {
        const nodeIterator = _createNodeIterator(walkRoot);
        while (currentNode = nodeIterator.nextNode()) {
          _sanitizeElements(currentNode, walkRoot);
          _sanitizeAttributes(currentNode, walkRoot);
          if (_isDocumentFragment(currentNode.content))
            _sanitizeShadowDOM2(currentNode.content);
        }
      } catch (error) {
        if (inPlace) {
          _neutralizeRoot(dirty);
          arrayForEach(DOMPurify2.removed, (entry) => {
            if (entry.element)
              _neutralizeSubtree(entry.element);
          });
        }
        throw error;
      }
      if (inPlace) {
        let rootWasRemoved = false;
        arrayForEach(DOMPurify2.removed, (entry) => {
          if (entry.element) {
            if (entry.element === dirty)
              rootWasRemoved = true;
            _neutralizeSubtree(entry.element);
          }
        });
        if (rootWasRemoved)
          throw typeErrorCreate("a node selected for removal could not be safely returned; refusing to sanitize in place");
        if (SAFE_FOR_TEMPLATES)
          _scrubTemplateExpressions2(dirty);
        return dirty;
      }
      if (RETURN_DOM) {
        if (SAFE_FOR_TEMPLATES)
          _scrubTemplateExpressions2(body);
        if (RETURN_DOM_FRAGMENT) {
          returnNode = createDocumentFragment.call(body.ownerDocument);
          while (body.firstChild)
            returnNode.appendChild(body.firstChild);
        } else
          returnNode = body;
        if (ALLOWED_ATTR.shadowroot || ALLOWED_ATTR.shadowrootmode)
          returnNode = importNode.call(originalDocument, returnNode, true);
        return returnNode;
      }
      let serializedHTML = WHOLE_DOCUMENT ? body.outerHTML : body.innerHTML;
      if (WHOLE_DOCUMENT && ALLOWED_TAGS["!doctype"] && body.ownerDocument && body.ownerDocument.doctype && body.ownerDocument.doctype.name && regExpTest(DOCTYPE_NAME, body.ownerDocument.doctype.name))
        serializedHTML = "<!DOCTYPE " + body.ownerDocument.doctype.name + `>
` + serializedHTML;
      if (SAFE_FOR_TEMPLATES)
        serializedHTML = _stripTemplateExpressions(serializedHTML);
      return trustedTypesPolicy && RETURN_TRUSTED_TYPE ? _createTrustedHTML(serializedHTML) : serializedHTML;
    };
    DOMPurify2.setConfig = function() {
      let cfg = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
      _parseConfig(cfg);
      SET_CONFIG = true;
      SET_CONFIG_ALLOWED_TAGS = ALLOWED_TAGS;
      SET_CONFIG_ALLOWED_ATTR = ALLOWED_ATTR;
    };
    DOMPurify2.clearConfig = function() {
      CONFIG = null;
      SET_CONFIG = false;
      SET_CONFIG_ALLOWED_TAGS = null;
      SET_CONFIG_ALLOWED_ATTR = null;
      trustedTypesPolicy = defaultTrustedTypesPolicy;
      emptyHTML = "";
    };
    DOMPurify2.isValidAttribute = function(tag, attr, value) {
      if (!CONFIG)
        _parseConfig({});
      const lcTag = transformCaseFunc(tag);
      const lcName = transformCaseFunc(attr);
      return _isValidAttribute(lcTag, lcName, value);
    };
    DOMPurify2.addHook = function(entryPoint, hookFunction) {
      if (typeof hookFunction !== "function")
        return;
      if (!objectHasOwnProperty(hooks, entryPoint))
        return;
      arrayPush(hooks[entryPoint], hookFunction);
    };
    DOMPurify2.removeHook = function(entryPoint, hookFunction) {
      if (!objectHasOwnProperty(hooks, entryPoint))
        return;
      if (hookFunction !== undefined) {
        const index = arrayLastIndexOf(hooks[entryPoint], hookFunction);
        return index === -1 ? undefined : arraySplice(hooks[entryPoint], index, 1)[0];
      }
      return arrayPop(hooks[entryPoint]);
    };
    DOMPurify2.removeHooks = function(entryPoint) {
      if (!objectHasOwnProperty(hooks, entryPoint))
        return;
      hooks[entryPoint] = [];
    };
    DOMPurify2.removeAllHooks = function() {
      hooks = _createHooksMap();
    };
    return DOMPurify2;
  }
  var purify_default = createDOMPurify();

  // src/sanitize.js
  var DEFAULT_ALLOWED_TAGS = [
    "p",
    "br",
    "b",
    "strong",
    "i",
    "em",
    "ul",
    "ol",
    "li",
    "blockquote",
    "a",
    "span"
  ];
  var DEFAULT_ALLOWED_ATTRIBUTES = ["href", "title", "data-rt-mention", "data-id", "contenteditable"];
  var MENTION_ATTRIBUTES = ["data-rt-mention", "data-id", "contenteditable"];
  function createSanitizeToDOMFragment(options = {}) {
    const allowedTags = options.allowedTags ?? DEFAULT_ALLOWED_TAGS;
    const allowedAttributes = options.allowedAttributes ?? DEFAULT_ALLOWED_ATTRIBUTES;
    return (html, editor) => {
      const root = editor.getRoot();
      const doc = root.ownerDocument;
      const sanitized = purify_default.sanitize(html, {
        ALLOWED_TAGS: allowedTags,
        ALLOWED_ATTR: allowedAttributes,
        ALLOW_DATA_ATTR: false,
        RETURN_DOM_FRAGMENT: true
      });
      const fragment = sanitized.ownerDocument === doc ? sanitized : doc.importNode(sanitized, true);
      for (const span of [...fragment.querySelectorAll("span")]) {
        const id = span.getAttribute("data-id")?.trim() ?? "";
        const type = span.getAttribute("data-rt-mention")?.trim() ?? "";
        const label = span.textContent?.trim() ?? "";
        if (!span.hasAttribute("data-rt-mention") || !id || !type || !label) {
          span.replaceWith(...span.childNodes);
          continue;
        }
        for (const attr of [...span.attributes]) {
          if (!MENTION_ATTRIBUTES.includes(attr.name))
            span.removeAttribute(attr.name);
        }
        span.setAttribute("data-rt-mention", type);
        span.setAttribute("data-id", id);
        span.setAttribute("contenteditable", "false");
        span.textContent = label;
      }
      for (const element of fragment.querySelectorAll("[data-rt-mention], [data-id], [contenteditable]")) {
        if (element.localName === "span" && element.hasAttribute("data-rt-mention"))
          continue;
        for (const name of MENTION_ATTRIBUTES)
          element.removeAttribute(name);
      }
      for (const link of [...fragment.querySelectorAll("a")]) {
        if (!isSafeHref(link.getAttribute("href") ?? ""))
          link.replaceWith(...link.childNodes);
      }
      return fragment;
    };
  }

  // src/rich-text.js
  var BUTTONS = {
    bold: { label: "Bold", text: "B", toggle: "B" },
    italic: { label: "Italic", text: "I", toggle: "I" },
    "bullet-list": { label: "Bulleted list", text: "•", toggle: "UL" },
    "ordered-list": { label: "Numbered list", text: "1.", toggle: "OL" },
    link: { label: "Link", text: "↗", toggle: "A" },
    blockquote: { label: "Quote", text: "❝", toggle: "BLOCKQUOTE" },
    undo: { label: "Undo", text: "↶" },
    redo: { label: "Redo", text: "↷" }
  };
  var NAVIGATION_KEYS = new Set([
    "ArrowDown",
    "ArrowLeft",
    "ArrowRight",
    "ArrowUp",
    "End",
    "Home",
    "PageDown",
    "PageUp",
    "Escape",
    "Tab",
    "Shift",
    "Control",
    "Alt",
    "Meta",
    "CapsLock"
  ]);
  var INVISIBLE_TEXT = /^[​﻿]*$/;
  var BLOCK_BOUNDARY = /^(?:ADDRESS|ARTICLE|ASIDE|BLOCKQUOTE|BR|DD|DIV|DL|DT|FIGURE|FOOTER|H[1-6]|HEADER|HR|LI|OL|P|PRE|SECTION|UL)$/;
  var uid = 0;

  class RichText {
    constructor(source, options = {}) {
      if (!(source instanceof HTMLTextAreaElement)) {
        throw new TypeError("RichText requires a textarea source.");
      }
      this.source = source;
      this.options = {
        toolbar: normalizeToolbar(options.toolbar),
        buttons: options.buttons ?? {},
        toolbarLabel: options.toolbarLabel ?? "Formatting",
        suggestions: options.suggestions ?? [],
        sanitizeToDOMFragment: options.sanitizeToDOMFragment ?? createSanitizeToDOMFragment(),
        requestLink: options.requestLink ?? defaultLinkRequest
      };
      this._controller = new AbortController;
      this._form = null;
      this._disposed = false;
      this._sourceWasHidden = source.hasAttribute("hidden");
      this._generatedLabelIds = [];
      this._dispatchingSource = false;
      this._settingEditor = false;
      this._focusValue = source.value;
      this._canUndo = false;
      this._canRedo = false;
      this._composing = false;
      this._suggestionAbort = null;
      this._suggestionRevision = 0;
      this._suggestionKey = null;
      this._suggestionContext = null;
      this._suggestionItems = [];
      this._suggestionProvider = null;
      this._activeSuggestion = 0;
      this._stopSuggestionAutoUpdate = null;
      this.shell = source.ownerDocument.createElement("div");
      this.shell.className = "rt-shell";
      this.toolbar = source.ownerDocument.createElement("div");
      this.toolbar.className = "rt-toolbar";
      this.toolbar.setAttribute("role", "toolbar");
      this.toolbar.setAttribute("aria-label", this.options.toolbarLabel);
      this.surface = source.ownerDocument.createElement("div");
      this.surface.className = "rt-editor";
      this.surface.setAttribute("role", "textbox");
      this.surface.setAttribute("aria-multiline", "true");
      this.shell.append(this.toolbar, this.surface);
      source.after(this.shell);
      source.hidden = true;
      this._buildToolbar();
      this._copyAccessibility();
      this.squire = new Ji(this.surface, {
        blockTag: "P",
        sanitizeToDOMFragment: this.options.sanitizeToDOMFragment
      });
      this._restrictShortcuts();
      this.suggestionPopup = this._createSuggestionPopup();
      this._bind();
      this._setEditorHTML(source.value);
      this._syncEditableState();
    }
    get value() {
      return this.source.value;
    }
    get disabled() {
      return this.source.disabled || this.source.matches(":disabled");
    }
    get editable() {
      return !this.disabled && !this.source.readOnly;
    }
    focus() {
      if (this._disposed)
        return;
      this.squire.focus();
    }
    sync() {
      if (this._disposed)
        return this;
      this._setEditorHTML(this.source.value);
      this._syncEditableState();
      return this;
    }
    setHTML(html) {
      if (!this._disposed)
        this._setEditorHTML(html);
      return this;
    }
    getHTML() {
      return this.source.value;
    }
    getMentions() {
      const mentions = [];
      for (const element of this.surface.querySelectorAll("[data-rt-mention]")) {
        const mention = mentionFromElement(element);
        if (mention)
          mentions.push(mention);
      }
      return mentions;
    }
    insertMention(mention) {
      const range = this.squire.getSelection();
      this._insertMention(mention, range);
      return this;
    }
    dispose() {
      if (this._disposed)
        return;
      this._disposed = true;
      this._suggestionAbort?.abort();
      this._stopSuggestionAutoUpdate?.();
      this._controller.abort();
      this._sourceObserver?.disconnect();
      this.squire.destroy();
      this.suggestionPopup.remove();
      this.shell.remove();
      for (const { label, id } of this._generatedLabelIds) {
        if (label.id === id)
          label.removeAttribute("id");
      }
      this._generatedLabelIds = [];
      if (this._sourceWasHidden)
        this.source.setAttribute("hidden", "");
      else
        this.source.removeAttribute("hidden");
    }
    _bind() {
      const signal = this._controller.signal;
      for (const type of ["input", "pathChange", "cursor", "select", "undoStateChange", "pasteImage"]) {
        this.squire.addEventListener(type, this);
      }
      for (const type of ["keydown", "cut", "paste", "drop"]) {
        this.shell.addEventListener(type, this, { capture: true, signal });
      }
      for (const type of ["mousedown", "click", "focusin", "focusout", "compositionstart", "compositionend"]) {
        this.shell.addEventListener(type, this, { signal });
      }
      for (const type of ["input", "change", "invalid"]) {
        this.source.addEventListener(type, this, { signal });
      }
      this._form = this.source.form;
      this._form?.addEventListener("reset", this, { signal });
      for (const label of this.source.labels ?? []) {
        label.addEventListener("click", this, { signal });
      }
      this.source.ownerDocument.addEventListener("pointerdown", this, { capture: true, signal });
      this._sourceObserver = new MutationObserver(() => {
        if (this._disposed)
          return;
        this._syncEditableState();
        this._copyAccessibility();
      });
      this._sourceObserver.observe(this.source, {
        attributes: true,
        attributeFilter: [
          "disabled",
          "readonly",
          "required",
          "aria-invalid",
          "aria-describedby",
          "aria-label",
          "placeholder",
          "spellcheck",
          "autocapitalize"
        ]
      });
      for (let fieldset = this.source.parentElement?.closest("fieldset");fieldset; ) {
        this._sourceObserver.observe(fieldset, { attributes: true, attributeFilter: ["disabled"] });
        fieldset = fieldset.parentElement?.closest("fieldset");
      }
    }
    handleEvent(event) {
      if (this._disposed)
        return;
      const current = event.currentTarget;
      if (!current)
        this._onSquireEvent(event);
      else if (current === this.shell)
        this._onShellEvent(event);
      else if (current === this.source)
        this._onSourceEvent(event);
      else if (current === this._form)
        this._onFormReset(event);
      else if (current === this.source.ownerDocument)
        this._onDocumentPointerdown(event);
      else if (current instanceof HTMLLabelElement)
        this._onLabelClick(event);
    }
    _onSquireEvent(event) {
      switch (event.type) {
        case "input":
          if (this._settingEditor)
            return;
          this._syncFromEditor(true);
          if (!this._composing)
            this._updateSuggestion();
          break;
        case "pathChange":
          this._updateToolbarState();
          break;
        case "cursor":
          this._updateToolbarState();
          if (!this._composing)
            this._updateSuggestion();
          break;
        case "select":
          this._updateToolbarState();
          this._closeSuggestions();
          break;
        case "undoStateChange": {
          const detail = event.detail;
          this._canUndo = Boolean(detail?.canUndo);
          this._canRedo = Boolean(detail?.canRedo);
          this._updateToolbarState();
          break;
        }
        case "pasteImage":
          event.preventDefault();
          break;
      }
    }
    _onShellEvent(event) {
      const target = event.target instanceof Node ? event.target : null;
      const inSurface = Boolean(target && (target === this.surface || this.surface.contains(target)));
      const inToolbar = Boolean(target && this.toolbar.contains(target));
      switch (event.type) {
        case "keydown":
          if (inSurface)
            this._onEditorKeydown(event);
          else if (inToolbar)
            this._onToolbarKeydown(event);
          break;
        case "cut":
        case "paste":
        case "drop":
          if (inSurface)
            this._selectWholeMentions();
          break;
        case "mousedown":
          if (inToolbar && target instanceof Element && target.closest("button"))
            event.preventDefault();
          break;
        case "click":
          if (inToolbar)
            this._onToolbarClick(event);
          break;
        case "compositionstart":
          this._composing = true;
          this._closeSuggestions();
          break;
        case "compositionend":
          this._composing = false;
          queueMicrotask(() => {
            if (!this._disposed)
              this._updateSuggestion();
          });
          break;
        case "focusin": {
          const previous = event.relatedTarget;
          if (!(previous instanceof Node) || !this.shell.contains(previous)) {
            this._focusValue = this.source.value;
          }
          if (inToolbar)
            this._rememberToolbarButton(target);
          if (!inSurface)
            this._closeSuggestions();
          break;
        }
        case "focusout":
          queueMicrotask(() => {
            if (this._disposed)
              return;
            const active = this.source.ownerDocument.activeElement;
            if (active && this.shell.contains(active))
              return;
            this._closeSuggestions();
            if (this.source.value !== this._focusValue)
              this._dispatchSource("change");
          });
          break;
      }
    }
    _onSourceEvent(event) {
      if (event.type !== "invalid") {
        if (!this._dispatchingSource)
          this.sync();
        return;
      }
      event.preventDefault();
      if (firstInvalidControl(this.source) === this.source)
        this.focus();
      this.source.dispatchEvent(new CustomEvent("richtext:invalid", { bubbles: true, detail: { richText: this } }));
    }
    _onFormReset(event) {
      if (event.defaultPrevented)
        return;
      queueMicrotask(() => {
        this.sync();
        this._focusValue = this.source.value;
      });
    }
    _onLabelClick(event) {
      if (event.defaultPrevented || !this.editable)
        return;
      if (event.target instanceof Node && this.shell.contains(event.target))
        return;
      queueMicrotask(() => this.focus());
    }
    _onDocumentPointerdown(event) {
      const target = event.target;
      if (!(target instanceof Node))
        return;
      if (this.suggestionPopup.contains(target)) {
        const element = target instanceof Element ? target : target.parentElement;
        const option = element?.closest("[role=option]");
        if (!(option instanceof HTMLElement))
          return;
        event.preventDefault();
        const index = Number(option.dataset.index);
        if (Number.isInteger(index))
          this._selectSuggestion(index);
      } else if (!this.shell.contains(target)) {
        this._closeSuggestions();
      }
    }
    _buildToolbar() {
      const doc = this.source.ownerDocument;
      this.toolbar.replaceChildren();
      for (const commands of toolbarGroups(this.options.toolbar)) {
        const group = doc.createElement("div");
        group.className = "rt-group";
        group.setAttribute("role", "group");
        for (const command of commands) {
          const config = BUTTONS[command];
          if (!config)
            continue;
          const override = this.options.buttons[command] ?? {};
          const label = override.label ?? config.label;
          const button = doc.createElement("button");
          button.type = "button";
          button.className = "rt-button";
          button.dataset.command = command;
          button.setAttribute("aria-label", label);
          button.title = label;
          const content = typeof override.content === "function" ? override.content() : override.content;
          if (content instanceof Node)
            button.append(content);
          else
            button.textContent = content ?? config.text;
          if (config.toggle)
            button.setAttribute("aria-pressed", "false");
          group.append(button);
        }
        if (group.children.length)
          this.toolbar.append(group);
      }
      this.toolbar.hidden = !this.toolbar.children.length;
      this._syncToolbarTabStops();
    }
    _syncToolbarTabStops(preferred = null) {
      const buttons = [...this.toolbar.querySelectorAll("button:not(:disabled)")].filter((button) => button instanceof HTMLButtonElement);
      const current = buttons.find((button) => button.tabIndex === 0) ?? null;
      const target = preferred && buttons.includes(preferred) ? preferred : current ?? buttons[0] ?? null;
      for (const button of buttons)
        button.tabIndex = button === target ? 0 : -1;
    }
    _rememberToolbarButton(target) {
      if (target instanceof HTMLButtonElement && this.toolbar.contains(target)) {
        this._syncToolbarTabStops(target);
      }
    }
    _onToolbarKeydown(event) {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
        return;
      const buttons = [...this.toolbar.querySelectorAll("button:not(:disabled)")].filter((button) => button instanceof HTMLButtonElement);
      const current = event.target;
      if (!(current instanceof HTMLButtonElement) || !buttons.includes(current))
        return;
      let index = buttons.indexOf(current);
      if (event.key === "Home")
        index = 0;
      else if (event.key === "End")
        index = buttons.length - 1;
      else {
        const rtl = getComputedStyle(this.toolbar).direction === "rtl";
        const delta = event.key === "ArrowRight" ? rtl ? -1 : 1 : rtl ? 1 : -1;
        index = (index + delta + buttons.length) % buttons.length;
      }
      event.preventDefault();
      this._syncToolbarTabStops(buttons[index]);
      buttons[index].focus();
    }
    async _onToolbarClick(event) {
      const button = event.target instanceof Element ? event.target.closest("button[data-command]") : null;
      if (!(button instanceof HTMLButtonElement) || button.disabled || !this.editable)
        return;
      await this._executeCommand(button.dataset.command ?? "");
      if (!this._disposed)
        this._updateToolbarState();
    }
    async _executeCommand(command) {
      const editor = this.squire;
      switch (command) {
        case "bold":
          editor.hasFormat("B") ? editor.removeBold() : editor.bold();
          break;
        case "italic":
          editor.hasFormat("I") ? editor.removeItalic() : editor.italic();
          break;
        case "bullet-list":
          editor.hasFormat("UL") ? editor.removeList() : editor.makeUnorderedList();
          break;
        case "ordered-list":
          editor.hasFormat("OL") ? editor.removeList() : editor.makeOrderedList();
          break;
        case "blockquote":
          editor.hasFormat("BLOCKQUOTE") ? editor.removeQuote() : editor.increaseQuoteLevel();
          break;
        case "link":
          await this._toggleLink();
          return;
        case "undo":
          editor.undo();
          break;
        case "redo":
          editor.redo();
          break;
        default:
          return;
      }
      editor.focus();
    }
    async _toggleLink() {
      const editor = this.squire;
      const range = editor.getSelection();
      const node = range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement;
      const link = node?.closest("a") ?? null;
      const href = link?.getAttribute("href") ?? "";
      const text = editor.getSelectedText();
      const next = await this.options.requestLink({ href, text, richText: this });
      if (next == null || this._disposed)
        return;
      editor.focus();
      const value = next.trim();
      if (value && !isSafeHref(value)) {
        this.source.dispatchEvent(new CustomEvent("richtext:linkerror", {
          bubbles: true,
          detail: { href: next }
        }));
        return;
      }
      if (link?.isConnected && this.surface.contains(link) && editor.getSelection().collapsed) {
        const whole = this.source.ownerDocument.createRange();
        whole.selectNodeContents(link);
        editor.setSelection(whole);
      }
      if (value)
        editor.makeLink(value);
      else
        editor.removeLink();
    }
    _updateToolbarState() {
      const buttons = this.toolbar.querySelectorAll("button[data-command]");
      for (const button of buttons) {
        const command = button.dataset.command ?? "";
        const config = BUTTONS[command];
        if (config?.toggle)
          button.setAttribute("aria-pressed", String(this.squire.hasFormat(config.toggle)));
        if (command === "undo")
          button.disabled = !this._canUndo || !this.editable;
        else if (command === "redo")
          button.disabled = !this._canRedo || !this.editable;
        else
          button.disabled = !this.editable;
      }
      this._syncToolbarTabStops();
    }
    _setEditorHTML(html) {
      this._settingEditor = true;
      try {
        this.squire.setHTML(String(html ?? ""));
        this._syncFromEditor(false);
      } finally {
        this._settingEditor = false;
      }
    }
    _syncFromEditor(dispatchInput) {
      if (this._disposed)
        return;
      const html = isEditorEmpty(this.surface) ? "" : this._serialize();
      const changed = this.source.value !== html;
      this.source.value = html;
      this._setSurfaceAttributes({ "data-empty": String(!html) });
      if (changed && dispatchInput)
        this._dispatchSource("input");
    }
    _serialize() {
      const html = this.squire.getHTML();
      if (!html.includes("style="))
        return html;
      const template = this.source.ownerDocument.createElement("template");
      template.innerHTML = html;
      for (const element of template.content.querySelectorAll("[style]"))
        element.removeAttribute("style");
      return template.innerHTML;
    }
    _dispatchSource(type) {
      this._dispatchingSource = true;
      try {
        this.source.dispatchEvent(new Event(type, { bubbles: true }));
      } finally {
        this._dispatchingSource = false;
      }
    }
    _copyAccessibility() {
      const source = this.source;
      const labelledBy = [];
      for (const label of source.labels ?? []) {
        if (!label.id) {
          const id = `rt-label-${++uid}`;
          label.id = id;
          this._generatedLabelIds.push({ label, id });
        }
        labelledBy.push(label.id);
      }
      this._setSurfaceAttributes({
        "aria-label": source.getAttribute("aria-label") || null,
        "aria-labelledby": labelledBy.length ? labelledBy.join(" ") : null,
        "aria-describedby": source.getAttribute("aria-describedby"),
        "aria-invalid": source.getAttribute("aria-invalid"),
        "aria-required": String(source.required),
        spellcheck: String(source.spellcheck),
        autocapitalize: source.getAttribute("autocapitalize"),
        "data-placeholder": source.placeholder || ""
      });
    }
    _syncEditableState() {
      const disabled = this.disabled;
      this._setSurfaceAttributes({
        contenteditable: String(this.editable),
        tabindex: disabled ? "-1" : "0",
        "aria-disabled": String(disabled),
        "aria-readonly": String(this.source.readOnly)
      });
      this.shell.toggleAttribute("data-disabled", disabled);
      this.shell.toggleAttribute("data-readonly", this.source.readOnly);
      if (!this.editable)
        this._closeSuggestions();
      this._updateToolbarState();
    }
    _setSurfaceAttributes(attributes) {
      const surface = this.surface;
      const changes = Object.entries(attributes).filter(([name, value]) => surface.getAttribute(name) !== value);
      if (!changes.length)
        return;
      const apply = () => {
        for (const [name, value] of changes) {
          if (value == null)
            surface.removeAttribute(name);
          else
            surface.setAttribute(name, value);
        }
      };
      if (this.squire)
        this.squire.modifyDocument(apply);
      else
        apply();
    }
    _restrictShortcuts() {
      for (const modifier of ["Ctrl-", "Meta-"]) {
        this.squire.setKeyHandler(`${modifier}u`, (_editor, event) => event.preventDefault());
        for (const key of ["Shift-5", "Shift-6", "Shift-7", "d"])
          this.squire.setKeyHandler(`${modifier}${key}`, null);
      }
    }
    _createSuggestionPopup() {
      const doc = this.source.ownerDocument;
      const popup = doc.createElement("div");
      popup.className = "rt-suggestions";
      popup.id = `rt-suggestions-${++uid}`;
      popup.setAttribute("role", "listbox");
      popup.hidden = true;
      if ("showPopover" in popup)
        popup.setAttribute("popover", "manual");
      doc.body.append(popup);
      if (this.options.suggestions.length) {
        this._setSurfaceAttributes({
          "aria-autocomplete": "list",
          "aria-haspopup": "listbox",
          "aria-controls": popup.id,
          "aria-expanded": "false"
        });
      }
      return popup;
    }
    _onEditorKeydown(event) {
      if (event.isComposing || event.keyCode === 229 || !this.editable)
        return;
      if (this._suggestionItems.length) {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          const delta = event.key === "ArrowDown" ? 1 : -1;
          this._setActiveSuggestion((this._activeSuggestion + delta + this._suggestionItems.length) % this._suggestionItems.length);
          return;
        }
        if (event.key === "Enter" || event.key === "Tab") {
          event.preventDefault();
          this._selectSuggestion(this._activeSuggestion);
          return;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          this._closeSuggestions();
          return;
        }
      }
      if ((event.key === "Backspace" || event.key === "Delete") && this._removeAdjacentMention(event.key)) {
        event.preventDefault();
        return;
      }
      if (!NAVIGATION_KEYS.has(event.key))
        this._selectWholeMentions();
    }
    _selectWholeMentions() {
      const range = this.squire.getSelection();
      if (range.collapsed)
        return;
      const start = closestMention(range.startContainer, this.surface);
      const end = closestMention(range.endContainer, this.surface);
      if (!start && !end)
        return;
      const next = range.cloneRange();
      if (start)
        next.setStartBefore(start);
      if (end)
        next.setEndAfter(end);
      this.squire.setSelection(next);
    }
    _removeAdjacentMention(key) {
      const range = this.squire.getSelection();
      if (!range.collapsed)
        return false;
      const mention = adjacentMention(range, key === "Backspace" ? -1 : 1, this.surface);
      if (!mention)
        return false;
      const detail = mentionFromElement(mention);
      this.squire.saveUndoState(range.cloneRange());
      const parent = mention.parentNode;
      if (!parent)
        return false;
      const index = [...parent.childNodes].indexOf(mention);
      mention.remove();
      const next = this.source.ownerDocument.createRange();
      next.setStart(parent, Math.max(0, Math.min(index, parent.childNodes.length)));
      next.collapse(true);
      this.squire.setSelection(next);
      this.squire.focus();
      queueMicrotask(() => this._syncFromEditor(true));
      this.source.dispatchEvent(new CustomEvent("richtext:mentionremove", { bubbles: true, detail }));
      return true;
    }
    async _updateSuggestion() {
      const providers = this.options.suggestions ?? [];
      const reset = () => {
        this._suggestionKey = null;
        this._closeSuggestions();
      };
      if (!providers.length || this._composing || !this.editable)
        return reset();
      const range = this.squire.getSelection();
      if (!range.collapsed || !(range.startContainer instanceof Text))
        return reset();
      const textBeforeCaret = range.startContainer.data.slice(0, range.startOffset);
      const match = matchSuggestionText(textBeforeCaret, providers.map((provider) => provider.trigger));
      if (!match)
        return reset();
      const provider = providers.find((entry) => entry.trigger === match.trigger);
      if (!provider || match.query.length < (provider.minChars ?? 0))
        return reset();
      const previous = this._suggestionKey;
      if (previous && previous.node === range.startContainer && previous.start === match.start && previous.query === match.query && previous.provider === provider) {
        return;
      }
      this._suggestionKey = { node: range.startContainer, start: match.start, query: match.query, provider };
      const replaceRange = this.source.ownerDocument.createRange();
      replaceRange.setStart(range.startContainer, match.start);
      replaceRange.setEnd(range.startContainer, range.startOffset);
      const revision = ++this._suggestionRevision;
      this._suggestionAbort?.abort();
      const controller = new AbortController;
      this._suggestionAbort = controller;
      const context = {
        trigger: match.trigger,
        query: match.query,
        signal: controller.signal,
        richText: this
      };
      if (this._suggestionItems.length) {
        if (this._suggestionProvider === provider)
          this._suggestionContext = { ...context, range: replaceRange };
        else
          this._hideSuggestionRows();
      }
      try {
        const items = await provider.search(match.query, context);
        if (controller.signal.aborted || revision !== this._suggestionRevision)
          return;
        this._suggestionAbort = null;
        if (!Array.isArray(items) || !items.length) {
          this._closeSuggestions();
          return;
        }
        this._suggestionContext = { ...context, range: replaceRange };
        this._suggestionItems = items;
        this._suggestionProvider = provider;
        this._activeSuggestion = 0;
        this._renderSuggestions();
      } catch (error) {
        if (controller.signal.aborted)
          return;
        this._closeSuggestions();
        this.source.dispatchEvent(new CustomEvent("richtext:suggestionerror", { bubbles: true, detail: { error, provider } }));
      }
    }
    _renderSuggestions() {
      const provider = this._suggestionProvider;
      const context = this._suggestionContext;
      if (!provider || !context)
        return;
      this.suggestionPopup.replaceChildren();
      this._suggestionItems.forEach((item, index) => {
        const option = this.source.ownerDocument.createElement("div");
        option.className = "rt-suggestion";
        option.id = `${this.suggestionPopup.id}-option-${index}`;
        option.dataset.index = String(index);
        option.setAttribute("role", "option");
        option.setAttribute("aria-selected", String(index === this._activeSuggestion));
        const rendered = provider.renderItem?.(item, context);
        if (rendered instanceof Node)
          option.append(rendered);
        else
          option.textContent = suggestionLabel(provider, item);
        this.suggestionPopup.append(option);
      });
      this._openSuggestions();
      this._setActiveSuggestion(this._activeSuggestion);
    }
    _openSuggestions() {
      this.suggestionPopup.hidden = false;
      if (this.suggestionPopup.hasAttribute("popover")) {
        try {
          if (!this.suggestionPopup.matches(":popover-open"))
            this.suggestionPopup.showPopover();
        } catch {}
      }
      this._setSurfaceAttributes({ "aria-expanded": "true" });
      this._positionSuggestion();
      this._stopSuggestionAutoUpdate?.();
      this._stopSuggestionAutoUpdate = autoUpdate(null, this.suggestionPopup, () => this._positionSuggestion());
    }
    _positionSuggestion() {
      if (!this._suggestionItems.length)
        return;
      const rect = this.squire.getCursorPosition();
      repositionAt(rect.left, rect.bottom, this.suggestionPopup, {
        placement: "bottom-start",
        distance: 4
      });
    }
    _setActiveSuggestion(index) {
      if (!this._suggestionItems.length)
        return;
      this._activeSuggestion = Math.max(0, Math.min(index, this._suggestionItems.length - 1));
      const options = this.suggestionPopup.querySelectorAll("[role=option]");
      for (const option of options) {
        const selected = Number(option.dataset.index) === this._activeSuggestion;
        option.setAttribute("aria-selected", String(selected));
        if (selected) {
          this._setSurfaceAttributes({ "aria-activedescendant": option.id });
          option.scrollIntoView({ block: "nearest" });
        }
      }
    }
    _selectSuggestion(index) {
      const provider = this._suggestionProvider;
      const context = this._suggestionContext;
      const item = this._suggestionItems[index];
      if (!provider || !context || item === undefined || !this.editable)
        return;
      let insertion;
      if (provider.insert)
        insertion = provider.insert(item, context);
      else if (provider.kind === "mention") {
        const label = suggestionLabel(provider, item);
        insertion = {
          type: "mention",
          id: provider.getId?.(item) ?? String(item?.id ?? ""),
          label: label.startsWith(provider.trigger) ? label : `${provider.trigger}${label}`,
          mentionType: provider.mentionType ?? "mention"
        };
      } else {
        insertion = { type: "text", text: suggestionLabel(provider, item) };
      }
      this._closeSuggestions();
      this.squire.setSelection(context.range);
      if (insertion.type === "mention") {
        this._insertMention({ id: insertion.id, label: insertion.label, type: insertion.mentionType ?? "mention" }, context.range);
        this.source.dispatchEvent(new CustomEvent("richtext:mentionselect", {
          bubbles: true,
          detail: { item, provider, mention: insertion }
        }));
      } else if (insertion.type === "html") {
        this.squire.insertHTML(insertion.html);
      } else {
        this.squire.insertPlainText(insertion.text, false);
      }
      this.squire.focus();
    }
    _insertMention(mention, range) {
      const id = String(mention.id ?? "").trim();
      const label = String(mention.label ?? "").trim();
      const type = String(mention.type ?? "mention").trim() || "mention";
      if (!id || !label)
        throw new TypeError("A mention requires non-empty id and label values.");
      const span = this.source.ownerDocument.createElement("span");
      span.setAttribute("data-rt-mention", type);
      span.setAttribute("data-id", id);
      span.setAttribute("contenteditable", "false");
      span.textContent = label;
      this.squire.setSelection(range);
      this.squire.insertHTML(`${span.outerHTML} `);
    }
    _closeSuggestions() {
      this._suggestionAbort?.abort();
      this._suggestionAbort = null;
      this._suggestionRevision += 1;
      this._hideSuggestionRows();
    }
    _hideSuggestionRows() {
      this._suggestionItems = [];
      this._suggestionProvider = null;
      this._suggestionContext = null;
      this._stopSuggestionAutoUpdate?.();
      this._stopSuggestionAutoUpdate = null;
      if (this.options.suggestions.length) {
        this._setSurfaceAttributes({ "aria-activedescendant": null, "aria-expanded": "false" });
      }
      if (this.suggestionPopup?.hasAttribute("popover")) {
        try {
          if (this.suggestionPopup.matches(":popover-open"))
            this.suggestionPopup.hidePopover();
        } catch {}
      }
      if (this.suggestionPopup) {
        this.suggestionPopup.hidden = true;
        this.suggestionPopup.replaceChildren();
      }
    }
  }
  function defaultLinkRequest({ href }) {
    return window.prompt("Link URL", href || "https://");
  }
  function suggestionLabel(provider, item) {
    return String(provider.getLabel?.(item) ?? item?.label ?? item?.name ?? item ?? "");
  }
  function closestMention(node, root) {
    const element = node instanceof Element ? node : node.parentElement;
    const mention = element?.closest("[data-rt-mention]");
    return mention instanceof HTMLElement && mention !== root && root.contains(mention) ? mention : null;
  }
  function stepOut(node, direction, root) {
    let current = node;
    while (current && current !== root) {
      const sibling = direction < 0 ? current.previousSibling : current.nextSibling;
      if (sibling)
        return sibling;
      current = current.parentNode;
      if (current instanceof Element && BLOCK_BOUNDARY.test(current.nodeName))
        return null;
    }
    return null;
  }
  function adjacentMention(range, direction, root) {
    const container = range.startContainer;
    const offset = range.startOffset;
    const inside = closestMention(container, root);
    if (inside)
      return inside;
    let node;
    if (container instanceof Text) {
      const rest = direction < 0 ? container.data.slice(0, offset) : container.data.slice(offset);
      if (!INVISIBLE_TEXT.test(rest))
        return null;
      node = stepOut(container, direction, root);
    } else {
      node = container.childNodes[direction < 0 ? offset - 1 : offset] ?? stepOut(container, direction, root);
    }
    while (node) {
      if (node instanceof Text) {
        if (!INVISIBLE_TEXT.test(node.data))
          return null;
        node = stepOut(node, direction, root);
      } else if (node instanceof HTMLElement) {
        if (node.hasAttribute("data-rt-mention"))
          return node;
        if (BLOCK_BOUNDARY.test(node.nodeName))
          return null;
        node = (direction < 0 ? node.lastChild : node.firstChild) ?? stepOut(node, direction, root);
      } else {
        node = stepOut(node, direction, root);
      }
    }
    return null;
  }
  function firstInvalidControl(source) {
    const controls = source.form ? [...source.form.elements] : [source];
    return controls.find((control) => {
      const field = control;
      return field.willValidate === true && !field.validity.valid;
    }) ?? null;
  }

  // src/rich-text-element.js
  class RichTextElement extends HTMLElement {
    static get observedAttributes() {
      return ["toolbar"];
    }
    constructor() {
      super();
      this._richText = null;
      this._source = null;
      this._options = {};
      this._sourceObserver = null;
      this._revision = 0;
      this._rebuildQueued = false;
      this._readyResolvers = [];
      this.#upgradeProperty("options");
    }
    connectedCallback() {
      const revision = ++this._revision;
      queueMicrotask(() => {
        if (revision !== this._revision || !this.isConnected)
          return;
        this.upgrade();
      });
    }
    disconnectedCallback() {
      const revision = ++this._revision;
      queueMicrotask(() => {
        if (revision !== this._revision || this.isConnected)
          return;
        this.dispose();
      });
    }
    attributeChangedCallback(_name, oldValue, newValue) {
      if (oldValue === newValue || !this._richText)
        return;
      this.#scheduleRebuild();
    }
    get source() {
      return this._source || this.#findSource();
    }
    get richText() {
      return this._richText;
    }
    get options() {
      return { ...this._options };
    }
    set options(value) {
      if (value == null)
        value = {};
      if (typeof value !== "object")
        throw new TypeError("rich-text options must be an object");
      this._options = { ...value };
      if (this._richText)
        this.#scheduleRebuild();
    }
    configure(options = {}) {
      this.options = { ...this._options, ...options };
      return this;
    }
    upgrade() {
      this.#watchSource();
      const source = this.#findSource();
      if (!source) {
        this._richText?.dispose();
        this._richText = null;
        this._source = null;
        return null;
      }
      if (this._richText && this._source === source)
        return this._richText;
      this._richText?.dispose();
      this._source = source;
      this._richText = new RichText(source, this.#resolvedOptions());
      const ready = this._readyResolvers.splice(0);
      for (const resolve of ready)
        resolve(this._richText);
      this.dispatchEvent(new CustomEvent("richtext:ready", {
        bubbles: true,
        detail: { richText: this._richText, source }
      }));
      return this._richText;
    }
    whenReady() {
      if (this._richText)
        return Promise.resolve(this._richText);
      return new Promise((resolve) => this._readyResolvers.push(resolve));
    }
    dispose() {
      this._sourceObserver?.disconnect();
      this._sourceObserver = null;
      this._richText?.dispose();
      this._richText = null;
      this._source = null;
    }
    #findSource() {
      for (const child of this.children) {
        if (child instanceof HTMLTextAreaElement)
          return child;
      }
      return null;
    }
    #watchSource() {
      if (this._sourceObserver)
        return;
      this._sourceObserver = new MutationObserver(() => {
        if (this.isConnected && this.#findSource() !== this._source)
          this.upgrade();
      });
      this._sourceObserver.observe(this, { childList: true });
    }
    #resolvedOptions() {
      const attrs = {};
      if (this.hasAttribute("toolbar"))
        attrs.toolbar = normalizeToolbar(this.getAttribute("toolbar"));
      return { ...attrs, ...this._options };
    }
    #scheduleRebuild() {
      if (this._rebuildQueued)
        return;
      this._rebuildQueued = true;
      queueMicrotask(() => {
        this._rebuildQueued = false;
        if (!this.isConnected || !this._richText)
          return;
        const source = this._source;
        this._richText.dispose();
        this._richText = null;
        this._source = source;
        this.upgrade();
      });
    }
    #upgradeProperty(name) {
      if (!Object.hasOwn(this, name))
        return;
      const value = Reflect.get(this, name);
      Reflect.deleteProperty(this, name);
      Reflect.set(this, name, value);
    }
  }
  function defineRichText() {
    if (!customElements.get("rich-text"))
      customElements.define("rich-text", RichTextElement);
    return RichTextElement;
  }

  // src/define.js
  defineRichText();
})();
