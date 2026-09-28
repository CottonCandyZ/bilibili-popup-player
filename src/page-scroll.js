// With visible root overflow, HTML propagates the body's overflow to the
// viewport. Changing html instead would turn a height:100% body into its own
// scroll container, collapsing the document's scroll range to zero.
export function getViewportOverflowElement(doc) {
  const root = doc.documentElement, body = doc.body;
  const rootStyle = doc.defaultView.getComputedStyle(root);
  if (body && rootStyle.overflowX === 'visible' && rootStyle.overflowY === 'visible' && rootStyle.contain === 'none') {
    const bodyStyle = doc.defaultView.getComputedStyle(body);
    if (bodyStyle.display !== 'none' && bodyStyle.contain === 'none') return body;
  }
  return root;
}

export function lockPageScroll(doc) {
  const element = getViewportOverflowElement(doc);
  const saved = ['overflow-x', 'overflow-y'].map(property => [property, element.style.getPropertyValue(property), element.style.getPropertyPriority(property)]);
  element.style.setProperty('overflow', 'hidden', 'important');
  return () => {
    for (const [property, value, priority] of saved) {
      if (value) element.style.setProperty(property, value, priority);
      else element.style.removeProperty(property);
    }
  };
}
