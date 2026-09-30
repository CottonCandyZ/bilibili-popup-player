// Page extensions can render cards and scroll containers in open shadow roots.
// Keep their tree boundaries for queries, but use composed ancestry for input
// and visibility, just as the browser does when rendering them.
export function composedParent(element) {
  return element?.assignedSlot || element?.parentElement || element?.getRootNode?.().host || null;
}

export function composedClosest(element, selector) {
  for (let current = element?.nodeType === 1 ? element : element?.host || element?.parentElement; current; current = composedParent(current)) {
    if (current.matches(selector)) return current;
  }
  return null;
}

export function composedContains(parent, element) {
  for (let current = element; current; current = composedParent(current)) {
    if (current === parent) return true;
  }
  return false;
}

export function getDeepActiveElement(doc) {
  let active = doc.activeElement;
  while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
  return active;
}

export function deepElementFromPoint(root, x, y, ignore) {
  for (const element of root.elementsFromPoint?.(x, y) || []) {
    // ShadowRoot.elementsFromPoint can include ancestors outside this root.
    if ((root.host && element.getRootNode() !== root) || ignore(element)) continue;
    return (element.shadowRoot && deepElementFromPoint(element.shadowRoot, x, y, ignore)) || element;
  }
  return null;
}

export function isRenderedCard(element) {
  if (!element?.isConnected || !element.getClientRects().length) return false;
  const win = element.ownerDocument.defaultView;
  for (let current = element; current; current = composedParent(current)) {
    const style = win.getComputedStyle(current);
    if (current.hidden || current.inert || style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
  }
  return true;
}

export function createPageDomTracker(doc, { isExcluded, onMutation, onScroll }) {
  const roots = new Map();
  const observerOptions = {
    childList: true, subtree: true, characterData: true, attributes: true,
    attributeFilter: ['href', 'title', 'aria-label', 'class', 'style', 'hidden', 'inert', 'src', 'data-src'],
  };
  const scroll = event => { if (!isExcluded(event.target)) onScroll(); };

  function addRoot(root) {
    if (roots.has(root) || isExcluded(root)) return;
    const observer = new MutationObserver(records => {
      onMutation(records);
    });
    observer.observe(root, observerOptions);
    // Scroll events inside a shadow tree do not cross its boundary.
    if (root !== doc) root.addEventListener('scroll', scroll, true);
    roots.set(root, observer);
  }

  function discover(root) {
    addRoot(root);
    const walker = doc.createTreeWalker(root, 1, {
      acceptNode: element => isExcluded(element) ? 2 : 1,
    });
    while (walker.nextNode()) {
      if (walker.currentNode.shadowRoot) discover(walker.currentNode.shadowRoot);
    }
  }

  function refresh() {
    for (const [root, observer] of roots) {
      if (root === doc || root.host.isConnected) continue;
      observer.disconnect();
      root.removeEventListener('scroll', scroll, true);
      roots.delete(root);
    }
    discover(doc);
  }

  return {
    refresh,
    queryAll: selector => [...roots.keys()].flatMap(root => [...root.querySelectorAll(selector)]),
    hasUntrackedRoot: event => event.composedPath().some(node => {
      const root = node?.getRootNode?.();
      return root?.host && !roots.has(root) && !isExcluded(root);
    }),
    disconnect() {
      for (const [root, observer] of roots) {
        observer.disconnect();
        if (root !== doc) root.removeEventListener('scroll', scroll, true);
      }
      roots.clear();
    },
  };
}
